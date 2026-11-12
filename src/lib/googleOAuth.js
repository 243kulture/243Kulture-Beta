/**
 * Google OAuth + Auth URL helpers (client prep only — no secrets).
 * Provider enablement + Client ID/Secret stay in Google Cloud / Supabase Dashboard.
 */

/** Build the Supabase Auth callback URL for a project. */
export function supabaseAuthCallbackUrl(supabaseUrl) {
  const base = String(supabaseUrl || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/auth/v1/callback`;
}

/**
 * Exact URL sets the user must configure (dev + optional prod).
 * Never invents Client ID/Secret.
 */
export function buildGoogleOAuthSetup({
  appOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
  supabaseUrl,
  productionOrigin = null,
} = {}) {
  const callback = supabaseAuthCallbackUrl(supabaseUrl);
  const origins = [appOrigin].filter(Boolean);
  if (productionOrigin && productionOrigin !== appOrigin) origins.push(productionOrigin);

  const redirectAllowList = [];
  for (const o of origins) {
    redirectAllowList.push(o);
    redirectAllowList.push(`${o}/**`);
  }

  return {
    googleCloud: {
      applicationType: "Web application",
      authorizedJavaScriptOrigins: origins,
      authorizedRedirectUris: callback ? [callback] : [],
      note: "Paste Client ID + Client Secret into Supabase → Auth → Providers → Google. Never commit them.",
    },
    supabaseAuth: {
      siteUrl: appOrigin,
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
      redirectTo: appOrigin,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  };
}

export function isGoogleProviderDisabledError(message) {
  return /not enabled|unsupported provider/i.test(String(message || ""));
}
