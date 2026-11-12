/**
 * Deep-link helpers — web paths + Capacitor-ready custom schemes.
 * Pure parse/build; App.jsx applies routes through the existing gate.
 *
 * Web examples:
 *   https://243kulture.app/profile/<uuid>
 *   https://243kulture.app/post/<id>
 *   https://243kulture.app/community?tab=feed
 *   https://243kulture.app/invite/<code>
 *
 * Native (document for #11/#12; listener is dynamic / no-op on web):
 *   kulture243://profile/<uuid>
 *   kulture243://post/<id>
 *   kulture243://community?tab=messages
 *   kulture243://invite/<code>
 */

export const WEB_ORIGIN = "https://243kulture.app";
export const NATIVE_SCHEME = "kulture243";
/** Matches Capacitor appId documented on Android/iOS PRs. */
export const NATIVE_APP_ID = "app.kulture243.mobile";

export const COMMUNITY_TABS = new Set([
  "feed",
  "amis",
  "abonnements",
  "abonnes",
  "decouvrir",
  "messages",
]);

/**
 * Parse a URL, path, or custom-scheme string into a route intent.
 * @returns {{ kind: string, profileId?: string, postId?: string, inviteCode?: string, communityTab?: string, rawPath?: string } | null}
 */
export function parseDeepLink(input, { origin = WEB_ORIGIN } = {}) {
  if (!input || typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  let url;
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      url = new URL(raw);
    } else if (raw.startsWith("/")) {
      url = new URL(raw, origin);
    } else {
      url = new URL(`/${raw.replace(/^\/*/, "")}`, origin);
    }
  } catch {
    return null;
  }

  const scheme = (url.protocol || "").replace(/:$/, "").toLowerCase();
  const isNative =
    scheme === NATIVE_SCHEME ||
    scheme === NATIVE_APP_ID ||
    scheme === "app.kulture243";

  // Custom schemes often put the first segment in hostname: kulture243://profile/uuid
  let path = url.pathname || "/";
  if (isNative && url.hostname && (!path || path === "/")) {
    path = `/${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } else if (isNative && url.hostname && path) {
    path = `/${url.hostname}${path}`.replace(/\/{2,}/g, "/");
  }

  path = path.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const tab = url.searchParams.get("tab");
  const inviteQ = url.searchParams.get("invite");

  if (inviteQ) {
    return { kind: "invite", inviteCode: String(inviteQ), rawPath: path };
  }

  if (parts.length === 0) {
    return { kind: "home", rawPath: "/" };
  }

  const head = parts[0].toLowerCase();

  if (head === "profile" || head === "u" || head === "p") {
    const profileId = parts[1];
    if (!profileId) return { kind: "home", rawPath: path };
    return { kind: "profile", profileId, rawPath: path };
  }

  if (head === "post" || head === "posts") {
    const postId = parts[1];
    if (!postId) return { kind: "community", communityTab: "feed", rawPath: path };
    return { kind: "post", postId, rawPath: path };
  }

  if (head === "community" || head === "amis" || head === "feed") {
    const communityTab = normalizeCommunityTab(tab || (head === "amis" ? "amis" : "feed"));
    return { kind: "community", communityTab, rawPath: path };
  }

  if (head === "invite" || head === "invites") {
    const inviteCode = parts[1] || inviteQ;
    if (!inviteCode) return { kind: "home", rawPath: path };
    return { kind: "invite", inviteCode, rawPath: path };
  }

  if (head === "notifications") {
    return { kind: "notifications", rawPath: path };
  }

  return null;
}

export function normalizeCommunityTab(tab) {
  const t = String(tab || "feed").toLowerCase();
  return COMMUNITY_TABS.has(t) ? t : "feed";
}

/**
 * Map a parsed intent to App screen/state fields.
 * Caller still runs redirectForGate before applying.
 */
export function routeFromDeepLink(parsed) {
  if (!parsed?.kind) return null;
  switch (parsed.kind) {
    case "home":
      return { screen: "home" };
    case "profile":
      return { screen: "userProfile", profileId: parsed.profileId };
    case "post":
      return {
        screen: "amis",
        communityTab: "feed",
        postId: parsed.postId,
        highlightPostId: parsed.postId,
      };
    case "community":
      return { screen: "amis", communityTab: normalizeCommunityTab(parsed.communityTab) };
    case "invite":
      return { screen: "amis", communityTab: "amis", inviteCode: parsed.inviteCode };
    case "notifications":
      return { screen: "notifications" };
    default:
      return null;
  }
}

/** Build a shareable web or native deep link. */
export function buildDeepLink(
  { kind, profileId, postId, inviteCode, communityTab } = {},
  { mode = "web", origin = WEB_ORIGIN, scheme = NATIVE_SCHEME } = {},
) {
  let path = "/";
  if (kind === "profile" && profileId) path = `/profile/${encodeURIComponent(profileId)}`;
  else if (kind === "post" && postId) path = `/post/${encodeURIComponent(postId)}`;
  else if (kind === "community") {
    const tab = normalizeCommunityTab(communityTab);
    path = tab === "feed" ? "/community?tab=feed" : `/community?tab=${encodeURIComponent(tab)}`;
  } else if (kind === "invite" && inviteCode) path = `/invite/${encodeURIComponent(inviteCode)}`;
  else if (kind === "notifications") path = "/notifications";

  if (mode === "native") {
    const bare = path.replace(/^\//, "");
    return `${scheme}://${bare}`;
  }
  return `${String(origin).replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Prefer notification.deep_link from DB; fall back to actor profile.
 * DB currently writes `/profile/{uuid}` and `/community?tab=feed`.
 */
export function parseNotificationTarget(notification) {
  if (!notification) return null;
  if (notification.deep_link) {
    const parsed = parseDeepLink(notification.deep_link);
    if (parsed) return parsed;
  }
  if (notification.actor_id) {
    return { kind: "profile", profileId: notification.actor_id };
  }
  return null;
}

/**
 * Capacitor appUrlOpen listener — no-op when Capacitor is absent (web undegraded).
 * @returns {Promise<() => void>} unsubscribe
 */
export async function listenForAppUrlOpen(handler) {
  if (typeof handler !== "function") return () => {};
  try {
    const appId = "@capacitor/app";
    const { App } = await import(/* @vite-ignore */ appId);
    const sub = await App.addListener("appUrlOpen", (event) => {
      if (event?.url) handler(event.url);
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

/** Read pending path from location (search `dl` or pathname). */
export function readBrowserDeepLink(loc = typeof window !== "undefined" ? window.location : null) {
  if (!loc) return null;
  try {
    const params = new URLSearchParams(loc.search || "");
    const dl = params.get("dl");
    if (dl) return parseDeepLink(dl);
    const path = loc.pathname || "/";
    if (path && path !== "/") return parseDeepLink(path + (loc.search || ""));
  } catch {
    /* ignore */
  }
  return null;
}

/** Strip deep-link path from the address bar without reload (OAuth-safe). */
export function clearBrowserDeepLink(loc = typeof window !== "undefined" ? window.location : null) {
  if (!loc || typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    const params = new URLSearchParams(loc.search || "");
    const hadDl = params.has("dl");
    params.delete("dl");
    const path = loc.pathname || "/";
    const isAppPath =
      /^\/(profile|u|p|post|posts|community|amis|feed|invite|invites|notifications)(\/|$)/i.test(path);
    const nextPath = isAppPath ? "/" : path;
    const qs = params.toString();
    window.history.replaceState({}, document.title, `${nextPath}${qs ? `?${qs}` : ""}${loc.hash || ""}`);
    return hadDl || isAppPath;
  } catch {
    return false;
  }
}
