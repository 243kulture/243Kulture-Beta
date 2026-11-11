/**
 * Push notification client scaffold — consent-first, flag-gated.
 * No FCM/APNs secrets. Dynamic Capacitor import; Web/PWA never degraded.
 *
 * MVP families (when server dispatch ships): DMs, interest posts, 6h re-engage.
 * Optional later (defaults OFF): stories_from_follows, comment_replies, mentions, quiet_digest.
 *
 * @see docs plan: PUSH_NOTIFICATIONS_PLAN.md / PERMISSIONS_AND_CONTACTS.md
 */

export const PUSH_CONSENT = {
  why:
    "243Kulture peut t’alerter pour les messages privés, les posts qui t’intéressent vraiment, et un rappel si tu n’as pas ouvert l’app depuis 6 h et que des comptes suivis ont publié.",
  settingsHint:
    "Tu peux modifier cette autorisation à tout moment dans Réglages → Applications → 243Kulture → Notifications.",
  deniedKeepsAppUsable:
    "Sans push, tu gardes le centre de notifications dans l’app. Rien n’est cassé.",
};

const LS_PREF = "kulture243_push_pref_v1";
const LS_PREAMBLE = "kulture243_push_preamble_seen_v1";

/** Feature flag — off until FCM/APNs secrets + native shells ready. */
export function isPushFeatureEnabled(env = import.meta.env) {
  const raw = env?.VITE_PUSH_ENABLED;
  return raw === true || raw === "true" || raw === "1";
}

export function defaultPushPreferences() {
  return {
    master: false,
    messages: true,
    interest_posts: true,
    reengagement: true,
    // Optional later — never MVP defaults
    stories_from_follows: false,
    comment_replies: false,
    mentions: false,
    quiet_digest_mode: false,
  };
}

export function readPushPreferences(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(LS_PREF);
    if (!raw) return defaultPushPreferences();
    const parsed = JSON.parse(raw);
    return { ...defaultPushPreferences(), ...parsed };
  } catch {
    return defaultPushPreferences();
  }
}

