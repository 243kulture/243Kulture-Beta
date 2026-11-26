/**
 * Home Premium Editorial — smoke checks (no browser).
 * Ensures .home-experience scope + theme tokens + preview stay wired.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "src/App.jsx"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const PALETTE = ["#0B0D10", "#171A20", "#E9B943", "#F5F5F5", "#A1A6B0"];
for (const hex of PALETTE) {
  assert.ok(app.includes(hex), `App.jsx should include palette token ${hex}`);
}

assert.ok(app.includes(".home-experience"), "home CSS scope");
assert.ok(app.includes('className="content home-experience"'), "home content wrapped in home-experience");

assert.ok(
  app.includes('html[data-theme="light"] .home-experience'),
  "light theme overrides for home experience"
);
assert.ok(
  app.includes('html[data-theme="system"] .home-experience'),
  "system appearance resolves home light via prefers-color-scheme"
);
assert.ok(app.includes("--cx-bg: #F7F4EF"), "Jour Kin cream bg shared with CX");
assert.ok(app.includes("--cx-gold: #E9B943"), "brand gold accent preserved");

assert.ok(app.includes("home-vibe"), "home vibe CTA preserved");
assert.ok(app.includes('setFeedMode("abonnements")'), "Publication CTA keeps Abonnements-first path");
assert.ok(app.includes("story-section"), "home stories section intact");
assert.ok(app.includes("daily-action"), "daily action block intact");
assert.ok(app.includes("openStoryCreate"), "story create reachable from home");

assert.ok(
  app.includes('preview === "home"') || app.includes('uiPreview") === "home"') || app.includes('preview !== "home"'),
  "QA preview hook for home"
);
assert.ok(app.includes('setScreen("home")'), "home preview sets home screen");
assert.ok(
  app.includes('p === "profile" || p === "community" || p === "home"'),
  "gate + auth listeners skip redirects for home preview"
);

assert.ok(
  String(pkg.scripts?.test || "").includes("home-editorial.test.mjs"),
  "npm test runs home-editorial smoke"
);

// Community/Profile scopes must remain (no collateral removal)
assert.ok(app.includes(".community-experience"), "community scope untouched");
assert.ok(app.includes(".profile-experience"), "profile scope untouched");

console.log("home-editorial.test.mjs: OK");
