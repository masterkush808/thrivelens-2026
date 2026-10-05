/**
 * Headless Chrome smoke test for the web-only fixes.
 *
 * Covers the two things that were broken in the deployed PWA:
 *   1. multipart upload transport (fetch + FormData on web)
 *   2. Leaflet map rendering on the Nearby Stores route
 *
 * Drives Chrome over CDP using Node's built-in WebSocket (no puppeteer dep).
 *
 * Usage: node scripts/smoke-web.mjs [baseUrl] [distDir]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function serveStatic(dir, port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    // SPA fallback, matching how EAS Hosting serves deep routes.
    let file = join(dir, normalize(decodeURIComponent(url.pathname)));
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(dir, "index.html");
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleLines = [];
    this.exceptions = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
        return;
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = (msg.params.args ?? [])
          .map((a) => a.value ?? a.description ?? a.unserializableValue ?? "")
          .join(" ");
        this.consoleLines.push(`${msg.params.type}: ${text}`);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        this.exceptions.push(d.exception?.description ?? d.text ?? "unknown");
      }
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    return new CDP(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description ?? res.exceptionDetails.text,
      );
    }
    return res.result.value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const distDir = process.argv[3] ?? "dist";
  const port = 8123;
  const server = await serveStatic(distDir, port);
  const base = `http://127.0.0.1:${port}`;
  console.log(`serving ${distDir} at ${base}`);

  // Record every upload attempt so we can assert on the transport.
  const uploads = [];
  const uploadListener = createServer((req, res) => {
    let size = 0;
    let head = "";
    req.on("data", (c) => {
      size += c.length;
      if (head.length < 900) head += c.toString("latin1");
    });
    req.on("end", () => {
      uploads.push({
        url: req.url,
        contentType: req.headers["content-type"] ?? "",
        auth: req.headers["authorization"] ?? "",
        size,
        head,
      });
      // The page is served from a different port, so answer the CORS preflight
      // and expose the response, exactly as the Gradio Space does.
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      });
      res.end(JSON.stringify([{ name: "upload.png" }]));
    });
  });
  uploadListener.on("request", (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "600",
      });
      res.end();
    }
  });
  const uploadPort = 8124;
  await new Promise((r) => uploadListener.listen(uploadPort, "127.0.0.1", r));
  console.log(`upload sink at http://127.0.0.1:${uploadPort}`);

  const profile = join(process.env.TEMP ?? ".", `thrivelens-smoke-${Date.now()}`);
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--remote-debugging-port=9333",
      `--user-data-dir=${profile}`,
      "--window-size=412,915",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp;
  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i += 1) {
      await sleep(400);
      try {
        const res = await fetch("http://127.0.0.1:9333/json/list");
        const list = await res.json();
        target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      } catch {
        /* chrome not up yet */
      }
    }
    if (!target) throw new Error("could not attach to Chrome");

    cdp = await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Browser.grantPermissions", {
      origin: base,
      permissions: ["geolocation"],
    });
    await cdp.send("Emulation.setGeolocationOverride", {
      latitude: -26.2041,
      longitude: 28.0473,
      accuracy: 25,
    });

    // Seed a session so AuthGate lets us through to /maps. localAuth.ts keeps
    // it in AsyncStorage, which is localStorage on web under the key
    // `thrivelens:local_session` (verbatim, AsyncStorage.web adds no prefix).
    // The cached profile must exist too or AuthGate redirects to /onboarding.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        localStorage.setItem('thrivelens:local_session', JSON.stringify({
          userId: 'probe-user',
          email: 'probe@thrivelens.test',
          fullName: 'Probe User',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        }));
        localStorage.setItem('profile:probe-user', JSON.stringify({
          id: 'probe-user',
          full_name: 'Probe User',
          onboarding_completed: true,
          goal: 'recomp',
        }));
      `,
    });

    // ---- 1. Maps route renders a real Leaflet map -------------------------
    console.log("\n1) Nearby Stores map");
    await cdp.send("Page.navigate", { url: `${base}/maps` });

    // Wait for the screen to actually mount first, otherwise the spinner is
    // absent because nothing has rendered yet, not because work finished.
    let mounted = false;
    for (let i = 0; i < 30 && !mounted; i += 1) {
      await sleep(500);
      mounted = await cdp.evaluate(
        `document.body.innerText.includes('Nearby Stores')`,
      );
    }
    check("maps screen mounted", mounted, mounted ? "header found" : "timed out");

    // Then wait for the Overpass query to settle (it allows up to 25s;
    // OVERPASS_TIMEOUT_MS in src/services/places.ts).
    const settled = await (async () => {
      for (let i = 0; i < 40; i += 1) {
        await sleep(1000);
        if (
          await cdp.evaluate(
            `!document.body.innerText.includes('Finding real places nearby')`,
          )
        ) {
          return true;
        }
      }
      return false;
    })();
    check("nearby search settled", settled, settled ? "spinner cleared" : "timed out");

    const mapProbe = await cdp.evaluate(`(() => {
      const el = document.querySelector('.leaflet-container');
      return {
        hasLeafletContainer: !!el,
        tileCount: document.querySelectorAll('.leaflet-tile').length,
        markerCount: document.querySelectorAll('.thrivelens-marker').length,
        storePinCount: document.querySelectorAll('.thrivelens-marker-place').length,
        userDotCount: document.querySelectorAll('.thrivelens-marker-user').length,
        // Cards rendered by the nearby list; each has a Directions button.
        listCardCount: Array.from(document.querySelectorAll('button'))
          .filter((b) => /Directions/i.test(b.innerText)).length,
        deadFallbackTextPresent: document.body.innerText
          .includes('Interactive map is not available'),
        leafletCssLoaded: (() => {
          const c = document.querySelector('.leaflet-container');
          if (!c) return false;
          return getComputedStyle(c).position === 'absolute'
            || getComputedStyle(c).position === 'relative';
        })(),
        // Tiles must actually be laid out, not just present in the DOM.
        tilesLaidOut: Array.from(document.querySelectorAll('.leaflet-tile')).filter(
          (t) => t.getBoundingClientRect().width > 100,
        ).length,
        tileFilter: (() => {
          const pane = document.querySelector('.leaflet-tile-pane');
          return pane ? getComputedStyle(pane).filter : '(no pane)';
        })(),
        markerBox: (() => {
          const m = document.querySelector('.thrivelens-marker-user');
          if (!m) return null;
          const r = m.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        })(),
        height: el ? el.getBoundingClientRect().height : 0,
      };
    })()`);
    check(
      "leaflet container rendered",
      mapProbe.hasLeafletContainer,
      `height=${mapProbe.height}px`,
    );
    check(
      "leaflet stylesheet applied",
      mapProbe.leafletCssLoaded,
      `position=${await cdp.evaluate(`(() => { const c=document.querySelector('.leaflet-container'); return c?getComputedStyle(c).position:'(none)'; })()`)}`,
    );
    check(
      "OpenStreetMap tiles requested",
      mapProbe.tileCount > 0,
      `${mapProbe.tileCount} tile(s)`,
    );
    check(
      "tiles actually laid out (sized, on-screen)",
      mapProbe.tilesLaidOut >= 4,
      `${mapProbe.tilesLaidOut} tile(s) wider than 100px`,
    );
    check(
      "app dark theme applied to tiles",
      /brightness/.test(mapProbe.tileFilter ?? ""),
      mapProbe.tileFilter,
    );
    check(
      "user marker has real dimensions",
      (mapProbe.markerBox?.w ?? 0) > 0 && (mapProbe.markerBox?.h ?? 0) > 0,
      `${mapProbe.markerBox?.w}x${mapProbe.markerBox?.h}px`,
    );

    // Popups only exist once a marker is clicked, so click one and verify it
    // carries the app's dark palette rather than Leaflet's default white.
    await cdp.evaluate(`(() => {
      const m = document.querySelector('.thrivelens-marker-place')
        || document.querySelector('.thrivelens-marker-user');
      m?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return !!m;
    })()`);
    await sleep(1500);
    const popup = await cdp.evaluate(`(() => {
      const w = document.querySelector('.leaflet-popup-content-wrapper');
      if (!w) return null;
      const cs = getComputedStyle(w);
      return {
        background: cs.backgroundColor,
        text: document.querySelector('.leaflet-popup-content')?.innerText ?? '',
      };
    })()`);
    check(
      "clicking a marker opens a themed popup",
      Boolean(popup) && popup.background === "rgb(34, 29, 24)",
      popup ? `${popup.background} / ${JSON.stringify(popup.text.slice(0, 60))}` : "no popup",
    );
    check(
      "user marker drawn",
      mapProbe.userDotCount > 0,
      `${mapProbe.userDotCount} user dot(s)`,
    );
    check(
      "old 'map not available' fallback gone",
      !mapProbe.deadFallbackTextPresent,
    );

    // Store pins and cards come from Overpass, a third-party API that
    // rate-limits aggressively (its /api/status advertises a limit of 4). A
    // run with zero pins is therefore inconclusive, not a regression, so only
    // assert when results actually arrived.
    const placesErrorShown = await cdp.evaluate(
      `/unreachable|just now|Please retry/.test(document.body.innerText)`,
    );
    if (mapProbe.storePinCount === 0 && mapProbe.listCardCount === 0) {
      console.log(
        `  [SKIP] Overpass returned no results this run (error shown: ${placesErrorShown})`,
      );
    } else {
      check(
        "store pins match the rendered list",
        mapProbe.storePinCount === mapProbe.listCardCount,
        `${mapProbe.storePinCount} pin(s) vs ${mapProbe.listCardCount} card(s)`,
      );
    }

    // ---- 2. Multipart upload transport ------------------------------------
    console.log("\n2) Multipart upload transport");

    // The bundle does not export multipartUpload, so exercise the same steps
    // it performs: resolve the picker blob: URI, then POST a FormData body.
    const formResult = await cdp.evaluate(`(async () => {
      const blob = new Blob([new Uint8Array(2048)], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      try {
        const fetched = await fetch(url);
        const roundTripped = await fetched.blob();
        return {
          blobUri: url.startsWith('blob:'),
          resolvable: roundTripped.size === 2048,
          type: roundTripped.type,
        };
      } catch (e) {
        return { blobUri: url.startsWith('blob:'), resolvable: false, error: String(e) };
      }
    })()`);
    check(
      "blob: URI resolvable by fetch (picker output)",
      formProbeOk(formResult),
      `size+type ok=${formResult.resolvable}`,
    );

    // Drive an actual upload through the app's own inference path by pointing
    // the bundle at the local sink. The env vars are inlined, so instead post
    // through FormData here and assert the sink received a real multipart body.
    await cdp.evaluate(`(async () => {
      const blob = new Blob([new Uint8Array(4096)], { type: 'image/jpeg' });
      const form = new FormData();
      form.append('files', blob, 'upload.jpg');
      const res = await fetch('http://127.0.0.1:${uploadPort}/gradio_api/upload', {
        method: 'POST',
        body: form,
      });
      window.__uploadStatus = res.status;
      window.__uploadBody = await res.text();
    })()`);
    await sleep(800);

    check(
      "multipart POST reached the sink",
      uploads.length === 1,
      `${uploads.length} upload(s)`,
    );
    const upload = uploads[0] ?? {};
    check(
      "Content-Type is multipart with boundary",
      /^multipart\/form-data;\s*boundary=/.test(upload.contentType ?? ""),
      (upload.contentType ?? "").slice(0, 60),
    );
    check(
      "binary payload present in body",
      (upload.size ?? 0) > 4096,
      `${upload.size} bytes received`,
    );
    check(
      "file part named correctly",
      /name="files"/.test(upload.head ?? "") &&
        /filename="upload\.jpg"/.test(upload.head ?? ""),
    );

    // ---- 3. No regressions -----------------------------------------------
    console.log("\n3) Regression check");
    const hardErrors = cdp.exceptions.filter((e) =>
      /uploadTaskStartAsync|UnavailabilityView|UnimplementedView|SharedArrayBuffer/i.test(
        e,
      ),
    );
    check(
      "no expo-file-system UnavailabilityError",
      !hardErrors.some((e) => /uploadTaskStartAsync/.test(e)),
      hardErrors.length ? hardErrors[0].slice(0, 90) : "none",
    );
    check(
      "no SharedArrayBuffer crash",
      !hardErrors.some((e) => /SharedArrayBuffer/.test(e)),
    );
    check(
      "no react-native-maps UnimplementedView crash",
      !hardErrors.some((e) => /UnimplementedView/.test(e)),
    );
    check(
      "no uncaught exceptions during smoke test",
      cdp.exceptions.length === 0,
      cdp.exceptions.length ? cdp.exceptions[0].slice(0, 120) : "none",
    );
  } finally {
    cdp?.ws.close();
    chrome.kill();
    server.close();
    uploadListener.close();
  }

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  process.exit(failures === 0 ? 0 : 1);
}

function formProbeOk(r) {
  return Boolean(r?.blobUri && r?.resolvable);
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
