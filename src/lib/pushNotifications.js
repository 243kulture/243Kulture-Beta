/**
 * Push notification client — consent-first, flag-gated.
 * No FCM/APNs secrets. Dynamic Capacitor import; Web/PWA never degraded.
 *
 * MVP families (when server dispatch ships): DMs, interest posts, 6h re-engage.
 * Optional later (defaults OFF): stories_from_follows, comment_replies, mentions, quiet_digest.
 *
 * Every side effect (OS prompt, register(), listeners, Supabase writes) is a
 * no-op while VITE_PUSH_ENABLED is off. On Android, register() without
 * google-services.json crashes the app, so the flag must stay off until FCM is set up.
 *
 * @see docs/PUSH_FIREBASE_APNS_CHECKLIST.md · supabase/drafts/push_phase1_tokens.sql
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
const LS_DEVICE = "kulture243_push_device_v1";
const LS_PRESENCE = "kulture243_presence_touch_v1";
const LS_SOFT_CTA = "kulture243_push_soft_cta_v1";

export const PUSH_MVP_FAMILIES = ["messages", "interest_posts", "reengagement"];
export const PUSH_OPTIONAL_FAMILIES = [
  "stories_from_follows",
  "comment_replies",
  "mentions",
  "quiet_digest_mode",
];

/** Supabase objects created by supabase/drafts/push_phase1_tokens.sql (not applied yet). */
export const PUSH_BACKEND = {
  devicesTable: "push_devices",
  preferencesTable: "push_preferences",
  /** security definer: hands the token to auth.uid(), disables it for any previous owner. */
  registerDeviceRpc: "register_push_device",
  disableDeviceRpc: "disable_push_device",
  touchPresenceRpc: "touch_user_presence",
};

/** Android channels — server payload must set android.notification.channel_id to one of these. */
export const PUSH_ANDROID_CHANNELS = [
  { id: "dm", name: "Messages privés", description: "Nouveaux messages et réponses Story", importance: 4 },
  { id: "interest", name: "Posts suivis", description: "Comptes et artistes que tu suis", importance: 3 },
  { id: "reengage", name: "Rappels", description: "Rappel après 6 h d’absence", importance: 2 },
];

export const PUSH_KIND_CHANNEL = {
  message: "dm",
  story_reply: "dm",
  interest_post: "interest",
  digest: "interest",
  reengagement: "reengage",
};

export const PUSH_SOFT_CTA_CONTEXTS = ["messages", "follow"];

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
    /** OS said no — stop soft CTAs; only the Profile toggle can retry. */
    os_denied: false,
  };
}

export function readPushPreferences(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(LS_PREF);
    if (!raw) return defaultPushPreferences();
    const parsed = JSON.parse(raw);
    return { ...defaultPushPreferences(), ...(parsed && typeof parsed === "object" ? parsed : {}) };
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

/** Toggle one MVP/optional family; unknown keys are ignored. */
export function setPushFamily(family, value, storage = defaultStorage()) {
  const current = readPushPreferences(storage);
  if (!PUSH_MVP_FAMILIES.includes(family) && !PUSH_OPTIONAL_FAMILIES.includes(family)) {
    return current;
  }
  return writePushPreferences({ ...current, [family]: Boolean(value) }, storage);
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

// ---------------------------------------------------------------------------
// Native runtime (Capacitor) — resolved lazily, cached, web → plugin null
// ---------------------------------------------------------------------------

let runtimePromise = null;

/**
 * @returns {Promise<{ platform: "android"|"ios"|"web", PushNotifications: object|null }>}
 */
export function loadPushRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      let Capacitor;
      try {
        // Variable + @vite-ignore: Capacitor is optional on web main (lives on #11/#12).
        const coreId = "@capacitor/core";
        ({ Capacitor } = await import(/* @vite-ignore */ coreId));
      } catch {
        return { platform: "web", PushNotifications: null };
      }
      if (!Capacitor?.isNativePlatform?.()) return { platform: "web", PushNotifications: null };
      const platform = Capacitor.getPlatform?.() === "ios" ? "ios" : "android";
      try {
        const pushId = "@capacitor/push-notifications";
        const { PushNotifications } = await import(/* @vite-ignore */ pushId);
        return { platform, PushNotifications: PushNotifications || null };
      } catch {
        return { platform, PushNotifications: null };
      }
    })();
  }
  return runtimePromise;
}

