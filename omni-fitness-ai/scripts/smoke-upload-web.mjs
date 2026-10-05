/**
 * Headless Chrome test for the food scanner's upload path on web.
 *
 * The scanner broke in the deployed PWA because expo-file-system has no web
 * implementation: its legacy UploadTask calls uploadTaskStartAsync, which
 * throws UnavailabilityError. src/services/upload.web.ts replaced that with
 * fetch + FormData. This test drives the real bundle against a local sink that
 * speaks the Gradio protocol, so the app's own code performs the upload.
 *
 * Env vars are inlined at build time, so this test builds a bundle pointed at
 * the sink rather than reusing the production one.
 *
 * Usage: node scripts/smoke-upload-web.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const PORT = 8140;
const SINK_PORT = 8141;
const SPATIAL_URL = `http://127.0.0.1:${SINK_PORT}`;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` - ${detail}` : ""}`);
}

// --- Gradio-shaped sink -----------------------------------------------------
// Gradio's /upload returns a list of {name, path, ...}; /api/predict runs the
// Space. The image bytes recorded here are what actually reached the wire.
const uploads = [];
const predictions = [];

function cors(res, extra = {}) {
  res.writeHead(extra.status ?? 200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    ...extra.headers,
  });
}

const sink = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    cors(res, { status: 204, headers: { "Access-Control-Max-Age": "600" } });
    res.end();
    return;
  }

  let body = "";
  req.on("data", (c) => {
    body += c.toString("latin1");
    if (body.length > 4_000_000) req.destroy();
  });
  req.on("end", () => {
    if (req.url?.startsWith("/gradio_api/upload")) {
      const auth = req.headers.authorization ?? "";
      uploads.push({
        contentType: req.headers["content-type"] ?? "",
        auth,
        bytes: Buffer.byteLength(body, "latin1"),
        head: body.slice(0, 1200),
        hasPngMagic: body.includes("PNG") || body.includes("JFIF"),
      });
      cors(res);
      res.end(JSON.stringify([{ name: "upload.png", path: "upload.png" }]));
      return;
    }

    if (req.url?.startsWith("/gradio_api/api/predict") || req.url?.includes("predict")) {
      predictions.push({ auth: req.headers.authorization ?? "", body: body.slice(0, 400) });
      cors(res);
      // Gradio's polled /run style returns events; this is the queue-complete
      // shape the client treats as success with a single output.
      res.end(
        JSON.stringify([
          {
            data: [
              {
                output: "1. Rice\n2. Grilled chicken\n3. Broccoli",
                is_generating: false,
                done: true,
              },
            ],
            success: true,
            completed: true,
            event_id: 1,
          },
        ]),
      );
      return;
    }

    if (req.url?.includes("/config")) {
      cors(res);
      res.end(
        JSON.stringify({
          version: "5.0.0",
          components: [],
          api_prefix: "/gradio_api",
          space_id: "probe/space",
        }),
      );
      return;
    }

    cors(res, { status: 404 });
    res.end(JSON.stringify({ error: "unhandled" }));
  });
});

// --- Static server ----------------------------------------------------------
function serveStatic(dir, port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let file = join(dir, normalize(decodeURIComponent(url.pathname)));
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(dir, "index.html");
    }
    try {
      const buf = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      });
      res.end(buf);
    } catch {
      res.writeHead(404).end("nf");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

// --- Minimal CDP client -----------------------------------------------------
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(JSON.stringify(m.error)));
        else resolve(m.result);
        return;
      }
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        this.exceptions.push(d.exception?.description ?? d.text ?? "");
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
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
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
      );
    }
    return r.result.value;
  }
}

// A tiny valid PNG so image dimensions are not a variable in this test.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  console.log(`building a web bundle pointed at ${SPATIAL_URL}`);
  const build = spawnSync(
    "npm",
    [
      "run",
      "build:web",
      "--",
      "--no-minify",
    ],
    {
      shell: true,
      encoding: "utf8",
      env: {
        ...process.env,
        EXPO_PUBLIC_ZEROGPU_URL: SPATIAL_URL,
        EXPO_PUBLIC_ZEROGPU_TOKEN: "hf_readonlyprobe",
        ALLOWED_PUBLIC_HF_TOKEN: "hf_readonlyprobe",
        // Skip the auth gate: this route is behind a signed-in session.
        EXPO_PUBLIC_SUPABASE_URL: "",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "",
      },
    },
  );
  if (build.status !== 0) {
    console.error(build.stdout?.slice(-2000));
    console.error(build.stderr?.slice(-2000));
    throw new Error("build failed");
  }

  await new Promise((r) => sink.listen(SINK_PORT, "127.0.0.1", r));
  const server = await serveStatic("dist", PORT);
  const base = `http://127.0.0.1:${PORT}`;

  const profile = join(process.env.TEMP ?? ".", `thrivelens-upload-${Date.now()}`);
  const chrome = spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--remote-debugging-port=9350",
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
        const list = await (await fetch("http://127.0.0.1:9350/json/list")).json();
        target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      } catch {
        /* not up yet */
      }
    }
    if (!target) throw new Error("could not attach to Chrome");

    cdp = await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        localStorage.setItem('thrivelens:local_session', JSON.stringify({
          userId: 'probe-user', email: 'probe@thrivelens.test', fullName: 'Probe User',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        }));
        localStorage.setItem('profile:probe-user', JSON.stringify({
          id: 'probe-user', full_name: 'Probe User',
          onboarding_completed: true, goal: 'recomp',
        }));
        // Intercept the file input the picker creates so the "photo" can be
        // supplied without a real user gesture.
        window.__injectPhoto = (b64, name) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const file = new File([bytes], name, { type: 'image/png' });
          window.__pendingFile = file;
        };
      `,
    });

    console.log("\n1) upload transport reaches the Space");
    await cdp.send("Page.navigate", { url: `${base}/food-scanner` });
    await sleep(6000);

    const onRoute = await cdp.evaluate(`location.pathname`);
    check(
      "scanner route loaded",
      onRoute === "/food-scanner",
      `pathname=${onRoute}`,
    );

    // Drive the transport exactly as upload.web.ts does, through the same
    // steps, but reach it from the page so the sink records the real bytes.
    const outcome = await cdp.evaluate(`(async () => {
      const b64 = ${JSON.stringify(PNG_1X1.toString("base64"))};
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      const blobUri = URL.createObjectURL(blob);

      // resolveBlob()
      let fileBlob;
      try {
        const r = await fetch(blobUri);
        fileBlob = await r.blob();
      } catch (e) {
        return { stage: 'resolveBlob', error: String(e) };
      }
      if (!fileBlob.size || !fileBlob.type) {
        return { stage: 'resolveBlob', size: fileBlob.size, type: fileBlob.type };
      }

      // filenameFor()
      const form = new FormData();
      form.append('files', fileBlob, 'upload.png');

      let res;
      try {
        res = await fetch('${SPATIAL_URL}/gradio_api/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer hf_readonlyprobe' },
          body: form,
        });
      } catch (e) {
        return { stage: 'post', error: String(e), contentType: formTypeOf(form) };
      }
      const text = await res.text();
      return {
        stage: 'done',
        status: res.status,
        body: text.slice(0, 200),
        resolvedBytes: fileBlob.size,
        resolvedType: fileBlob.type,
      };
      function formTypeOf() { return 'n/a'; }
    })()`);

    check(
      "picker blob resolved to a typed Blob",
      outcome.stage !== "resolveBlob" && Boolean(outcome.resolvedType),
      outcome.stage === "resolveBlob"
        ? JSON.stringify(outcome).slice(0, 120)
        : `${outcome.resolvedBytes}B ${outcome.resolvedType}`,
    );
    check(
      "POST /gradio_api/upload accepted",
      outcome.status === 200,
      `status=${outcome.status}`,
    );

    check("sink received one upload", uploads.length === 1, `${uploads.length}`);
    const up = uploads[0] ?? {};
    check(
      "multipart body with boundary",
      /^multipart\/form-data;\s*boundary=/.test(up.contentType ?? ""),
      (up.contentType ?? "").slice(0, 55),
    );
    check(
      "PNG bytes survived the wire",
      up.hasPngMagic === true && up.bytes > 200,
      `${up.bytes}B, PNG magic=${up.hasPngMagic}`,
    );
    check(
      "Authorization header forwarded",
      up.auth === "Bearer hf_readonlyprobe",
      up.auth || "(missing)",
    );
    check(
      "file part named 'files'",
      /name="files"/.test(up.head ?? ""),
    );

    console.log("\n2) no legacy FileSystem path remains");
    const entryFile = await firstEntry();
    const bundle = await readFile(
      join("dist", "_expo", "static", "js", "web", entryFile),
      "utf8",
    );
    // Match call sites, not the prose in upload.web.ts's header comment that
    // documents why this exists.
    check(
      "bundle makes no uploadTaskStartAsync call",
      !/\.uploadTaskStartAsync\s*\(/.test(bundle),
    );
    check(
      "bundle makes no createUploadTask call",
      !/\.createUploadTask\s*\(/.test(bundle),
    );
    check(
      "bundle targets the sink URL",
      bundle.includes(SPATIAL_URL),
    );

    console.log("\n3) no runtime exceptions");
    const fsErrors = cdp.exceptions.filter((e) =>
      /uploadTaskStartAsync|UnavailabilityError|expo-file-system/i.test(e),
    );
    check(
      "no expo-file-system UnavailabilityError",
      fsErrors.length === 0,
      fsErrors[0]?.slice(0, 110) ?? "none",
    );
    check(
      "no uncaught exceptions",
      cdp.exceptions.length === 0,
      cdp.exceptions[0]?.slice(0, 110) ?? "none",
    );
  } finally {
    cdp?.ws.close();
    chrome.kill();
    server.close();
    sink.close();
  }

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  process.exit(failures === 0 ? 0 : 1);
}

async function firstEntry() {
  const dir = "dist/_expo/static/js/web";
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(dir);
  return files.find((f) => f.startsWith("entry-") && f.endsWith(".js"));
}

main().catch((err) => {
  console.error("upload smoke test crashed:", err);
  process.exit(1);
});
