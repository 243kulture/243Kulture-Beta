# Validation manuelle — P4 amis & invitations

À exécuter **après** toutes les migrations (schema → p1 → p2a → p2b → p3 →
p4a progress → p4b invitations) avec un vrai `.env` Supabase.

Cette checklist n'a **pas** été exécutée dans l'environnement agent (pas de
projet Supabase / `.env`).

## Prérequis

- Deux comptes test (A et B), e-mail ou Google
- Chaque compte a un `display_name` distinct (Profil → modifier le nom)
- SQL P4b appliqué ; RPCs visibles dans Database → Functions

## Parcours

| # | Action | Attendu |
|---|---|---|
| 1 | A recherche B par nom (≥ 2 caractères) | Résultat dans la liste |
| 2 | A envoie une invitation | Statut « Invitation envoyée » ; B reçoit notif `friend_invite` |
| 3 | A renvoie la même invitation | Erreur `invite_already_sent` (traduite) |
| 4 | B ouvre Amis / notifs et accepte | Les deux deviennent amis ; A reçoit `friend_accepted` |
| 5 | B refuse une nouvelle invite (après remove) | Statut `declined` ; pas d'amitié |
| 6 | A annule une invite pending | Statut `cancelled` |
| 7 | A ou B ouvre le profil public de l'autre | Nom, bio, pays, statut créateur, actions relation |
| 8 | Un ami supprime la relation | Plus d'amis ; messages restent en historique |
| 9 | Tentative INSERT client dans `friendships` | Échec RLS (pas de policy INSERT) |
| 10 | Message privé entre amis | Ligne dans `messages` ; notif `message` chez le destinataire |

## RPCs à vérifier

- `send_friend_invitation`
- `accept_friend_invitation`
- `decline_friend_invitation`
- `cancel_friend_invitation`
- `remove_friendship`

## Non-régression rapide

- Stories + réponse → message + notif `story_reply` (une seule)
- Post + réaction + commentaire
- XP après follow artiste (`increment_xp`) ; streak après login (`bump_daily_streak`)
