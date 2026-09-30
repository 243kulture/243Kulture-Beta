# 243Kulture

Application React (Vite) pour la diaspora congolaise : rumba, histoire, culture,
communauté et Creator Experience V1. Sans `.env`, l'app tourne en **mode
maquette** (données en mémoire). Avec Supabase configuré, Auth / DB / Storage /
RPC prennent le relais automatiquement.

---

## 1. Lancer en local (maquette)

```bash
npm install
npm run dev
```

Ouvre l'URL affichée (souvent `http://localhost:5173`).

Build de production :

```bash
npm run build
npm run preview
```

---

## 2. Configurer Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dashboard → **Project Settings → API** : copie **Project URL** et la clé
   **anon public**.
3. Copie `.env.example` vers `.env` :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxx...
```

Ne committe jamais `.env`.

### Ordre d'exécution SQL (obligatoire)

Dans **SQL Editor**, exécute **dans cet ordre** :

1. `supabase/schema.sql`
2. `supabase/migrations/20260822_p1_security.sql`
3. `supabase/migrations/20260822_p2_creator_accounts.sql`
4. `supabase/migrations/20260822_p2_creator_experience.sql`
5. `supabase/migrations/20260822_p3_social_experience.sql`
6. `supabase/migrations/20260822_p4_progress_persistence.sql` ← XP / streak / badges
7. `supabase/migrations/20261001_p4_friend_invitations.sql` ← invitations d'amis

Les migrations sont idempotentes, mais l'ordre compte la première fois.
Sans l'étape 6, les gains d'XP et le streak ne peuvent pas être enregistrés
(le P1 bloque les updates client sur `profiles.xp` / `streak_days`).

---

## 3. Authentification

- **Google** : Dashboard → Authentication → Providers → Google (Client ID /
  Secret depuis Google Cloud Console ; redirect
  `https://<projet>.supabase.co/auth/v1/callback`).
- **E-mail + mot de passe** + récupération : actifs dans l'app.
- **Meta / TikTok** : non affichés tant que les providers OAuth ne sont pas
  réellement configurés (les boutons redirigent vers l'auth e-mail).

Après déploiement, ajoute l'URL du site dans Supabase → Authentication →
URL Configuration (**Site URL** + **Redirect URLs**).

---

## 4. Déploiement (Vercel)

1. Pousse le repo sur GitHub.
2. Importe le projet sur [vercel.com](https://vercel.com).
3. Ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les variables
   d'environnement Vercel.
4. Déploie, puis mets à jour les Redirect URLs Supabase.

---

## 5. Ce qui est branché vs maquette

**Branché dès que `.env` est rempli** (code présent — à valider sur ton
projet Supabase) :

- Session Google / e-mail, onboarding, nom de profil, langue
- Favoris, artistes suivis, votes débats, « J'y vais », collections découvertes
- Fil : posts (+ médias Storage `posts`), commentaires, republications,
  réactions posts **et** réactions débats
- Stories texte / photo / vidéo (Storage `stories`, 24 h) + réponses via RPC
- Messages privés + notifications message / story (trigger P3)
- Amis : recherche, profil public, invitations (send / accept / decline /
  cancel / remove) via RPCs P4b — pas d'INSERT client sur `friendships`
- Notifications `friend_invite` / `friend_accepted` / `message` / `story_reply`
- XP via RPC `increment_xp`, streak via `bump_daily_streak`, badges +
  `quiz_results` (nécessite migration P4a)
- Creator Experience V1 (statut, studio, portfolio à la une ≤ 6)

**Reste maquette / local / externe** :

- Contenu éditorial (articles, podcasts, quiz, artistes, timeline…) dans
  `src/App.jsx`
- Sans Supabase : profils démo `COMMUNITY_MEMBERS`, amis locaux
- Toggle « notifications push » : UI seule (pas de web-push)
- Meta / TikTok OAuth : config plateforme externe requise
- Vues / impressions créateur : non trackées (limite V1)
- Certification créateur : `admin_approve_creator()` côté SQL / service_role

Voir aussi `supabase/VALIDATION_P4.md` pour la checklist manuelle amis.

---

## 6. Structure

```
243kulture/
├── index.html
├── package.json
├── vite.config.js          ← PWA
├── .env.example
├── public/                 ← favicon + icônes PWA
├── supabase/
│   ├── schema.sql
│   ├── VALIDATION_P4.md
│   └── migrations/
│       ├── 20260822_p1_security.sql
│       ├── 20260822_p2_creator_accounts.sql
│       ├── 20260822_p2_creator_experience.sql
│       ├── 20260822_p3_social_experience.sql
│       ├── 20260822_p4_progress_persistence.sql
│       └── 20261001_p4_friend_invitations.sql
└── src/
    ├── main.jsx
    ├── App.jsx             ← application (monolithe volontaire)
    └── lib/supabaseClient.js
```

---

## 7. Langues

Interface : **FR / EN / NL / Lingala (`ln`)**. Les contenus éditoriaux et
médias tiers restent dans leur langue d'origine.

---

## 8. Creator Experience V1

Choix Membre / Créateur, profil créateur, demande de vérification, Creator
Studio, portfolio à la une (max 6). Pas de bannière admin ni tracking de vues
dans cette V1. Approbation : `select admin_approve_creator('<uuid>');` en
SQL Editor (rôle postgres / service_role).

---

## Sécurité

- Clé **anon** uniquement côté client ; RLS sur les tables.
- XP / streak non modifiables en direct depuis le client (P1 + RPC P4a).
- Invitations d'amis uniquement via RPC security definer (P4b).
- Buckets `stories` et `posts` : upload limité au dossier `auth.uid()`.
