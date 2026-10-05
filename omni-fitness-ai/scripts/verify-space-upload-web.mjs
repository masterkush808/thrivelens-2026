/**
 * End-to-end check of the real deployed path: upload a photo from an actual
 * browser page to the live ZeroGPU Space, exactly as upload.web.ts does.
 *
 * This is the one test that proves CORS and the multipart body work against the
 * real Space rather than a local stub. It performs the upload only, never an
 * inference run, so it does not consume ZeroGPU quota.
 *
 * Usage: node scripts/verify-space-upload-web.mjs
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8170;

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Recover the URL/token from the local gitignored .env, the same values that
// are inlined into the deployed bundle. Nothing is printed.
async function readEnv() {
  const raw = await readFile(".env", "utf8");
  const get = (k) => raw.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
  const url = get("EXPO_PUBLIC_ZEROGPU_URL");
  const token = get("EXPO_PUBLIC_ZEROGPU_TOKEN");
  if (!url || !token) {
    throw new Error("missing EXPO_PUBLIC_ZEROGPU_URL / _TOKEN in .env");
  }
  return { url, token };
}

const server = (await import("node:http")).createServer(async (req, res) => {
  try {
    const body = await readFile("dist/index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(500).end("no dist/index.html - run npm run build:web first");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const { url: spaceUrl, token } = await readEnv();

const profile = `${process.env.TEMP}\\thrivelens-space-${Date.now()}`;
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--remote-debugging-port=9370",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let target = null;
for (let i = 0; i < 40 && !target; i += 1) {
  await sleep(400);
  try {
    const list = await (await fetch("http://127.0.0.1:9370/json/list")).json();
    target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  } catch {}
}
if (!target) {
  console.error("could not attach to Chrome");
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
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
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
await sleep(3000);

console.log(`uploading a 1x1 PNG from a browser to ${spaceUrl} (no inference run)`);
const out = await send("Runtime.evaluate", {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(PNG_1X1.toString("base64"))}), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const form = new FormData();
    form.append('files', blob, 'upload.jpg');
    try {
      const res = await fetch(${JSON.stringify(`${spaceUrl}/gradio_api/upload`)}, {
        method: 'POST',
        headers: { Authorization: 'Bearer ${token}' },
        body: form,
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, type: res.headers.get('content-type'), body: text.slice(0, 200) };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  })()`,
});

const r = out.result?.result?.value;
ws.close();
chrome.kill();
server.close();

if (!r) {
  console.error("no result:", JSON.stringify(out).slice(0, 400));
  process.exit(1);
}

let parsed = null;
try {
  parsed = JSON.parse(r.body);
} catch {}

const filePath =
  Array.isArray(parsed) && typeof parsed[0] === "string" ? parsed[0] : null;

const checks = [
  ["CORS allowed the cross-origin POST", r.ok && r.status === 200, `status=${r.status}`],
  ["multipart body accepted by the Space", Array.isArray(parsed), r.type ?? ""],
  [
    "response is the path inference.ts expects",
    typeof filePath === "string" && filePath.startsWith("/"),
    filePath ?? r.error ?? r.body?.slice(0, 80),
  ],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} - ${detail}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