async function resolveRuntime(runtime) {
  return runtime || loadPushRuntime();
}

export function isPushDeliveryAvailable(runtime) {
  return Boolean(runtime?.PushNotifications) && (runtime.platform === "android" || runtime.platform === "ios");
}

export function providerForPlatform(platform) {
  if (platform === "android") return "fcm";
  if (platform === "ios") return "apns";
  if (platform === "web") return "webpush";
  return null;
}

// ---------------------------------------------------------------------------
// Permission + registration
// ---------------------------------------------------------------------------

/**
 * Request OS push permission — ONLY when userInitiated === true.
 * Never call from cold start / initNativeShell.
 * On grant, also registers and returns the device token (if the OS delivers one).
 */
export async function ensurePushPermission({ userInitiated = false, env = import.meta.env, runtime } = {}) {
  if (!userInitiated) {
    return {
      ok: false,
      status: "blocked_no_intent",
      message: "Push permission only on user intent.",
    };
  }

  if (!isPushFeatureEnabled(env)) {
    // Preference-only path: no OS prompt, Web undegraded
    return {
      ok: true,
      status: "pref_only",
      via: "flag-off",
      message: PUSH_CONSENT.why,
    };
  }

  const rt = await resolveRuntime(runtime);
  if (!isPushDeliveryAvailable(rt)) {
    // Web Push optional — not enabled in MVP scaffold
    return {
      ok: true,
      status: "pref_only",
      via: "web-no-webpush",
      message: `${PUSH_CONSENT.why} ${PUSH_CONSENT.deniedKeepsAppUsable}`,
    };
  }

  const P = rt.PushNotifications;
  try {
    const current = await P.checkPermissions();
    let receive = current?.receive;
    if (receive === "denied") {
      return deniedResult(rt.platform);
    }
    if (receive !== "granted") {
      const req = await P.requestPermissions();
      receive = req?.receive;
    }
    if (receive !== "granted") {
      return { ...deniedResult(rt.platform), status: receive || "denied" };
    }
    await ensureAndroidChannels(rt);
    const reg = await registerForPushToken(rt);
    return {
      ok: true,
      status: "granted",
      via: "capacitor",
      platform: rt.platform,
      token: reg.ok ? reg.token : null,
      tokenError: reg.ok ? null : reg.reason,
    };
  } catch {
    return {
      ok: false,
      status: "error",
      via: "capacitor",
      platform: rt.platform,
      message: PUSH_CONSENT.deniedKeepsAppUsable,
    };
  }
}

function deniedResult(platform) {
  return {
    ok: false,
    status: "denied",
    via: "capacitor",
    platform,
    message: `${PUSH_CONSENT.why} ${PUSH_CONSENT.settingsHint}`,
  };
}

/**
 * Cold start / login: if the user already opted in AND the OS already granted,
 * refresh the token (tokens rotate). Never prompts — checkPermissions only.
 */
export async function refreshPushTokenIfGranted({ env = import.meta.env, runtime, prefs } = {}) {
  if (!isPushFeatureEnabled(env)) return { ok: false, status: "flag_off" };
  if (!prefs?.master) return { ok: false, status: "pref_off" };
  const rt = await resolveRuntime(runtime);
  if (!isPushDeliveryAvailable(rt)) return { ok: false, status: "unavailable" };
  try {
    const current = await rt.PushNotifications.checkPermissions();
    if (current?.receive !== "granted") {
      return { ok: false, status: current?.receive === "denied" ? "denied" : "not_granted" };
    }
    await ensureAndroidChannels(rt);
    const reg = await registerForPushToken(rt);
    if (!reg.ok) return { ok: false, status: reg.reason };
    return { ok: true, status: "granted", token: reg.token, platform: rt.platform };
  } catch {
    return { ok: false, status: "error" };
  }
}

/** Tokens: FCM ≈ 150–200 chars, APNs hex 64. Reject blanks/whitespace/garbage. */
export function normalizePushToken(value) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t.length < 16 || t.length > 4096) return null;
  if (/\s/.test(t)) return null;
  return t;
}

/**
 * Attach one-shot registration listeners, call register(), resolve with token.
 * Listeners are attached before register() so the first token is never missed.
 */
