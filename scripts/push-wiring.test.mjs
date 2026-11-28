import assert from "node:assert/strict";
import {
  PUSH_ANDROID_CHANNELS,
  PUSH_BACKEND,
  PUSH_CAPS,
  attachPushActionListener,
  buildPushDeviceRow,
  canShowPushSoftCta,
  disablePushDeviceToken,
  dismissPushSoftCta,
  enablePushLocally,
  ensurePushPermission,
  isPushBackendMissing,
  isPushDeliveryAvailable,
  listenForAppForeground,
  markPushOsDenied,
  normalizePushToken,
  providerForPlatform,
  pushPayloadToDeepLink,
  pushPreferencesRow,
  readPushPreferences,
  readStoredPushDevice,
  refreshPushTokenIfGranted,
  registerForPushToken,
  savePushDeviceToken,
  setPushFamily,
  shouldTouchPresence,
  syncPushPreferences,
  touchUserPresence,
  unregisterNativePush,
} from "../src/lib/pushNotifications.js";
import { parseDeepLink, routeFromDeepLink } from "../src/lib/deepLinks.js";

const ON = { VITE_PUSH_ENABLED: "true" };
const OFF = {};
const TOKEN = "fcm_".padEnd(160, "x");

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

/** Fake @capacitor/push-notifications with call log. */
function fakePlugin({ perm = "prompt", afterRequest = "granted", token = TOKEN, regError = null, emit = true } = {}) {
  const calls = [];
  const listeners = {};
  let receive = perm;
  const plugin = {
    calls,
    listeners,
    async checkPermissions() {
      calls.push("checkPermissions");
      return { receive };
    },
    async requestPermissions() {
      calls.push("requestPermissions");
      receive = afterRequest;
      return { receive };
    },
    async register() {
      calls.push("register");
      if (!emit) return;
      setTimeout(() => {
        if (regError) listeners.registrationError?.forEach((fn) => fn({ error: regError }));
        else listeners.registration?.forEach((fn) => fn({ value: token }));
      }, 0);
    },
    async unregister() {
      calls.push("unregister");
    },
    async createChannel(ch) {
      calls.push(`createChannel:${ch.id}`);
    },
    async addListener(event, fn) {
      calls.push(`addListener:${event}`);
      (listeners[event] ||= []).push(fn);
      return {
        remove: () => {
          listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
        },
      };
    },
  };
  return plugin;
}

function fakeSupabase({ error = null } = {}) {
  const ops = [];
  const builder = (table) => {
    const q = {
      upsert(row, opts) {
        ops.push({ table, op: "upsert", row, opts });
        return Promise.resolve({ error });
      },
      update(patch) {
        const entry = { table, op: "update", patch, filters: [] };
        ops.push(entry);
        const chain = {
          eq(col, val) {
            entry.filters.push([col, val]);
            return chain;
          },
          then(res, rej) {
            return Promise.resolve({ error }).then(res, rej);
          },
        };
        return chain;
      },
    };
    return q;
  };
  return {
    ops,
    from: (table) => builder(table),
    rpc: (name, args) => {
      ops.push({ op: "rpc", name, args });
      return Promise.resolve({ error });
    },
  };
}

// ---- Flag OFF: nothing native, nothing remote — ever ----
{
  const plugin = fakePlugin();
  const rt = { platform: "android", PushNotifications: plugin };
  const sb = fakeSupabase();
  const store = memStorage();

  const perm = await ensurePushPermission({ userInitiated: true, env: OFF, runtime: rt });
  assert.equal(perm.status, "pref_only");
  assert.equal(perm.via, "flag-off");
  assert.equal((await refreshPushTokenIfGranted({ env: OFF, runtime: rt, prefs: { master: true } })).status, "flag_off");
  assert.equal((await unregisterNativePush({ env: OFF, runtime: rt })).status, "flag_off");
  assert.equal((await savePushDeviceToken(sb, { userId: "u1", token: TOKEN, platform: "android", env: OFF, storage: store })).status, "flag_off");
  assert.equal((await disablePushDeviceToken(sb, { userId: "u1", env: OFF, storage: store })).status, "flag_off");
  assert.equal((await syncPushPreferences(sb, { userId: "u1", prefs: {}, env: OFF })).status, "flag_off");
  assert.equal((await touchUserPresence(sb, { userId: "u1", prefs: { master: true, reengagement: true }, env: OFF, storage: store })).status, "flag_off");
  const unsubA = await attachPushActionListener(() => {}, { env: OFF, runtime: rt });
  const unsubF = await listenForAppForeground(() => {}, { env: OFF });
  unsubA();
  unsubF();
  assert.equal(canShowPushSoftCta("messages", { env: OFF, deliveryAvailable: true, storage: store }), false);
  assert.equal(canShowPushSoftCta("follow", { env: OFF, deliveryAvailable: true, storage: store }), false);

  assert.deepEqual(plugin.calls, [], "flag off must never touch the native plugin");
  assert.deepEqual(sb.ops, [], "flag off must never write to Supabase");
  assert.equal(readStoredPushDevice(store), null);
}

