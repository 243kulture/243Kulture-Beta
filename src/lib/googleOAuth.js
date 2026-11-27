/**
 * Google OAuth + Auth URL helpers (client prep only — no secrets).
 * Provider enablement + Client ID/Secret stay in Google Cloud / Supabase Dashboard.
 *
 * Web:    redirectTo = current origin (full-page redirect, implicit flow, supabase-js
 *         picks the session up from the URL hash).
 * Native: redirectTo = kulture243://auth/callback, opened in the system browser
 *         (Google refuses embedded WebViews: 403 disallowed_useragent), then the
 *         Capacitor appUrlOpen event hands the callback URL back to the app.
 *
 * @see docs/GOOGLE_OAUTH_AUTH_URLS.md
 */
import { NATIVE_SCHEME } from "./deepLinks.js";

export const NATIVE_AUTH_CALLBACK_URL = `${NATIVE_SCHEME}://auth/callback`;

function flagOn(raw) {
  return raw === true || raw === "true" || raw === "1";
}

/**
 * Feature flag — off until a Google Cloud OAuth client exists and the Google
 * provider is enabled in Supabase. Off hides the Google button; email stays.
 */
export function isGoogleOAuthEnabled(env = import.meta.env) {
  return flagOn(env?.VITE_GOOGLE_OAUTH_ENABLED);
}

export function isNativeRuntime(win = typeof window !== "undefined" ? window : null) {
  try {
    return Boolean(win?.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Where Supabase sends the user back after Google. Must be in the Supabase Redirect URLs allow-list. */
export function resolveOAuthRedirectTo({
  native = false,
  origin = typeof window !== "undefined" ? window.location.origin : null,
  env = import.meta.env,
} = {}) {
  if (native) {
    const override = String(env?.VITE_AUTH_NATIVE_REDIRECT_URL || "").trim();
    return override || NATIVE_AUTH_CALLBACK_URL;
  }
  return origin || null;
}

function stripQueryAndHash(url) {
  return String(url || "").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
}

/** True when an incoming app URL is the native OAuth return (not a content deep link). */
export function isOAuthCallbackUrl(url, callbackUrl = resolveOAuthRedirectTo({ native: true })) {
  if (!url || !callbackUrl) return false;
  return stripQueryAndHash(url) === stripQueryAndHash(callbackUrl);
}

/**
 * Read the OAuth result from a callback URL (query or hash).
 * @returns {{ type: "error", error: string, errorDescription: string, cancelled: boolean }
 *   | { type: "code", code: string }
 *   | { type: "tokens", accessToken: string, refreshToken: string }
 *   | null}
 */
export function parseOAuthCallback(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return null;
  }
  const query = parsed.searchParams;
  const hash = new URLSearchParams((parsed.hash || "").replace(/^#/, ""));
  const pick = (key) => query.get(key) || hash.get(key);

  const error = pick("error") || pick("error_code");
  if (error) {
    const errorDescription = pick("error_description") || "";
    return {
      type: "error",
      error,
      errorDescription,
      cancelled: /access_denied|cancell?ed/i.test(`${error} ${errorDescription}`),
    };
  }
  const code = query.get("code");
  if (code) return { type: "code", code };
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) return { type: "tokens", accessToken, refreshToken };
  return null;
}

/**
 * Turn a native callback URL into a Supabase session.
 * Success is also broadcast by supabase-js through onAuthStateChange.
 * @returns {Promise<{ ok: true } | { ok: false, reason: "no_params" | "cancelled" | "error" | "no_client", message?: string }>}
 */
export async function completeOAuthFromUrl(client, url) {
  const parsed = parseOAuthCallback(url);
  if (!parsed) return { ok: false, reason: "no_params" };
  if (parsed.type === "error") {
    return {
      ok: false,
      reason: parsed.cancelled ? "cancelled" : "error",
      message: parsed.errorDescription || parsed.error,
    };
  }
  if (!client?.auth) return { ok: false, reason: "no_client" };
  try {
    const { error } =
      parsed.type === "code"
        ? await client.auth.exchangeCodeForSession(parsed.code)
        : await client.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
    if (error) return { ok: false, reason: "error", message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "error", message: err?.message || String(err) };
  }
}

/**
 * Capacitor Browser plugin (Custom Tabs / SFSafariViewController), or null.
 * Read from the native bridge so web builds never need @capacitor/browser.
 */
export async function loadSystemBrowser(win = typeof window !== "undefined" ? window : null) {
  const bridged = win?.Capacitor?.Plugins?.Browser;
  if (bridged?.open) return bridged;
  try {
    const pluginId = "@capacitor/browser";
    const mod = await import(/* @vite-ignore */ pluginId);
    return mod?.Browser?.open ? mod.Browser : null;
  } catch {
    return null;
  }
}

/**
 * Open the Google authorize URL in the system browser.
 * @returns {Promise<boolean>} false when no Browser plugin is available.
 */
export async function openOAuthInSystemBrowser(url, { onClosed, loadBrowser = loadSystemBrowser } = {}) {
  const Browser = await loadBrowser();
  if (!Browser) return false;
  if (typeof onClosed === "function" && Browser.addListener) {
    try {
      const sub = await Browser.addListener("browserFinished", () => {
        try { sub?.remove?.(); } catch { /* ignore */ }
        onClosed();
      });
    } catch { /* listener optional */ }
  }
  try {
    await Browser.open({ url, windowName: "_self" });
    return true;
  } catch {
    return false;
  }
}

export async function closeSystemBrowser({ loadBrowser = loadSystemBrowser } = {}) {
  try {
    const Browser = await loadBrowser();
    await Browser?.close?.();
  } catch {
    /* iOS only; Android Custom Tabs close on redirect */
  }
}

/** Build the Supabase Auth callback URL for a project. */
export function supabaseAuthCallbackUrl(supabaseUrl) {
  const base = String(supabaseUrl || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/auth/v1/callback`;
}

/**
 * Exact URL sets the user must configure (dev + optional prod + native).
 * Never invents Client ID/Secret.
 */
export function buildGoogleOAuthSetup({
  appOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
  supabaseUrl,
  productionOrigin = null,
  nativeRedirectUrl = NATIVE_AUTH_CALLBACK_URL,
} = {}) {
  const callback = supabaseAuthCallbackUrl(supabaseUrl);
  const origins = [appOrigin].filter(Boolean);
  if (productionOrigin && productionOrigin !== appOrigin) origins.push(productionOrigin);

  const redirectAllowList = [];
  for (const o of origins) {
    redirectAllowList.push(o);
    redirectAllowList.push(`${o}/**`);
  }
  if (nativeRedirectUrl) redirectAllowList.push(nativeRedirectUrl);

  return {
    googleCloud: {
      applicationType: "Web application",
      authorizedJavaScriptOrigins: origins,
      authorizedRedirectUris: callback ? [callback] : [],
      note: "Paste Client ID + Client Secret into Supabase → Auth → Providers → Google. Never commit them.",
    },
    supabaseAuth: {
      siteUrl: productionOrigin || appOrigin,
      redirectUrls: redirectAllowList,
      provider: {
        name: "google",
        enabled: false, // user must flip ON in Dashboard after secrets
        clientId: "(from Google Cloud — user secret)",
        clientSecret: "(from Google Cloud — user secret)",
      },
      callbackUrl: callback,
    },
    client: {
      flag: "VITE_GOOGLE_OAUTH_ENABLED",
      redirectTo: appOrigin,
      nativeRedirectTo: nativeRedirectUrl,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  };
}

export function isGoogleProviderDisabledError(message) {
  return /not enabled|unsupported provider/i.test(String(message || ""));
}