export function registerForPushToken(runtime, { timeoutMs = 15000 } = {}) {
  const P = runtime?.PushNotifications;
  if (!P) return Promise.resolve({ ok: false, reason: "unavailable" });
  return new Promise((resolve) => {
    let done = false;
    const subs = [];
    const removeAll = () => {
      while (subs.length) {
        const s = subs.pop();
        try {
          s?.remove?.();
        } catch {
          /* ignore */
        }
      }
    };
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      removeAll();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    (async () => {
      try {
        const onReg = await P.addListener("registration", (t) => {
          const token = normalizePushToken(t?.value);
          finish(token ? { ok: true, token } : { ok: false, reason: "invalid_token" });
        });
        subs.push(onReg);
        const onErr = await P.addListener("registrationError", (e) => {
          finish({ ok: false, reason: "registration_error", error: String(e?.error || "") });
        });
        subs.push(onErr);
        if (done) {
          removeAll();
          return;
        }
        await P.register();
      } catch {
        finish({ ok: false, reason: "register_threw" });
      }
    })();
  });
}

async function ensureAndroidChannels(runtime) {
  if (runtime?.platform !== "android" || typeof runtime.PushNotifications?.createChannel !== "function") return;
  for (const ch of PUSH_ANDROID_CHANNELS) {
    try {
      await runtime.PushNotifications.createChannel({ ...ch, visibility: 0, vibration: true });
    } catch {
      /* channel creation is best-effort */
    }
  }
}

/** Native unregister (user switched master off / logout). */
export async function unregisterNativePush({ env = import.meta.env, runtime } = {}) {
  if (!isPushFeatureEnabled(env)) return { ok: false, status: "flag_off" };
  const rt = await resolveRuntime(runtime);
  if (!isPushDeliveryAvailable(rt)) return { ok: false, status: "unavailable" };
  try {
    if (typeof rt.PushNotifications.unregister === "function") await rt.PushNotifications.unregister();
    return { ok: true, status: "unregistered" };
  } catch {
    return { ok: false, status: "error" };
  }
}

// ---------------------------------------------------------------------------
// Token storage hooks (local cache + Supabase push_devices)
// ---------------------------------------------------------------------------

