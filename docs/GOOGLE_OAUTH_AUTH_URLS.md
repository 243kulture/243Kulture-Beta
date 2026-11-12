# Google OAuth + Auth URLs — setup (user secrets)

**Status:** client wiring is ready in the app. Live Google sign-in stays **blocked** until you paste real credentials in dashboards. This doc never invents Client ID / Secret.

## What the app already does

- `signInWithOAuth({ provider: "google", redirectTo: window.location.origin, skipBrowserRedirect: true })`
- Preflight against the authorize URL so a disabled provider shows an in-app error (not raw JSON)
- Shared email + Google session restore via `getSession` / `onAuthStateChange`
- Profile trigger `handle_new_user` creates `profiles` after first Google login

Helper: `src/lib/googleOAuth.js` → `buildGoogleOAuthSetup(...)`.

## 1. Google Cloud Console

Create an **OAuth 2.0 Client ID** (application type: **Web application**).

| Field | Value |
|-------|--------|
| Authorized JavaScript origins | `http://localhost:5173` (dev) |
| Authorized JavaScript origins | your production HTTPS origin (when known) |
| Authorized redirect URIs | `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback` |

For project `243kulture-Beta` the callback is:

`https://kvmzriikfefgbhqsihwj.supabase.co/auth/v1/callback`

Also complete the OAuth consent screen (app name, support email, test users if External + Testing).

**Do not** put Client ID / Secret in git, `.env` committed files, ZIP, or chat.

## 2. Supabase Dashboard → Authentication → URL Configuration

| Field | Dev | Prod |
|-------|-----|------|
| Site URL | `http://localhost:5173` | `https://YOUR-PRODUCTION-DOMAIN` |
| Redirect URLs | `http://localhost:5173` and `http://localhost:5173/**` | prod origin + `/**` |

## 3. Supabase Dashboard → Authentication → Providers → Google

1. Enable **Sign in with Google**
2. Paste **Client ID** and **Client Secret** from Google Cloud
3. Leave the callback as the platform default (`…/auth/v1/callback`)

## 4. Verify

1. Open the app → accept CGU → **Continuer avec Google**
2. Google account picker → consent → return to app with session
3. Profile loads; reload keeps session; logout clears it

If you see *Google n'est pas encore activé…*, the provider is still off or secrets are missing.

## Related

- Store report: `docs/GOOGLE_OAUTH_VALIDATION.md` (historical live probe)
- Account deletion Edge Function: `supabase/functions/delete-account`
- Moderation queue migration: `supabase/migrations/20261112083303_p1_moderation_and_account_deletion.sql`
