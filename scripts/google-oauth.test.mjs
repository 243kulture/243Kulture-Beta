import assert from "node:assert/strict";
import {
  NATIVE_AUTH_CALLBACK_URL,
  buildGoogleOAuthSetup,
  completeOAuthFromUrl,
  isGoogleOAuthEnabled,
  isNativeRuntime,
  isOAuthCallbackUrl,
  openOAuthInSystemBrowser,
  parseOAuthCallback,
  resolveOAuthRedirectTo,
} from "../src/lib/googleOAuth.js";
import { parseDeepLink } from "../src/lib/deepLinks.js";

// Flag defaults OFF (no Google client yet)
assert.equal(isGoogleOAuthEnabled({}), false);
assert.equal(isGoogleOAuthEnabled(undefined), false);
assert.equal(isGoogleOAuthEnabled({ VITE_GOOGLE_OAUTH_ENABLED: "false" }), false);
assert.equal(isGoogleOAuthEnabled({ VITE_GOOGLE_OAUTH_ENABLED: "" }), false);
assert.equal(isGoogleOAuthEnabled({ VITE_GOOGLE_OAUTH_ENABLED: "true" }), true);
assert.equal(isGoogleOAuthEnabled({ VITE_GOOGLE_OAUTH_ENABLED: "1" }), true);

// Runtime detection
assert.equal(isNativeRuntime(null), false);
assert.equal(isNativeRuntime({}), false);
assert.equal(isNativeRuntime({ Capacitor: { isNativePlatform: () => false } }), false);
assert.equal(isNativeRuntime({ Capacitor: { isNativePlatform: () => true } }), true);

// Redirect targets
assert.equal(NATIVE_AUTH_CALLBACK_URL, "kulture243://auth/callback");
assert.equal(resolveOAuthRedirectTo({ native: false, origin: "http://localhost:5173", env: {} }), "http://localhost:5173");
assert.equal(resolveOAuthRedirectTo({ native: true, env: {} }), NATIVE_AUTH_CALLBACK_URL);
assert.equal(
  resolveOAuthRedirectTo({ native: true, env: { VITE_AUTH_NATIVE_REDIRECT_URL: " app.kulture243.mobile://auth/callback " } }),
  "app.kulture243.mobile://auth/callback",
);

// Callback detection must not swallow content deep links
assert.equal(isOAuthCallbackUrl("kulture243://auth/callback#access_token=a&refresh_token=b"), true);
assert.equal(isOAuthCallbackUrl("KULTURE243://auth/callback/?code=x"), true);
assert.equal(isOAuthCallbackUrl("kulture243://profile/abc"), false);
assert.equal(isOAuthCallbackUrl("https://243kulture.app/"), false);
assert.equal(isOAuthCallbackUrl(""), false);
assert.equal(parseDeepLink("kulture243://auth/callback#access_token=a"), null);

// Callback parsing
assert.deepEqual(parseOAuthCallback("kulture243://auth/callback#access_token=AT&refresh_token=RT&token_type=bearer"), {
  type: "tokens",
  accessToken: "AT",
  refreshToken: "RT",
});
assert.deepEqual(parseOAuthCallback("kulture243://auth/callback?code=C123"), { type: "code", code: "C123" });
const cancelled = parseOAuthCallback("kulture243://auth/callback?error=access_denied&error_description=User+cancelled");
assert.equal(cancelled.type, "error");
assert.equal(cancelled.cancelled, true);
const failed = parseOAuthCallback("kulture243://auth/callback#error=server_error&error_description=Unable+to+exchange");
assert.equal(failed.cancelled, false);
assert.equal(failed.errorDescription, "Unable to exchange");
assert.equal(parseOAuthCallback("kulture243://auth/callback"), null);
assert.equal(parseOAuthCallback("not a url"), null);

// Session completion against a fake Supabase client
const calls = [];
const fakeClient = {
  auth: {
    setSession: async (s) => { calls.push(["setSession", s]); return { error: null }; },
    exchangeCodeForSession: async (c) => { calls.push(["exchange", c]); return { error: null }; },
  },
};
assert.deepEqual(await completeOAuthFromUrl(fakeClient, "kulture243://auth/callback#access_token=AT&refresh_token=RT"), { ok: true });
assert.deepEqual(calls.at(-1), ["setSession", { access_token: "AT", refresh_token: "RT" }]);
assert.deepEqual(await completeOAuthFromUrl(fakeClient, "kulture243://auth/callback?code=C1"), { ok: true });
assert.deepEqual(calls.at(-1), ["exchange", "C1"]);
assert.equal((await completeOAuthFromUrl(fakeClient, "kulture243://auth/callback?error=access_denied")).reason, "cancelled");
assert.equal((await completeOAuthFromUrl(fakeClient, "kulture243://auth/callback")).reason, "no_params");
assert.equal((await completeOAuthFromUrl(null, "kulture243://auth/callback?code=C1")).reason, "no_client");
const failingClient = { auth: { setSession: async () => ({ error: { message: "Invalid Refresh Token" } }) } };
assert.deepEqual(
  await completeOAuthFromUrl(failingClient, "kulture243://auth/callback#access_token=a&refresh_token=b"),
  { ok: false, reason: "error", message: "Invalid Refresh Token" },
);

// System browser: missing plugin is reported, never falls back to the WebView
assert.equal(await openOAuthInSystemBrowser("https://x", { loadBrowser: async () => null }), false);
const opened = [];
let finished;
const fakeBrowser = {
  open: async (o) => { opened.push(o); },
  addListener: async (event, cb) => { if (event === "browserFinished") finished = cb; return { remove() {} }; },
};
let closedCount = 0;
assert.equal(
  await openOAuthInSystemBrowser("https://auth.example/authorize", { loadBrowser: async () => fakeBrowser, onClosed: () => { closedCount += 1; } }),
  true,
);
assert.deepEqual(opened, [{ url: "https://auth.example/authorize", windowName: "_self" }]);
finished();
assert.equal(closedCount, 1);

// Setup sheet lists web + native allow-list, never secrets
const setup = buildGoogleOAuthSetup({
  appOrigin: "http://localhost:5173",
  supabaseUrl: "https://kvmzriikfefgbhqsihwj.supabase.co",
  productionOrigin: "https://243kulture.app",
});
assert.deepEqual(setup.supabaseAuth.redirectUrls, [
  "http://localhost:5173",
  "http://localhost:5173/**",
  "https://243kulture.app",
  "https://243kulture.app/**",
  "kulture243://auth/callback",
]);
assert.equal(setup.supabaseAuth.siteUrl, "https://243kulture.app");
assert.deepEqual(setup.googleCloud.authorizedJavaScriptOrigins, ["http://localhost:5173", "https://243kulture.app"]);
assert.equal(setup.client.flag, "VITE_GOOGLE_OAUTH_ENABLED");
assert.doesNotMatch(JSON.stringify(setup), /apps\.googleusercontent\.com|GOCSPX-/);

console.log("google-oauth.test.mjs OK");
