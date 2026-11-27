# Google OAuth + Auth URLs — web / Android / iOS

**Status (2026-11-27):** client wiring is ready and **flag-gated off**. Live
Supabase project `243kulture-Beta` (`kvmzriikfefgbhqsihwj`) reports
`external.google = false`, `email = true`. No Google Cloud OAuth client exists
yet. This doc never contains Client ID / Secret values.

Email + password sign-up / login / reset is unaffected by everything below.

## 0. TL;DR — what you do once you create the Google client

1. Google Cloud → create **one** OAuth client, type **Web application** (§2).
2. Supabase → Providers → Google → ON, paste Client ID + Secret (§3).
3. Supabase → URL Configuration → add the redirect URLs (§3).
4. Vercel (and local `.env`) → `VITE_GOOGLE_OAUTH_ENABLED=true` → redeploy (§1).
5. Run the checks in §6.

Android/iOS use the **same** Web client through the system browser — no extra
Google clients are needed for the current flow (§5 covers the optional native SDK).

## 1. Env vars (names only)

| Name | Where | Value |
|------|-------|-------|
| `VITE_GOOGLE_OAUTH_ENABLED` | `.env`, Vercel (Production + Preview) | `false` until §2–§3 are done, then `true` |
| `VITE_AUTH_NATIVE_REDIRECT_URL` | `.env` / native build env (optional) | empty → `kulture243://auth/callback` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | already set | unchanged |

Google **Client ID / Client Secret are not app env vars.** Anything prefixed
`VITE_` is bundled into the public JS. They live only in Supabase Dashboard →
Providers → Google. If the Supabase CLI is ever used for local auth, its
`config.toml` reads them from `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` /
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` (shell env, never committed).

Vite inlines env at build time: changing the flag needs a rebuild/redeploy.

## 2. Google Cloud Console

**OAuth consent screen** (Google Auth Platform → Branding / Audience):

| Field | Value |
|-------|-------|
| App name | `243Kulture` |
| User support email | your support address |
| Authorized domains | `kvmzriikfefgbhqsihwj.supabase.co`, `243-kulture-beta.vercel.app` (+ final domain when bought) |
| Scopes | `openid`, `email`, `profile` (non-sensitive) |
| Audience | External; while **Testing**, add tester Gmail accounts |
| Privacy policy / ToS links | public CGU / privacy URLs (needed before publishing) |

**Credentials → Create OAuth client ID → Web application:**

| Field | Value |
|-------|-------|
| Authorized redirect URIs | `https://kvmzriikfefgbhqsihwj.supabase.co/auth/v1/callback` |
| Authorized JavaScript origins (optional — only for a future One Tap) | `http://localhost:5173`, `https://243-kulture-beta.vercel.app` |

Only the Supabase callback goes in redirect URIs. App URLs (web origin,
`kulture243://…`) are **not** Google redirect URIs — Supabase forwards there.

## 3. Supabase Dashboard

**Authentication → Providers → Google:** Enable → paste Client ID + Client
Secret → Save. Leave callback as shown (`…/auth/v1/callback`).

**Authentication → URL Configuration:**

| Field | Value |
|-------|-------|
| Site URL | `https://243-kulture-beta.vercel.app` (email links + fallback) |
| Redirect URLs | `https://243-kulture-beta.vercel.app` |
| | `https://243-kulture-beta.vercel.app/**` |
| | `http://localhost:5173` |
| | `http://localhost:5173/**` |
| | `kulture243://auth/callback` (Android + iOS) |
| optional, Vercel previews | `https://243-kulture-beta-*.vercel.app/**` |

If a `redirectTo` is not in this list, Supabase silently falls back to the
Site URL — on native that opens the website instead of returning to the app.

## 4. Redirect matrix (what the code does)

| Platform | `redirectTo` sent to Supabase | How the session lands |
|----------|-------------------------------|-----------------------|
| Web / PWA | `window.location.origin` | Full-page redirect; supabase-js reads `#access_token` (implicit flow) |
| Android (Capacitor) | `kulture243://auth/callback` | System browser (Custom Tabs) → intent → `appUrlOpen` → `setSession` |
| iOS (Capacitor) | `kulture243://auth/callback` | `SFSafariViewController` → URL scheme → `appUrlOpen` → `setSession` |

Errors (`?error=access_denied`, provider disabled, etc.) show the existing
localized `oauth_cancelled` / `oauth_error` / `oauth_provider_disabled` messages.

Code: `src/lib/googleOAuth.js` (pure helpers, tested in
`scripts/google-oauth.test.mjs`), wired in `src/App.jsx` → `signInWithGoogle`,
`completeNativeOAuth`, and the `appUrlOpen` listener.

Why the system browser: Google rejects OAuth inside embedded WebViews
(`403 disallowed_useragent`). The app never falls back to navigating the WebView;
if no Browser plugin is present it shows `oauth_error` instead.

## 5. Native shells (when the Capacitor branches merge)

`main` has no `android/` / `ios/` yet (`cursor/capacitor-android-b223`,
`cursor/capacitor-ios-b223`; appId `app.kulture243.mobile`). On merge:

1. `npm i @capacitor/browser && npx cap sync` (the app reads it from the
   Capacitor bridge, so web builds never depend on it).
2. **Android** — add to `MainActivity` in `android/app/src/main/AndroidManifest.xml`
   (activity is already `launchMode="singleTask"`):

   ```xml
   <intent-filter>
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="kulture243" android:host="auth" android:path="/callback" />
   </intent-filter>
   ```

3. **iOS** — add to `ios/App/App/Info.plist`:

   ```xml
   <key>CFBundleURLTypes</key>
   <array>
     <dict>
       <key>CFBundleURLName</key><string>app.kulture243.mobile</string>
       <key>CFBundleURLSchemes</key><array><string>kulture243</string></array>
     </dict>
   </array>
   ```

   The iOS branch's `SceneDelegate` already forwards `openURLContexts` to
   Capacitor (`SceneDelegateProxy`), which emits `appUrlOpen`.

**Optional later — native Google Sign-In SDK** (account sheet without a
browser hop, via `signInWithIdToken`). Not wired. Would need extra Google
clients: **Android** (package `app.kulture243.mobile` + SHA-1 of debug *and*
Play upload/app-signing keys) and **iOS** (bundle ID `app.kulture243.mobile`),
with all client IDs listed comma-separated in Supabase → Google → Client IDs.
Only worth it if the browser hop feels slow in testing.

## 6. Verify after enabling

1. `curl -s https://kvmzriikfefgbhqsihwj.supabase.co/auth/v1/settings -H "apikey: <anon>"` → `external.google: true`
2. Web: language → CGU → **Continuer avec Google** → account picker → back on
   the site, signed in; profile row created by `handle_new_user`; reload keeps
   session; logout clears it; CGU acceptance recorded (pending-CGU path).
3. Cancel on the Google screen → back in app with *Connexion Google annulée*.
4. Email sign-up / login / reset still work (regression).
5. Android / iOS (after §5): same flow returns into the app, not the website.

Known limits: if the OS kills the app while the browser is open, the cold-start
launch URL is not yet read (`App.getLaunchUrl()`); user retries. Meta / TikTok
remain unwired.

## Related

- Store report: `docs/GOOGLE_OAUTH_VALIDATION.md` (2026-09-30 live probe)
- Account deletion Edge Function: `supabase/functions/delete-account`
- Deep links (content, not auth): `src/lib/deepLinks.js`