// ---- Intent required even with flag ON ----
{
  const plugin = fakePlugin();
  const res = await ensurePushPermission({ userInitiated: false, env: ON, runtime: { platform: "android", PushNotifications: plugin } });
  assert.equal(res.status, "blocked_no_intent");
  assert.deepEqual(plugin.calls, []);
}

// ---- Flag ON + web (no plugin) → preferences only, no prompt ----
{
  const web = { platform: "web", PushNotifications: null };
  assert.equal(isPushDeliveryAvailable(web), false);
  const res = await ensurePushPermission({ userInitiated: true, env: ON, runtime: web });
  assert.equal(res.ok, true);
  assert.equal(res.status, "pref_only");
  assert.equal(res.via, "web-no-webpush");
}

// ---- Flag ON + Android: prompt → grant → channels → listeners before register → token ----
{
  const plugin = fakePlugin({ perm: "prompt", afterRequest: "granted" });
  const rt = { platform: "android", PushNotifications: plugin };
  assert.equal(isPushDeliveryAvailable(rt), true);
  const res = await ensurePushPermission({ userInitiated: true, env: ON, runtime: rt });
  assert.equal(res.ok, true);
  assert.equal(res.status, "granted");
  assert.equal(res.platform, "android");
  assert.equal(res.token, TOKEN);
  const iReg = plugin.calls.indexOf("register");
  assert.ok(plugin.calls.indexOf("addListener:registration") < iReg, "listener must be attached before register()");
  assert.ok(plugin.calls.indexOf("requestPermissions") < iReg);
  for (const ch of PUSH_ANDROID_CHANNELS) assert.ok(plugin.calls.includes(`createChannel:${ch.id}`));
  assert.equal((plugin.listeners.registration || []).length, 0, "one-shot listeners removed");
}

// ---- Already granted → no second prompt, still registers (token rotation) ----
{
  const plugin = fakePlugin({ perm: "granted" });
  const res = await ensurePushPermission({ userInitiated: true, env: ON, runtime: { platform: "ios", PushNotifications: plugin } });
  assert.equal(res.status, "granted");
  assert.equal(res.token, TOKEN);
  assert.ok(!plugin.calls.includes("requestPermissions"));
  assert.ok(!plugin.calls.some((c) => c.startsWith("createChannel")), "iOS has no Android channels");
}

// ---- OS denied → no re-prompt loop, settings hint ----
{
  const plugin = fakePlugin({ perm: "denied" });
  const res = await ensurePushPermission({ userInitiated: true, env: ON, runtime: { platform: "android", PushNotifications: plugin } });
  assert.equal(res.ok, false);
  assert.equal(res.status, "denied");
  assert.ok(/Réglages/.test(res.message));
  assert.ok(!plugin.calls.includes("requestPermissions"));
  assert.ok(!plugin.calls.includes("register"));
}

// ---- User declines the OS prompt ----
{
  const plugin = fakePlugin({ perm: "prompt", afterRequest: "denied" });
  const res = await ensurePushPermission({ userInitiated: true, env: ON, runtime: { platform: "android", PushNotifications: plugin } });
  assert.equal(res.ok, false);
  assert.equal(res.status, "denied");
  assert.ok(!plugin.calls.includes("register"));
}

