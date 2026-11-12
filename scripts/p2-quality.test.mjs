import assert from "node:assert/strict";
import {
  NATIVE_SCHEME,
  WEB_ORIGIN,
  buildDeepLink,
  normalizeCommunityTab,
  parseDeepLink,
  parseNotificationTarget,
  routeFromDeepLink,
} from "../src/lib/deepLinks.js";
import {
  canTrack,
  grantAnalyticsConsent,
  isAnalyticsFeatureEnabled,
  readAnalyticsConsent,
  revokeAnalyticsConsent,
  setAnalyticsSink,
  track,
} from "../src/lib/analytics.js";
import {
  OFFLINE_LITE_CAPS,
  cacheFeed,
  enqueueOfflineNote,
  isProbablyOffline,
  readCachedFeed,
  readOfflineNoteQueue,
  dequeueOfflineNotes,
} from "../src/lib/offlineLite.js";
import { getUiStrings, I18N } from "../src/i18n/index.js";

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// ---- Deep links ----
assert.equal(parseDeepLink(null), null);
assert.deepEqual(parseDeepLink("/profile/abc-123"), {
  kind: "profile",
  profileId: "abc-123",
  rawPath: "/profile/abc-123",
});
assert.equal(parseDeepLink("https://243kulture.app/post/p9").kind, "post");
assert.equal(parseDeepLink("https://243kulture.app/post/p9").postId, "p9");
assert.equal(parseDeepLink("/community?tab=messages").communityTab, "messages");
assert.equal(parseDeepLink("/invite/WELCOME").inviteCode, "WELCOME");
assert.equal(parseDeepLink(`${NATIVE_SCHEME}://profile/uid1`).profileId, "uid1");
assert.equal(parseDeepLink(`${NATIVE_SCHEME}://community?tab=amis`).communityTab, "amis");
assert.equal(normalizeCommunityTab("nope"), "feed");

const route = routeFromDeepLink(parseDeepLink("/profile/u1"));
assert.equal(route.screen, "userProfile");
assert.equal(route.profileId, "u1");

assert.equal(
  buildDeepLink({ kind: "profile", profileId: "u1" }),
  `${WEB_ORIGIN}/profile/u1`,
);
assert.equal(
  buildDeepLink({ kind: "invite", inviteCode: "X" }, { mode: "native" }),
  `${NATIVE_SCHEME}://invite/X`,
);

assert.equal(
  parseNotificationTarget({ deep_link: "/community?tab=feed" }).kind,
  "community",
);
assert.equal(
  parseNotificationTarget({ actor_id: "a1" }).profileId,
  "a1",
);

// ---- Analytics (off by default) ----
assert.equal(isAnalyticsFeatureEnabled({}), false);
assert.equal(isAnalyticsFeatureEnabled({ VITE_ANALYTICS_ENABLED: "true" }), true);

const aStore = memStorage();
assert.equal(readAnalyticsConsent(aStore).granted, false);
assert.equal(canTrack({ VITE_ANALYTICS_ENABLED: "true" }, aStore), false);

const seen = [];
setAnalyticsSink((p) => seen.push(p));
assert.equal(track("screen_view", { screen: "home" }, { env: {}, storage: aStore }).reason, "flag_off");

grantAnalyticsConsent(aStore, 1000);
assert.equal(readAnalyticsConsent(aStore).granted, true);
assert.equal(
  track("screen_view", { screen: "home" }, { env: { VITE_ANALYTICS_ENABLED: "true" }, storage: aStore, nowMs: 1001 }).ok,
  true,
);
assert.equal(seen.length, 1);
assert.equal(seen[0].event, "screen_view");

revokeAnalyticsConsent(aStore, 2000);
assert.equal(
  track("share", {}, { env: { VITE_ANALYTICS_ENABLED: "true" }, storage: aStore }).reason,
  "no_consent",
);
setAnalyticsSink(null);

// ---- Offline lite ----
const oStore = memStorage();
cacheFeed(
  [
    { id: "1", text: "hello", author_id: "a", display_name: "Ada", created_at: "t" },
    { id: "2", text: "world", user_id: "b" },
  ],
  oStore,
);
const cached = readCachedFeed(oStore);
assert.equal(cached.posts.length, 2);
assert.equal(cached.posts[0].text, "hello");
assert.equal(cached.posts[0].offline_cached, true);

const q1 = enqueueOfflineNote("note one", oStore, OFFLINE_LITE_CAPS, 10);
assert.equal(q1.ok, true);
assert.equal(enqueueOfflineNote("   ", oStore).ok, false);
assert.equal(readOfflineNoteQueue(oStore).length, 1);
const flushed = dequeueOfflineNotes(oStore);
assert.equal(flushed.length, 1);
assert.equal(readOfflineNoteQueue(oStore).length, 0);

assert.equal(isProbablyOffline({ onLine: false }), true);
assert.equal(isProbablyOffline({ onLine: true }), false);

// Cap queue
const full = memStorage();
for (let i = 0; i < OFFLINE_LITE_CAPS.maxQueuedNotes; i++) {
  assert.equal(enqueueOfflineNote(`n${i}`, full, OFFLINE_LITE_CAPS, i).ok, true);
}
assert.equal(enqueueOfflineNote("overflow", full).reason, "queue_full");

// ---- i18n appearance backfill + getUiStrings merge ----
for (const code of ["nl", "ln", "sw", "lua", "kg", "mongo"]) {
  assert.ok(I18N[code].sec_appearance, `${code} missing sec_appearance`);
  assert.ok(I18N[code].appearance_dark, `${code} missing appearance_dark`);
  assert.ok(I18N[code].share_via, `${code} missing share_via`);
  assert.ok(I18N[code].share_fallback, `${code} missing share_fallback`);
}
const nl = getUiStrings("nl");
assert.equal(typeof nl.sec_appearance, "string");
assert.ok(nl.sec_appearance.length > 0);

console.log("p2-quality.test.mjs OK");