export function readStoredPushDevice(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(LS_DEVICE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizePushToken(parsed?.token) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredPushDevice(device, storage) {
  try {
    storage?.setItem?.(LS_DEVICE, JSON.stringify(device));
  } catch {
    /* ignore */
  }
}

export function clearStoredPushDevice(storage = defaultStorage()) {
  try {
    storage?.removeItem?.(LS_DEVICE);
  } catch {
    /* ignore */
  }
}

/** Row for push_devices — null when anything is invalid (never send junk). */
export function buildPushDeviceRow({ userId, token, platform, nowMs = Date.now() } = {}) {
  const t = normalizePushToken(token);
  const provider = providerForPlatform(platform);
  if (!userId || typeof userId !== "string" || !t || !provider || platform === "web") return null;
  return {
    user_id: userId,
    platform,
    provider,
    token: t,
    enabled: true,
    last_seen_at: new Date(nowMs).toISOString(),
  };
}

/** Postgres/PostgREST codes for "table / function not created yet". */
export function isPushBackendMissing(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205") return true;
  return /does not exist|could not find/i.test(String(error.message || ""));
}

export async function savePushDeviceToken(
  client,
  { userId, token, platform, env = import.meta.env, storage = defaultStorage(), nowMs = Date.now() } = {},
) {
  if (!isPushFeatureEnabled(env)) return { ok: false, status: "flag_off" };
  const row = buildPushDeviceRow({ userId, token, platform, nowMs });
  if (!row) return { ok: false, status: "invalid" };
  writeStoredPushDevice({ token: row.token, platform, provider: row.provider, userId, savedAtMs: nowMs, synced: false }, storage);
  if (!client?.rpc) return { ok: false, status: "no_backend" };
  try {
    const { error } = await client.rpc(PUSH_BACKEND.registerDeviceRpc, {
      p_token: row.token,
      p_platform: row.platform,
    });
    if (error) {
      return { ok: false, status: isPushBackendMissing(error) ? "backend_missing" : "error", error: error.message };
    }
  } catch (e) {
    return { ok: false, status: "error", error: String(e?.message || e) };
  }
  writeStoredPushDevice({ token: row.token, platform, provider: row.provider, userId, savedAtMs: nowMs, synced: true }, storage);
  return { ok: true, status: "saved" };
}

/**
 * Soft-disable this device's row (enabled=false) and clear the local cache.
 * Call BEFORE auth.signOut() — RLS needs the session.
 */
export async function disablePushDeviceToken(
  client,
  { userId, env = import.meta.env, storage = defaultStorage() } = {},
) {
  if (!isPushFeatureEnabled(env)) return { ok: false, status: "flag_off" };
  const stored = readStoredPushDevice(storage);
  clearStoredPushDevice(storage);
  const owner = stored?.userId || userId;
  if (!stored?.token || !owner) return { ok: true, status: "nothing" };
  if (!client?.rpc) return { ok: false, status: "no_backend" };
  try {
    const { error } = await client.rpc(PUSH_BACKEND.disableDeviceRpc, { p_token: stored.token });
    if (error) {
      return { ok: false, status: isPushBackendMissing(error) ? "backend_missing" : "error", error: error.message };
    }
  } catch (e) {
    return { ok: false, status: "error", error: String(e?.message || e) };
  }
  return { ok: true, status: "disabled" };
}

/** push_preferences row — families only (master/os_denied are device-local). */
export function pushPreferencesRow(userId, prefs, nowMs = Date.now()) {
  if (!userId) return null;
  const p = { ...defaultPushPreferences(), ...prefs };
  const row = { user_id: userId, updated_at: new Date(nowMs).toISOString() };
  for (const k of [...PUSH_MVP_FAMILIES, ...PUSH_OPTIONAL_FAMILIES]) row[k] = Boolean(p[k]);
  return row;
}

export async function syncPushPreferences(client, { userId, prefs, env = import.meta.env, nowMs = Date.now() } = {}) {
  if (!isPushFeatureEnabled(env)) return { ok: false, status: "flag_off" };
  const row = pushPreferencesRow(userId, prefs, nowMs);
  if (!row) return { ok: false, status: "invalid" };
  if (!client?.from) return { ok: false, status: "no_backend" };
  try {
    const { error } = await client.from(PUSH_BACKEND.preferencesTable).upsert(row, { onConflict: "user_id" });
    if (error) {
      return { ok: false, status: isPushBackendMissing(error) ? "backend_missing" : "error", error: error.message };
    }
  } catch (e) {
    return { ok: false, status: "error", error: String(e?.message || e) };
  }
  return { ok: true, status: "saved" };
}

// ---------------------------------------------------------------------------
// Presence (last_opened_at) for the 6h re-engagement rule
// ---------------------------------------------------------------------------

export const PRESENCE_DEBOUNCE_MS = 5 * 60 * 1000;

export function shouldTouchPresence({ lastTouchMs = null, nowMs = Date.now(), debounceMs = PRESENCE_DEBOUNCE_MS } = {}) {
  if (!lastTouchMs || !Number.isFinite(lastTouchMs)) return true;
  return nowMs - lastTouchMs >= debounceMs;
}

function readPresenceTouch(storage) {
  try {
    const n = Number(storage?.getItem?.(LS_PRESENCE));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function touchUserPresence(
  client,
  { userId, prefs, env = import.meta.env, storage = defaultStorage(), nowMs = Date.now() } = {},
) {
  if (!isPushFeatureEnabled(env)) return { ok: false, status: "flag_off" };
  if (!prefs?.master || !prefs?.reengagement) return { ok: false, status: "pref_off" };
  if (!userId || !client?.rpc) return { ok: false, status: "no_backend" };
  if (!shouldTouchPresence({ lastTouchMs: readPresenceTouch(storage), nowMs })) {
    return { ok: false, status: "debounced" };
  }
  // Write the debounce stamp first so a failing backend is never hammered.
  try {
    storage?.setItem?.(LS_PRESENCE, String(nowMs));
  } catch {
    /* ignore */
  }
  try {
    const { error } = await client.rpc(PUSH_BACKEND.touchPresenceRpc);
    if (error) {
      return { ok: false, status: isPushBackendMissing(error) ? "backend_missing" : "error", error: error.message };
    }
  } catch (e) {
    return { ok: false, status: "error", error: String(e?.message || e) };
  }
  return { ok: true, status: "touched" };
}

/**
 * Foreground signal: Web visibilitychange + Capacitor appStateChange.
 * No-op while the flag is off. @returns {Promise<() => void>}
 */
export async function listenForAppForeground(handler, { env = import.meta.env } = {}) {
  if (typeof handler !== "function" || !isPushFeatureEnabled(env)) return () => {};
  const cleanups = [];
  if (typeof document !== "undefined" && document.addEventListener) {
    const onVis = () => {
      if (document.visibilityState === "visible") handler();
    };
    document.addEventListener("visibilitychange", onVis);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
  }
  try {
    const appId = "@capacitor/app";
    const { App } = await import(/* @vite-ignore */ appId);
    const sub = await App.addListener("appStateChange", (s) => {
      if (s?.isActive) handler();
    });
    cleanups.push(() => sub?.remove?.());
  } catch {
    /* web — visibilitychange only */
  }
  return () => cleanups.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

// ---------------------------------------------------------------------------
// Push tap → deep link (Abonnements-first for interest / re-engage)
// ---------------------------------------------------------------------------

export function pushPayloadToDeepLink(data) {
  if (!data || typeof data !== "object") return null;
  const link = typeof data.deep_link === "string" ? data.deep_link.trim() : "";
  if (link && (link.startsWith("/") || /^kulture243:\/\//i.test(link))) return link;
  const postId = data.post_id ? String(data.post_id) : "";
  switch (data.kind) {
    case "message":
    case "story_reply":
      return "/community?tab=messages";
    case "interest_post":
      return postId ? `/post/${encodeURIComponent(postId)}` : "/community?tab=abonnements";
    case "digest":
    case "reengagement":
      return "/community?tab=abonnements";
    default:
      return "/notifications";
  }
}

/** @returns {Promise<() => void>} */
export async function attachPushActionListener(handler, { env = import.meta.env, runtime } = {}) {
  if (typeof handler !== "function" || !isPushFeatureEnabled(env)) return () => {};
  const rt = await resolveRuntime(runtime);
  if (!isPushDeliveryAvailable(rt)) return () => {};
  try {
    const sub = await rt.PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = pushPayloadToDeepLink(action?.notification?.data);
      if (link) handler(link, action);
    });
    return () => {
      try {
        sub?.remove?.();
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// Contextual soft CTAs (Messages tab, after a follow) — never when flag off
// ---------------------------------------------------------------------------

function readSoftCtaState(storage) {
  try {
    const raw = storage?.getItem?.(LS_SOFT_CTA);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function canShowPushSoftCta(
  context,
  { env = import.meta.env, prefs, deliveryAvailable = false, storage = defaultStorage(), nowMs = Date.now() } = {},
) {
  if (!PUSH_SOFT_CTA_CONTEXTS.includes(context)) return false;
  if (!isPushFeatureEnabled(env) || !deliveryAvailable) return false;
  const p = prefs || readPushPreferences(storage);
  if (p.master || p.os_denied) return false;
  const dismissedAt = Number(readSoftCtaState(storage)[context]);
  if (Number.isFinite(dismissedAt) && dismissedAt > 0 && nowMs - dismissedAt < PUSH_CAPS.softCtaCooldownMs) {
    return false;
  }
  return true;
}

export function dismissPushSoftCta(context, storage = defaultStorage(), nowMs = Date.now()) {
  if (!PUSH_SOFT_CTA_CONTEXTS.includes(context)) return;
  const state = readSoftCtaState(storage);
  state[context] = nowMs;
  try {
    storage?.setItem?.(LS_SOFT_CTA, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Local master switch
// ---------------------------------------------------------------------------

/** User turned master toggle off — local pref only; pair with disablePushDeviceToken + unregisterNativePush. */
export function disablePushLocally(storage = defaultStorage()) {
  return writePushPreferences({ ...readPushPreferences(storage), master: false }, storage);
}

export function enablePushLocally(storage = defaultStorage()) {
  return writePushPreferences({ ...readPushPreferences(storage), master: true, os_denied: false }, storage);
}

export function markPushOsDenied(storage = defaultStorage()) {
  return writePushPreferences({ ...readPushPreferences(storage), master: false, os_denied: true }, storage);
}

// ---------------------------------------------------------------------------
// Anti-spam helpers (pure) — used by future dispatch + unit tests
// ---------------------------------------------------------------------------

export const PUSH_CAPS = {
  maxPerHour: 4,
  maxPerDay: 12,
  reengagementCooldownHours: 18,
  interestCollapseWindowMs: 2 * 60 * 60 * 1000,
  postInterestMinScore: 3,
  softCtaCooldownMs: 30 * 24 * 60 * 60 * 1000,
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