// ---- Registration error / timeout never hang or throw ----
{
  const errPlugin = fakePlugin({ perm: "granted", regError: "FirebaseApp not initialized" });
  const res = await ensurePushPermission({ userInitiated: true, env: ON, runtime: { platform: "android", PushNotifications: errPlugin } });
  assert.equal(res.status, "granted");
  assert.equal(res.token, null);
  assert.equal(res.tokenError, "registration_error");

  const silent = fakePlugin({ perm: "granted", emit: false });
  const t = await registerForPushToken({ platform: "android", PushNotifications: silent }, { timeoutMs: 20 });
  assert.equal(t.ok, false);
  assert.equal(t.reason, "timeout");
  assert.equal((silent.listeners.registration || []).length, 0);

  const throwing = fakePlugin({ perm: "granted" });
  throwing.register = async () => {
    throw new Error("boom");
  };
  const t2 = await registerForPushToken({ platform: "android", PushNotifications: throwing }, { timeoutMs: 1000 });
  assert.equal(t2.reason, "register_threw");

  const badToken = fakePlugin({ perm: "granted", token: "  " });
  const t3 = await registerForPushToken({ platform: "android", PushNotifications: badToken }, { timeoutMs: 1000 });
  assert.equal(t3.reason, "invalid_token");
}

// ---- refreshPushTokenIfGranted never prompts ----
{
  const prompt = fakePlugin({ perm: "prompt" });
  const rt = { platform: "android", PushNotifications: prompt };
  assert.equal((await refreshPushTokenIfGranted({ env: ON, runtime: rt, prefs: { master: false } })).status, "pref_off");
  const r = await refreshPushTokenIfGranted({ env: ON, runtime: rt, prefs: { master: true } });
  assert.equal(r.status, "not_granted");
  assert.ok(!prompt.calls.includes("requestPermissions"));
  assert.ok(!prompt.calls.includes("register"));

  const granted = fakePlugin({ perm: "granted" });
  const r2 = await refreshPushTokenIfGranted({ env: ON, runtime: { platform: "ios", PushNotifications: granted }, prefs: { master: true } });
  assert.equal(r2.ok, true);
  assert.equal(r2.token, TOKEN);
  assert.ok(!granted.calls.includes("requestPermissions"));

  const denied = fakePlugin({ perm: "denied" });
  const r3 = await refreshPushTokenIfGranted({ env: ON, runtime: { platform: "ios", PushNotifications: denied }, prefs: { master: true } });
  assert.equal(r3.status, "denied");
}

// ---- Token validation + device row ----
assert.equal(normalizePushToken(""), null);
assert.equal(normalizePushToken("short"), null);
assert.equal(normalizePushToken("has space in token 1234567"), null);
assert.equal(normalizePushToken(42), null);
assert.equal(normalizePushToken(` ${TOKEN} `), TOKEN);
assert.equal(providerForPlatform("android"), "fcm");
assert.equal(providerForPlatform("ios"), "apns");
assert.equal(providerForPlatform("nope"), null);
assert.equal(buildPushDeviceRow({ userId: "u1", token: TOKEN, platform: "web" }), null);
assert.equal(buildPushDeviceRow({ userId: "", token: TOKEN, platform: "android" }), null);
assert.equal(buildPushDeviceRow({ userId: "u1", token: "bad", platform: "android" }), null);
{
  const row = buildPushDeviceRow({ userId: "u1", token: TOKEN, platform: "ios", nowMs: Date.UTC(2026, 10, 27) });
  assert.deepEqual(Object.keys(row).sort(), ["enabled", "last_seen_at", "platform", "provider", "token", "user_id"]);
  assert.equal(row.provider, "apns");
  assert.equal(row.enabled, true);
}

// ---- savePushDeviceToken → register_push_device RPC + local cache ----
{
  const sb = fakeSupabase();
  const store = memStorage();
  const r = await savePushDeviceToken(sb, { userId: "u1", token: TOKEN, platform: "android", env: ON, storage: store });
  assert.equal(r.status, "saved");
  assert.equal(sb.ops[0].name, PUSH_BACKEND.registerDeviceRpc);
  assert.deepEqual(sb.ops[0].args, { p_token: TOKEN, p_platform: "android" });
  const cached = readStoredPushDevice(store);
  assert.equal(cached.token, TOKEN);
  assert.equal(cached.userId, "u1");
  assert.equal(cached.synced, true);

  // Logout / toggle off → disable_push_device(token), cache cleared
  const d = await disablePushDeviceToken(sb, { userId: "u1", env: ON, storage: store });
  assert.equal(d.status, "disabled");
  assert.equal(sb.ops[1].name, PUSH_BACKEND.disableDeviceRpc);
  assert.deepEqual(sb.ops[1].args, { p_token: TOKEN });
  assert.equal(readStoredPushDevice(store), null);
  assert.equal((await disablePushDeviceToken(sb, { userId: "u1", env: ON, storage: store })).status, "nothing");
}

