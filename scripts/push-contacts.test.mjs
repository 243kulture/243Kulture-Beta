import assert from "node:assert/strict";
import {
  PUSH_CAPS,
  canSendPushUnderCaps,
  defaultPushPreferences,
  ensurePushPermission,
  interestPostScore,
  isPushFeatureEnabled,
  readPushPreferences,
  shouldPushInterestPost,
  shouldReengage,
  writePushPreferences,
} from "../src/lib/pushNotifications.js";
import {
  INVITE_CAPS,
  canRunMatchBatch,
  canSendFriendInvite,
  canShowContactsSoftCta,
  ensureContactsPermission,
  isContactsMatchEnabled,
  markContactsDenied,
  normalizeEmail,
  normalizePhoneE164ish,
} from "../src/lib/contactsMatch.js";

// ---- Flags default off (web-safe) ----
assert.equal(isPushFeatureEnabled({}), false);
assert.equal(isPushFeatureEnabled({ VITE_PUSH_ENABLED: "true" }), true);
assert.equal(isContactsMatchEnabled({}), false);
assert.equal(isContactsMatchEnabled({ VITE_CONTACTS_MATCH_ENABLED: "1" }), true);

// ---- Pref defaults: optional families OFF ----
const prefs = defaultPushPreferences();
assert.equal(prefs.messages, true);
assert.equal(prefs.interest_posts, true);
assert.equal(prefs.reengagement, true);
assert.equal(prefs.stories_from_follows, false);
assert.equal(prefs.comment_replies, false);
assert.equal(prefs.mentions, false);
assert.equal(prefs.quiet_digest_mode, false);

const mem = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
})();
writePushPreferences({ master: true, mentions: true }, mem);
const round = readPushPreferences(mem);
assert.equal(round.master, true);
assert.equal(round.mentions, true);
assert.equal(round.stories_from_follows, false);

// ---- Permission requires user intent ----
const blocked = await ensurePushPermission({ userInitiated: false });
assert.equal(blocked.ok, false);
assert.equal(blocked.status, "blocked_no_intent");

const prefOnly = await ensurePushPermission({ userInitiated: true });
assert.equal(prefOnly.ok, true);
assert.ok(["pref_only", "granted"].includes(prefOnly.status));

const contactsBlocked = await ensureContactsPermission({ userInitiated: false });
assert.equal(contactsBlocked.status, "blocked_no_intent");

const contactsIntent = await ensureContactsPermission({ userInitiated: true });
assert.equal(contactsIntent.ok, false);
assert.ok(["flag_off", "unavailable", "denied"].includes(contactsIntent.status));

// ---- Interest score / caps / 6h ----
assert.equal(interestPostScore({ isFollowed: true }), 3);
assert.equal(shouldPushInterestPost({ isFollowed: true }), true);
assert.equal(shouldPushInterestPost({ recentInteraction: true }), false); // +2 < 3

const now = Date.UTC(2026, 10, 11, 12, 0, 0);
const deliveries = Array.from({ length: PUSH_CAPS.maxPerHour }, (_, i) => ({
  createdAtMs: now - i * 1000,
}));
assert.equal(canSendPushUnderCaps(deliveries, now).ok, false);
assert.equal(canSendPushUnderCaps([], now).ok, true);

assert.equal(
  shouldReengage({
    lastOpenedAtMs: now - 7 * 60 * 60 * 1000,
    nowMs: now,
    hasInterestSinceOpen: true,
  }).ok,
  true,
);
assert.equal(
  shouldReengage({
    lastOpenedAtMs: now - 2 * 60 * 60 * 1000,
    nowMs: now,
    hasInterestSinceOpen: true,
  }).reason,
  "opened_recently",
);

// ---- Invite / match anti-spam ----
assert.equal(canSendFriendInvite({ sentTodayCount: 0 }).ok, true);
assert.equal(canSendFriendInvite({ sentTodayCount: INVITE_CAPS.friendInvitesPerDay }).ok, false);
assert.equal(canRunMatchBatch({ batchesThisHour: 0, hashCount: 10 }).ok, true);
assert.equal(canRunMatchBatch({ batchesThisHour: 0, hashCount: 0 }).ok, false);
assert.equal(
  canRunMatchBatch({ batchesThisHour: 0, hashCount: INVITE_CAPS.maxHashesPerBatch + 1 }).reason,
  "batch_size",
);

assert.equal(normalizePhoneE164ish("0812345678"), "+243812345678");
assert.equal(normalizeEmail("  Ada@243.cd "), "ada@243.cd");
assert.equal(normalizeEmail("nope"), null);

markContactsDenied(mem, now);
assert.equal(canShowContactsSoftCta(mem, now + 1000), false);
assert.equal(canShowContactsSoftCta(mem, now + INVITE_CAPS.denySoftCtaCooldownMs + 1), true);

console.log("push-contacts.test.mjs OK");
