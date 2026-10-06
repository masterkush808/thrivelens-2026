#!/usr/bin/env node
/**
 * Fails the build if any credential-shaped value reaches the web bundle.
 *
 * Why this exists: Expo inlines every EXPO_PUBLIC_* variable into the JS
 * bundle at build time. Anything prefixed that way is public the moment the
 * app is deployed. This script scans the built output for credential patterns
 * so a secret can never be published again.
 *
 * Usage:
 *   node scripts/check-bundle-secrets.mjs [distDir]
 *
 * Exit codes: 0 = clean, 1 = leak detected, 2 = nothing to scan.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SCAN_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".json",
  ".webmanifest",
  ".css",
  ".map",
]);

// Credential shapes. Deliberately tight to avoid false positives on
// hashed asset filenames and base64 image data.
const RULES = [
  {
    name: "Hugging Face access token",
    pattern: /hf_[A-Za-z0-9]{30,}/,
  },
  {
    name: "Expo access token",
    pattern: /\bey[A-Za-z0-9_-]{30,}\b/,
  },
  {
    name: "OpenAI-style secret key",
    pattern: /\bsk-[A-Za-z0-9]{32,}\b/,
  },
  {
    name: "AWS access key id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    name: "Private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    name: "Inlined Authorization Bearer header",
    pattern: /Authorization["']?\s*[:=]\s*["']Bearer\s+[A-Za-z0-9._-]{20,}/i,
  },
  {
    name: "Inlined X-API-Key credential",
    pattern: /X-API-Key["']?\s*[:=]\s*["'][A-Za-z0-9._-]{16,}/i,
  },
  {
    // A non-empty literal assigned to an EXPO_PUBLIC_ *secret-sounding* name.
    name: "EXPO_PUBLIC_ secret-shaped variable inlined",
    pattern: /EXPO_PUBLIC_(?:[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE)[A-Z0-9_]*)/,
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      yield* walk(full);
    } else if (SCAN_EXTENSIONS.has(extname(entry).toLowerCase())) {
      yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// Explicit, audited exception.
//
// The owner has chosen to ship a Hugging Face READ token in the bundle to lift
// the ZeroGPU anonymous quota ceiling. That is a deliberate availability
// trade-off, not an oversight, so the scanner must not silently block it.
//
// The safety of that decision rests entirely on the token being READ-ONLY and
// Space-scoped. A `write` token in a public bundle would let any visitor push
// to or delete the Hugging Face account, so the value below is checked against
// that requirement at build time and a `write` token fails the build.
//
// Remove ALLOWED_PUBLIC_HF_TOKEN to return to the strict no-tokens-in-bundle
// policy.
// ---------------------------------------------------------------------------
const ALLOWED_PUBLIC_HF_TOKEN = process.env.ALLOWED_PUBLIC_HF_TOKEN ?? "";
const ALLOWED_PUBLIC_GOOGLE_MAPS_KEYS = [
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
].filter((key) => key && /^AIza[0-9A-Za-z_-]{35}$/.test(key));

async function assertAllowedTokenIsReadOnly(token) {
  if (!token) return;
  let response;
  try {
    response = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error(`✖ Could not verify the allowed HF token: ${error.message}`);
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`✖ ALLOWED_PUBLIC_HF_TOKEN is not valid (HTTP ${response.status}).`);
    process.exit(1);
  }
  const identity = await response.json();
  const role = identity?.auth?.accessToken?.role;
  if (role !== "read") {
    console.error(
      `✖ ALLOWED_PUBLIC_HF_TOKEN has "${role}" access. Only a READ token may be\n` +
        "  shipped in a public bundle. A write token would let any visitor modify\n" +
        "  the Hugging Face account. Generate a read-scoped token and retry.\n",
    );
    process.exit(1);
  }
  console.log(`✔ Allowed public HF token verified as read-scoped (account: ${identity.name}).`);
}

await assertAllowedTokenIsReadOnly(ALLOWED_PUBLIC_HF_TOKEN);

const target = process.argv[2] ?? "dist";

let files = [];
try {
  files = [...walk(target)];
} catch {
  console.error(`✖ Cannot read "${target}". Build the app first: npx expo export --platform web`);
  process.exit(2);
}

if (files.length === 0) {
  console.error(`✖ No scannable files under "${target}".`);
  process.exit(2);
}

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match) {
      // An explicitly allowed, read-scoped token is the one accepted exception.
      if (ALLOWED_PUBLIC_HF_TOKEN && match[0].includes(ALLOWED_PUBLIC_HF_TOKEN)) {
        continue;
      }
      // Browser-restricted Google Maps keys are public identifiers required by
      // the web SDK. Only the explicitly configured maps/places keys qualify.
      if (
        rule.name === "Google API key" &&
        ALLOWED_PUBLIC_GOOGLE_MAPS_KEYS.includes(match[0])
      ) {
        continue;
      }
      // Never echo the credential itself.
      const at = text.indexOf(match[0]);
      findings.push({ file, rule: rule.name, line: text.slice(0, at).split("\n").length });
    }
  }
}

if (findings.length > 0) {
  console.error(`\n✖ SECRET LEAK DETECTED in ${findings.length} place(s):\n`);
  for (const f of findings) {
    console.error(`   ${f.file}:${f.line}  ${f.rule}`);
  }
  console.error(
    "\nAny EXPO_PUBLIC_* value is inlined into the public bundle. Move the\n" +
      "credential server-side and reference it by URL/secret name only.\n",
  );
  process.exit(1);
}

console.log(`✔ No credential patterns in ${files.length} built file(s) under ${target}/`);
