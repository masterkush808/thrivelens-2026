/**
 * Captures a screenshot of a route with an authenticated session seeded, using
 * headless Chrome over CDP. Used to eyeball the Leaflet map after the web fix.
 *
 * Usage: node scripts/shoot-route.mjs <route> <out.png> [distDir]
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const route = process.argv[2] ?? "/";
const out = process.argv[3] ?? "shot.png";
const distDir = process.argv[4] ?? "dist";
const port = 8160;
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  let file = join(distDir, normalize(decodeURIComponent(url.pathname)));
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(distDir, "index.html");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("nf");
  }
});
await new Promise((r) => server.listen(port, "127.0.0.1", r));

const profile = join(process.env.TEMP ?? ".", `shoot-${Date.now()}`);
const chrome = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--remote-debugging-port=9360",
    `--user-data-dir=${profile}`,
    "--window-size=412,915",
    "--force-device-scale-factor=2",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let target = null;
for (let i = 0; i < 40 && !target; i += 1) {
  await sleep(400);
  try {
    const list = await (await fetch("http://127.0.0.1:9360/json/list")).json();
    target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  } catch {}
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Browser.grantPermissions", {
  origin: `http://127.0.0.1:${port}`,
  permissions: ["geolocation"],
});
await send("Emulation.setGeolocationOverride", {
  latitude: -26.2041,
  longitude: 28.0473,
  accuracy: 25,
});
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    localStorage.setItem('thrivelens:local_session', JSON.stringify({
      userId: 'probe-user', email: 'probe@thrivelens.test', fullName: 'Probe User',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }));
    localStorage.setItem('profile:probe-user', JSON.stringify({
      id: 'probe-user', full_name: 'Probe User', onboarding_completed: true, goal: 'recomp',
    }));
  `,
});
await send("Page.navigate", { url: `http://127.0.0.1:${port}${route}` });

// Let the map settle: tiles are third-party requests.
for (let i = 0; i < 20; i += 1) await sleep(1000);

const shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile(out, Buffer.from(shot.data, "base64"));
console.log(`wrote ${out}`);

ws.close();
chrome.kill();
server.close();
process.exit(0);