// ---- Backend not migrated yet → graceful status, local cache kept ----
{
  const missing = fakeSupabase({ error: { code: "PGRST205", message: "Could not find the table 'public.push_devices'" } });
  const store = memStorage();
  const r = await savePushDeviceToken(missing, { userId: "u1", token: TOKEN, platform: "android", env: ON, storage: store });
  assert.equal(r.ok, false);
  assert.equal(r.status, "backend_missing");
  assert.equal(readStoredPushDevice(store).synced, false);
  assert.equal(isPushBackendMissing({ code: "42P01" }), true);
  assert.equal(isPushBackendMissing({ code: "42501", message: "permission denied" }), false);
  assert.equal(isPushBackendMissing(null), false);
  assert.equal((await savePushDeviceToken(null, { userId: "u1", token: TOKEN, platform: "android", env: ON, storage: store })).status, "no_backend");
}

// ---- Preferences row: families only, optional families stay OFF ----
{
  const row = pushPreferencesRow("u1", { master: true, os_denied: true, messages: false }, Date.UTC(2026, 10, 27));
  assert.equal(row.messages, false);
  assert.equal(row.interest_posts, true);
  assert.equal(row.reengagement, true);
  assert.equal(row.stories_from_follows, false);
  assert.equal(row.mentions, false);
  assert.equal("master" in row, false);
  assert.equal("os_denied" in row, false);
  assert.equal(pushPreferencesRow("", {}), null);
  const sb = fakeSupabase();
  assert.equal((await syncPushPreferences(sb, { userId: "u1", prefs: {}, env: ON })).status, "saved");
  assert.equal(sb.ops[0].table, PUSH_BACKEND.preferencesTable);
  assert.equal(sb.ops[0].opts.onConflict, "user_id");
}

// ---- Family toggles ----
{
  const store = memStorage();
  assert.equal(setPushFamily("messages", false, store).messages, false);
  assert.equal(setPushFamily("reengagement", false, store).reengagement, false);
  const unchanged = setPushFamily("not_a_family", true, store);
  assert.equal("not_a_family" in unchanged, false);
  assert.equal(readPushPreferences(store).messages, false);
}

// ---- Presence: pref-gated + debounced 5 min ----
{
  const now = Date.UTC(2026, 10, 27, 15, 0, 0);
  assert.equal(shouldTouchPresence({ lastTouchMs: null, nowMs: now }), true);
  assert.equal(shouldTouchPresence({ lastTouchMs: now - 60_000, nowMs: now }), false);
  assert.equal(shouldTouchPresence({ lastTouchMs: now - 5 * 60_000, nowMs: now }), true);

  const sb = fakeSupabase();
  const store = memStorage();
  const prefsOn = { master: true, reengagement: true };
  assert.equal((await touchUserPresence(sb, { userId: "u1", prefs: { master: true, reengagement: false }, env: ON, storage: store, nowMs: now })).status, "pref_off");
  assert.equal((await touchUserPresence(sb, { userId: "u1", prefs: { master: false, reengagement: true }, env: ON, storage: store, nowMs: now })).status, "pref_off");
  assert.equal((await touchUserPresence(sb, { userId: "u1", prefs: prefsOn, env: ON, storage: store, nowMs: now })).status, "touched");
  assert.equal((await touchUserPresence(sb, { userId: "u1", prefs: prefsOn, env: ON, storage: store, nowMs: now + 60_000 })).status, "debounced");
  assert.equal(sb.ops.filter((o) => o.op === "rpc").length, 1);
  assert.equal(sb.ops[0].name, PUSH_BACKEND.touchPresenceRpc);

  // Missing RPC → still debounced afterwards (never hammer a missing backend)
  const missing = fakeSupabase({ error: { code: "PGRST202", message: "Could not find the function" } });
  const s2 = memStorage();
  assert.equal((await touchUserPresence(missing, { userId: "u1", prefs: prefsOn, env: ON, storage: s2, nowMs: now })).status, "backend_missing");
  assert.equal((await touchUserPresence(missing, { userId: "u1", prefs: prefsOn, env: ON, storage: s2, nowMs: now + 1000 })).status, "debounced");
}

