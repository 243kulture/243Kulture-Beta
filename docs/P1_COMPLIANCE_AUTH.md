# P1 — Account deletion, report / moderation, Google OAuth

Scaffold for store + trust compliance. **Do not merge** until product OK.

## 1. Account deletion (end-to-end)

| Layer | Path |
|-------|------|
| UI | Profile → **Compte** → Supprimer mon compte → type `DELETE` → confirm |
| Edge | `supabase/functions/delete-account` — JWT required; `auth.admin.deleteUser` |
| SQL | `request_account_deletion` + `account_deletion_requests` + `profiles.deletion_requested_at` |
| Client | `src/lib/accountDeletion.js` |

**Safety:** two-step confirm (open sheet + type `DELETE`). No silent delete.

**Fallback:** if the Edge Function is not deployed, the app queues `request_account_deletion`, signs out, and shows contact `contact@243kulture.app` (aligned with legal draft).

**Legal alignment:** privacy copy « Paramètres → Compte → Supprimer mon compte » / email alternative.

## 2. Report / moderation

| Layer | Path |
|-------|------|
| UI | Report on public profile, feed post, other-user story |
| SQL | `moderation_reports` + RPC `submit_moderation_report` |
| Client | `src/lib/moderation.js` |

Reports land as **`status = pending`**, `auto_action = none`. **No silent auto-ban**, mute, or content takedown in the RPC.

Admin review is out-of-band (SQL / Dashboard / future admin UI). Soft rate limit: 20 reports / 24h per user.

## 3. Google OAuth + Auth URLs

Client already wired. User must enable provider + paste secrets — see [`GOOGLE_OAUTH_AUTH_URLS.md`](./GOOGLE_OAUTH_AUTH_URLS.md).

## Apply / deploy

1. **SQL migration** — run  
   `supabase/migrations/20261112083303_p1_moderation_and_account_deletion.sql`  
   in Supabase SQL Editor (or CLI).  
   *Note (2026-11-12): MCP `apply_migration` failed on project `kvmzriikfefgbhqsihwj` with postgres password auth error — apply manually until DB credentials are healthy.*
2. **Edge Function** `delete-account` — deployed to Beta with `verify_jwt=true` (slug `delete-account`). Re-deploy from `supabase/functions/delete-account` if the source drifts.
3. **Google OAuth** — user pastes Client ID/Secret in Dashboard (no fake secrets). See `GOOGLE_OAUTH_AUTH_URLS.md`.

Never commit service_role or Google Client Secret.
