/**
 * Community & Profile V2 — smoke checks (no browser).
 * Ensures scoped design tokens + preview helpers stay wired.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "src/App.jsx"), "utf8");
const hero = readFileSync(join(root, "src/components/ProfileHero.jsx"), "utf8");
const fr = JSON.parse(readFileSync(join(root, "src/i18n/fr.json"), "utf8"));
const en = JSON.parse(readFileSync(join(root, "src/i18n/en.json"), "utf8"));
const nl = JSON.parse(readFileSync(join(root, "src/i18n/nl.json"), "utf8"));
const ln = JSON.parse(readFileSync(join(root, "src/i18n/ln.json"), "utf8"));

const PALETTE = ["#0B0D10", "#171A20", "#E9B943", "#F5F5F5", "#A1A6B0"];

for (const hex of PALETTE) {
  assert.ok(app.includes(hex), `App.jsx should include scoped palette token ${hex}`);
  assert.ok(hero.includes(hex) || app.includes(`--cx-`), `hero/system references V2 color space (${hex})`);
}

assert.ok(app.includes(".community-experience"), "community CSS scope");
assert.ok(app.includes(".profile-experience"), "profile CSS scope");

// Jour Kin light theme — Community/Profile follow data-theme (not dark-only)
assert.ok(
  app.includes('html[data-theme="light"] .community-experience') &&
    app.includes('html[data-theme="light"] .profile-experience') &&
    app.includes('html[data-theme="light"] .home-experience'),
  "light theme overrides for community/profile/home experiences"
);
assert.ok(app.includes("--cx-bg: #F7F4EF"), "Jour Kin cream bg for CX light");
assert.ok(app.includes("--cx-surface: #FFFFFF"), "white surface for CX light");
assert.ok(app.includes("--cx-text: #12141A"), "dark text for CX light");
assert.ok(app.includes("--cx-gold: #E9B943"), "gold accent preserved");
assert.ok(
  app.includes('html[data-theme="system"] .community-experience'),
  "system appearance resolves CX light via prefers-color-scheme"
);
assert.ok(hero.includes("profileCoverStyle") && hero.includes("--cx-cover-"), "theme-aware profile covers");
assert.ok(
  /\.nav-fab\s*\{[^}]*background:\s*#E9B943/s.test(app) &&
    /\.nav-fab\s*\{[^}]*color:\s*#0B0D10/s.test(app),
  "create/+ Poste FAB uses brand gold #E9B943 with deep black contrast"
);
assert.ok(app.includes("cx-compose"), "editorial compose zone");
assert.ok(app.includes("cx-post"), "editorial post stream");
assert.ok(app.includes("cx-person"), "people rows without glass cards");
assert.ok(app.includes('capture="environment"'), "post media capture attr preserved");
assert.ok(app.includes("openDirectMessage"), "DM without friendship helper");
assert.ok(app.includes("hideFollow"), "Follow ≠ Friend on profile CTAs");
assert.ok(app.includes('uiPreview") !== "profile"') || app.includes('uiPreview') && app.includes("community"), "QA preview hooks");

assert.ok(hero.includes("profileCoverStyle"), "deterministic cover");
assert.ok(hero.includes("ProfileCtaButton"), "shared CTA");

const requiredKeys = [
  "profile_tab_publications",
  "profile_tab_stories",
  "profile_tab_about",
  "profile_edit",
  "profile_message",
  "profile_grid_empty",
  "profile_stories_empty",
  "profile_open_story",
];
for (const pack of [fr, en, nl, ln]) {
  for (const k of requiredKeys) {
    assert.ok(pack[k], `i18n missing ${k}`);
  }
}

// Home must still own its story section independently (not removed)
assert.ok(app.includes('screen === "home"'), "home screen intact");
assert.ok(app.includes("home-vibe"), "home vibe untouched");

console.log("community-profile-v2.test.mjs: OK");