// ---- Push tap → deep link (Abonnements-first) ----
{
  assert.equal(pushPayloadToDeepLink({ kind: "message", sender_id: "x" }), "/community?tab=messages");
  assert.equal(pushPayloadToDeepLink({ kind: "story_reply" }), "/community?tab=messages");
  assert.equal(pushPayloadToDeepLink({ kind: "interest_post", post_id: "p 1" }), "/post/p%201");
  assert.equal(pushPayloadToDeepLink({ kind: "interest_post" }), "/community?tab=abonnements");
  assert.equal(pushPayloadToDeepLink({ kind: "reengagement" }), "/community?tab=abonnements");
  assert.equal(pushPayloadToDeepLink({ kind: "digest" }), "/community?tab=abonnements");
  assert.equal(pushPayloadToDeepLink({ kind: "unknown" }), "/notifications");
  assert.equal(pushPayloadToDeepLink({ deep_link: "/profile/abc" }), "/profile/abc");
  assert.equal(pushPayloadToDeepLink({ deep_link: "https://evil.example/x", kind: "message" }), "/community?tab=messages");
  assert.equal(pushPayloadToDeepLink(null), null);

  assert.deepEqual(routeFromDeepLink(parseDeepLink(pushPayloadToDeepLink({ kind: "reengagement" }))), {
    screen: "amis",
    communityTab: "abonnements",
  });
  assert.equal(routeFromDeepLink(parseDeepLink(pushPayloadToDeepLink({ kind: "message" }))).communityTab, "messages");

  const plugin = fakePlugin();
  const got = [];
  const unsub = await attachPushActionListener((link) => got.push(link), { env: ON, runtime: { platform: "android", PushNotifications: plugin } });
  plugin.listeners.pushNotificationActionPerformed[0]({ notification: { data: { kind: "message" } } });
  assert.deepEqual(got, ["/community?tab=messages"]);
  unsub();
  assert.equal(plugin.listeners.pushNotificationActionPerformed.length, 0);
  assert.ok(!plugin.calls.includes("requestPermissions"), "attaching listeners never prompts");
}

// ---- Soft CTAs: flag + native + not enabled + not denied + 30d cooldown ----
{
  const now = Date.UTC(2026, 10, 27, 15, 0, 0);
  const store = memStorage();
  const base = { env: ON, deliveryAvailable: true, storage: store, nowMs: now };
  assert.equal(canShowPushSoftCta("messages", base), true);
  assert.equal(canShowPushSoftCta("follow", base), true);
  assert.equal(canShowPushSoftCta("stories", base), false);
  assert.equal(canShowPushSoftCta("messages", { ...base, deliveryAvailable: false }), false);

  dismissPushSoftCta("messages", store, now);
  assert.equal(canShowPushSoftCta("messages", base), false);
  assert.equal(canShowPushSoftCta("follow", base), true, "dismiss is per context");
  assert.equal(canShowPushSoftCta("messages", { ...base, nowMs: now + PUSH_CAPS.softCtaCooldownMs + 1 }), true);

  enablePushLocally(store);
  assert.equal(canShowPushSoftCta("follow", base), false, "already enabled");
  markPushOsDenied(store);
  const p = readPushPreferences(store);
  assert.equal(p.master, false);
  assert.equal(p.os_denied, true);
  assert.equal(canShowPushSoftCta("follow", base), false, "OS denied → no nagging");
  assert.equal(enablePushLocally(store).os_denied, false);
}

// ---- unregister with flag on ----
{
  const plugin = fakePlugin();
  assert.equal((await unregisterNativePush({ env: ON, runtime: { platform: "android", PushNotifications: plugin } })).status, "unregistered");
  assert.ok(plugin.calls.includes("unregister"));
  assert.equal((await unregisterNativePush({ env: ON, runtime: { platform: "web", PushNotifications: null } })).status, "unavailable");
}

console.log("push-wiring.test.mjs OK");
