---
cursor:
  subagentId: "bc-1cb77ea6-8090-5584-b7ce-9bfe11529ec6"
---

# Validation live Supabase — 243Kulture

**Date:** 2026-09-30  
**Project:** `243kulture-Beta` (`kvmzriikfefgbhqsihwj`, `eu-central-1`)  
**Worktree:** `/workspace/243kulture-work`  
**Mode:** restored from INACTIVE → ACTIVE_HEALTHY, then API tests with 2 comptes

`.env` local (non commité) :

- `VITE_SUPABASE_URL=https://kvmzriikfefgbhqsihwj.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = anon legacy (via Supabase MCP `get_publishable_keys`)

Comptes de test (créés via SQL `auth.users` + `auth.identities`, email confirmé ; signup API rate-limité) :

- `liveval.a@243kulture.local` / *(password local test, non inclus dans ce résumé ZIP)*
- `liveval.b@243kulture.local` / *(password local test, non inclus dans ce résumé ZIP)*

---

## Migrations (ordre)

| Étape | Fichier | Résultat |
|---|---|---|
| schema | `supabase/schema.sql` | **OK** — déjà présent ; vérifié (`schema_verify_base`) — pas de re-apply brut (`create policy` non idempotent) |
| p1 | `20260822_p1_security.sql` | **OK** — appliqué (drops ajoutés pour re-run) |
| p2 | `20260822_p2_creator_accounts.sql` | **OK** |
| p2ce | `20260822_p2_creator_experience.sql` | **OK** |
| p3 | `20260822_p3_social_experience.sql` | **OK** — + grant `UPDATE` notifications (fix live) |
| p4a | `20260822_p4_progress_persistence.sql` | **OK** — `increment_xp`, `bump_daily_streak`, INSERT badges |
| p4b | `20261001_p4_friend_invitations.sql` | **OK** — table + RPCs + revoke INSERT friendships |

Vérifications SQL : RPCs friend/xp/story présents ; `authenticated` EXECUTE friend+xp ; `anon` sans EXECUTE friend ; policies friendships SELECT/DELETE seulement ; buckets `stories` + `posts`.

---

## Matrice de tests live

| Domaine | Résultat | Preuve / note |
|---|---|---|
| Auth login (2 comptes) | **OK** | password grant → JWT |
| Friend search | **OK** | `profiles` ilike display_name |
| Public profile | **OK** | lecture profil B par A |
| Invite send | **OK** | `send_friend_invitation` |
| Invite notification | **OK** | `notifications.type=friend_invite` |
| Invite decline | **OK** | `decline_friend_invitation` |
| Invite re-send after decline | **OK** | |
| Invite accept | **OK** | `accept_friend_invitation` |
| Friendship created | **OK** | 2 rows (paire) |
| Accept notification | **OK** | `friend_accepted` |
| Friendships client INSERT blocked | **OK** | `permission denied` |
| Friendship remove | **OK** | `remove_friendship` → 0 rows |
| Messages insert + read | **OK** | |
| Message notification | **OK** | trigger P3 |
| Notifications mark-read | **OK** | après grant UPDATE (bug confirmé + fixé) |
| XP `increment_xp` | **OK** | xp persisté |
| XP client update blocked | **OK** | trigger anti-triche |
| Streak `bump_daily_streak` | **OK** | streak_days=1 |
| Quiz results insert | **OK** | |
| Quiz results update blocked | **OK** | RLS no-op (score inchangé ; pas d’erreur PostgREST) |
| Badges insert + select | **OK** | |
| Debate reactions upsert | **OK** | |
| Language persistence | **OK** | `profiles.language` ln→fr |
| Storage stories upload | **OK** | bucket `stories` |
| Stories table insert | **OK** | |
| Storage posts upload | **OK** | bucket `posts` |
| Posts table insert (+ media) | **OK** | |
| RPC / grants / RLS friend | **OK** | voir migrations |
| Google OAuth UI end-to-end | **NOT TESTED** | provider externe ; auth e-mail validée |
| Story reply RPC cross-user | **NOT TESTED** | insert story + messages path OK ; RPC accents vérifiés en SQL |
| Meta / TikTok OAuth | **NOT TESTED** | hors scope / non branchés UI |
| Push web notifications | **NOT TESTED** | UI-only (connu) |

---

## Bug confirmé et fix minimal

1. **`notifications` mark-read → `permission denied`**  
   Policy UPDATE existait, mais **GRANT UPDATE** manquait pour `authenticated`.  
   - Live : migration `fix_notifications_update_grant`  
   - Source : grant ajouté dans `20260822_p3_social_experience.sql`  
   - Re-test : **OK**

Aucun autre bug App.jsx confirmé sur ce passage. Pas de rewrite d’architecture.

---

## Build

`npm run build` — **OK** (Vite 5.4.21, warning chunk >500kB attendu).

---

## Statut A–I (honnête)

| Lettre | Thème | Statut |
|---|---|---|
| A | Architecture | OK (inchangée) |
| B | Migrations live | OK (appliquées / vérifiées) |
| C | Maquette sans `.env` | OK (audit antérieur ; non rejouée ici) |
| D | Auth live | OK e-mail/mdp ; Google **NOT TESTED** |
| E | Friend flow complet | OK |
| F | Messages + notifications | OK (après fix grant) |
| G | XP / streak / quiz / badges | OK |
| H | Storage stories/posts + debate + langue | OK |
| I | Livrable ZIP sans secrets | OK |

**Verdict :** validation live **réussie** sur le projet `243kulture-Beta` pour le périmètre RPC/RLS/social/progression/storage ci-dessus. Ne pas confondre avec une certification OAuth Google ou push.
