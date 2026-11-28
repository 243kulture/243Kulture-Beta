#!/usr/bin/env node
/**
 * Live smoke against local server (default http://127.0.0.1:4321).
 * Requires DOWNLOAD_SESSION_SECRET + INVITE_HASH_ALLOWLIST in env.
 */
import { createHash } from "crypto";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4321";
const code = process.env.SMOKE_INVITE || "BETA1TEST";
const name = process.env.SMOKE_NAME || "Léa";

function hash(c) {
  return createHash("sha256").update(c.trim()).digest("hex");
}

async function main() {
  const ungated = await fetch(`${base}/downloads/jovatax-beta.apk`);
  if (ungated.status !== 404) {
    throw new Error(`ungated APK expected 404 got ${ungated.status}`);
  }

  const unauth = await fetch(`${base}/api/download/android`);
  if (unauth.status !== 401 && unauth.status !== 503) {
    throw new Error(`unauth download expected 401/503 got ${unauth.status}`);
  }

  const wrong = await fetch(`${base}/api/gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "WRONGCODE99", name: "Test" }),
  });
  if (wrong.status !== 401 && wrong.status !== 503) {
    throw new Error(`wrong invite expected 401/503 got ${wrong.status}`);
  }

  const gate = await fetch(`${base}/api/gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!gate.ok) {
    throw new Error(
      `gate failed ${gate.status} (need allowlist hash ${hash(code)})`,
    );
  }
  const cookie = gate.headers.getSetCookie?.()?.[0] || gate.headers.get("set-cookie");
  if (!cookie) throw new Error("no session cookie");

  const dl = await fetch(`${base}/api/download/android`, {
    headers: { Cookie: cookie.split(";")[0] },
  });
  if (dl.status !== 200) {
    throw new Error(`authed download expected 200 got ${dl.status}`);
  }
  const buf = Buffer.from(await dl.arrayBuffer());
  console.log(
    `PASS — ungated 404 · wrong invite ${wrong.status} · authed APK ${buf.length} B`,
  );
}

main().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