export function writePushPreferences(prefs, storage = defaultStorage()) {
  const next = { ...defaultPushPreferences(), ...prefs };
  try {
    storage?.setItem?.(LS_PREF, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export function hasSeenPushPreamble(storage = defaultStorage()) {
  try {
    return storage?.getItem?.(LS_PREAMBLE) === "1";
  } catch {
    return false;
  }
}

export function markPushPreambleSeen(storage = defaultStorage()) {
  try {
    storage?.setItem?.(LS_PREAMBLE, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Request OS push permission — ONLY when userInitiated === true.
 * Never call from cold start / initNativeShell.
 */
export async function ensurePushPermission({ userInitiated = false } = {}) {
  if (!userInitiated) {
    return {
      ok: false,
      status: "blocked_no_intent",
      message: "Push permission only on user intent.",
    };
  }

  if (!isPushFeatureEnabled()) {
    // Preference-only path: no OS prompt, Web undegraded
    return {
      ok: true,
      status: "pref_only",
      via: "flag-off",
      message: PUSH_CONSENT.why,
    };
  }

  const native = await tryNativePushPermission();
  if (native) return native;

  // Web Push optional — not enabled in MVP scaffold
  return {
    ok: true,
    status: "pref_only",
    via: "web-no-webpush",
    message: `${PUSH_CONSENT.why} ${PUSH_CONSENT.deniedKeepsAppUsable}`,
  };
}

async function tryNativePushPermission() {
  try {
    // Variable + @vite-ignore: Capacitor is optional on web main (lives on #11/#12).
    const coreId = "@capacitor/core";
    const pushId = "@capacitor/push-notifications";
    const { Capacitor } = await import(/* @vite-ignore */ coreId);
    if (!Capacitor?.isNativePlatform?.()) return null;
    const { PushNotifications } = await import(/* @vite-ignore */ pushId);
    const current = await PushNotifications.checkPermissions();
    if (current.receive === "granted") {
      return { ok: true, status: "granted", via: "capacitor" };
    }
    if (current.receive === "denied") {
      return {
        ok: false,
        status: "denied",
        via: "capacitor",
        message: `${PUSH_CONSENT.why} ${PUSH_CONSENT.settingsHint}`,
      };
    }
    const req = await PushNotifications.requestPermissions();
    if (req.receive === "granted") {
      try {
        await PushNotifications.register();
      } catch {
        /* token wiring = phase 1 server */
      }
      return { ok: true, status: "granted", via: "capacitor" };
    }
    return {
      ok: false,
      status: req.receive || "denied",
      via: "capacitor",
      message: `${PUSH_CONSENT.why} ${PUSH_CONSENT.settingsHint}`,
    };
  } catch {
    return null; // Capacitor absent — Web path
  }
}

/** User turned master toggle off — local pref only (unregister later when tokens exist). */
export function disablePushLocally(storage = defaultStorage()) {
  return writePushPreferences({ ...readPushPreferences(storage), master: false }, storage);
}

export function enablePushLocally(storage = defaultStorage()) {
  return writePushPreferences({ ...readPushPreferences(storage), master: true }, storage);
}

/** Anti-spam helpers (pure) — used by future dispatch + unit tests. */
export const PUSH_CAPS = {
  maxPerHour: 4,
  maxPerDay: 12,
  reengagementCooldownHours: 18,
  interestCollapseWindowMs: 2 * 60 * 60 * 1000,
  postInterestMinScore: 3,
};

export function countDeliveriesInWindow(deliveries, nowMs, windowMs) {
  const from = nowMs - windowMs;
  return (deliveries || []).filter((d) => {
    const t = typeof d.createdAtMs === "number" ? d.createdAtMs : Date.parse(d.created_at || 0);
    return Number.isFinite(t) && t >= from;
  }).length;
}

export function canSendPushUnderCaps(deliveries, nowMs = Date.now(), caps = PUSH_CAPS) {
  const hour = countDeliveriesInWindow(deliveries, nowMs, 60 * 60 * 1000);
  const day = countDeliveriesInWindow(deliveries, nowMs, 24 * 60 * 60 * 1000);
  if (hour >= caps.maxPerHour) return { ok: false, reason: "hour_cap" };
  if (day >= caps.maxPerDay) return { ok: false, reason: "day_cap" };
  return { ok: true };
}

/** Interest score MVP — follow or followed artist alone reaches threshold. */
export function interestPostScore({
  isFollowed = false,
  isFollowedArtist = false,
  recentInteraction = false,
  isFriend = false,
  authorQuietLong = false,
  isAnnounce = false,
} = {}) {
  let s = 0;
  if (isFollowed) s += 3;
  if (isFollowedArtist) s += 3;
  if (recentInteraction) s += 2;
  if (isFriend) s += 2;
  if (authorQuietLong) s += 1;
  if (isAnnounce) s += 1;
  return s;
}

export function shouldPushInterestPost(signals, minScore = PUSH_CAPS.postInterestMinScore) {
  return interestPostScore(signals) >= minScore;
}

/** 6h re-engagement gate (pure). */
export function shouldReengage({
  lastOpenedAtMs,
  nowMs = Date.now(),
  hasInterestSinceOpen = false,
  lastReengageAtMs = null,
  prefOn = true,
  cooldownHours = PUSH_CAPS.reengagementCooldownHours,
} = {}) {
  if (!prefOn || !hasInterestSinceOpen) return { ok: false, reason: "pref_or_empty" };
  if (!lastOpenedAtMs || nowMs - lastOpenedAtMs < 6 * 60 * 60 * 1000) {
    return { ok: false, reason: "opened_recently" };
  }
  if (lastReengageAtMs && nowMs - lastReengageAtMs < cooldownHours * 60 * 60 * 1000) {
    return { ok: false, reason: "cooldown" };
  }
  return { ok: true };
}

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
