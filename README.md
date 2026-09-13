# 243Kulture — projet de démarrage

Ce dossier est un vrai projet React (Vite) prêt à tourner en local, avec le
backend Supabase préparé (schéma SQL) et la connexion Google déjà branchée.

Tant que Supabase n'est pas configuré, l'app fonctionne exactement comme le
prototype qu'on a construit (mode maquette, données en mémoire). Dès que tu
remplis `.env`, la vraie connexion Google prend le relais automatiquement.

---

## 1. Lancer le projet en local (mode maquette, sans backend)

```bash
npm install
npm run dev
```

Ouvre l'URL affichée dans le terminal (en général `http://localhost:5173`).
L'app tourne exactement comme dans le prototype qu'on a testé ensemble.

---

## 2. Créer ton projet Supabase (le backend)

1. Va sur [supabase.com](https://supabase.com) → crée un compte gratuit.
2. **New Project** → choisis un nom (ex. `243kulture`), un mot de passe de
   base de données (garde-le précieusement), et une région proche de ton
   public (Europe de l'Ouest).
3. Attends 1-2 minutes que le projet soit prêt.

### Récupérer tes clés API
Dans le Dashboard Supabase → **Project Settings → API** :
- Copie **Project URL**
- Copie la clé **anon public**

Crée un fichier `.env` à la racine (copie `.env.example`) et colle ces deux
valeurs :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxx...
```

### Créer les tables
Dashboard Supabase → **SQL Editor → New query** → colle tout le contenu du
fichier `schema.sql` de ce projet → **Run**.

Ça crée toutes les tables (profils, favoris, amis, publications, messages,
stories, votes de débats, participation aux événements, quiz, badges,
progression des collections) avec la sécurité (Row Level Security) déjà
configurée pour que chacun ne puisse lire/modifier que ce qui le concerne.

### Ordre d'exécution (important)
Exécute les fichiers SQL dans cet ordre exact (chaque migration dépend de la
précédente) :
1. `schema.sql`
2. `20260822_p1_security.sql`
3. `20260822_p2_creator_accounts.sql`
4. `20260822_p2_creator_experience.sql`
5. `20260822_p3_social_experience.sql`
6. `20260822_p4_progress_persistence.sql`

Les migrations P2, P3 et P4 sont conçues pour être rejouables. `schema.sql`
et P1 ne sont pas totalement idempotents : leurs policies initiales ou
remplacées peuvent provoquer une erreur si elles sont rejouées telles quelles.
Sur une base vierge, l'ordre ci-dessus est sûr et doit être respecté.

> **Important pour un projet Supabase déjà existant** : si tu as déjà exécuté
> les migrations 1 à 5 sur ton projet Supabase avant cette version bêta,
> il suffit d'exécuter la nouvelle migration `20260822_p4_progress_persistence.sql`
> (elle est additive, les précédentes n'ont pas besoin d'être rejouées).
> Sans cette étape, le gain d'XP, le déblocage de badges et le streak ne
> s'enregistreront pas, même avec la nouvelle version du code.

---

## 3. Activer la connexion Google

1. Dashboard Supabase → **Authentication → Providers → Google** → active-le.
2. Il te demande un **Client ID** et un **Client Secret** Google. Pour les
   obtenir :
   - Va sur [Google Cloud Console](https://console.cloud.google.com/)
   - Crée un projet (ou utilise un existant)
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Type d'application : **Web application**
   - Dans **Authorized redirect URIs**, colle l'URL que Supabase t'indique
     dans l'écran Google Provider (ressemble à
     `https://xxxxx.supabase.co/auth/v1/callback`)
   - Copie le **Client ID** et le **Client Secret** générés, colle-les dans
     Supabase, sauvegarde.
3. Relance `npm run dev` (ou redéploie) — le bouton "Continuer avec Google"
   ouvre maintenant une vraie fenêtre de connexion Google.

Meta et TikTok fonctionnent sur le même principe (Dashboard Supabase →
Authentication → Providers), mais nécessitent chacun la création d'une app
développeur sur leur plateforme respective (Meta for Developers / TikTok for
Developers) — plus long à valider, à faire quand tu seras prêt.

---

## 4. Mettre en ligne (déploiement)

### Option recommandée : Vercel (gratuit, simple)
1. Mets ce projet sur GitHub (`git init`, `git add .`, `git commit`, crée un
   repo sur GitHub, `git push`).
2. Va sur [vercel.com](https://vercel.com) → **Add New Project** → importe
   ton repo GitHub.
3. Dans les réglages du projet Vercel, ajoute les mêmes variables que ton
   `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) sous
   **Environment Variables**.
4. Déploie. Chaque `git push` sur la branche principale redéploie
   automatiquement — c'est comme ça que tu feras tes mises à jour.
5. Une fois en ligne, dans Supabase → Authentication → URL Configuration,
   ajoute ton URL Vercel (ex. `https://243kulture.vercel.app`) dans **Site
   URL** et **Redirect URLs**, sinon la connexion Google ne redirigera pas
   correctement après le login.

### Domaine personnalisé
Dans Vercel → ton projet → **Settings → Domains**, ajoute `243kulture.app`
(ou ce que tu as acheté) et suis les instructions DNS.

---

## 5. Ce qui est branché sur Supabase, et ce qui reste maquette

**Déjà branché sur le vrai backend** (dès que `.env` est configuré) :
- Connexion Google (session persistante entre les ouvertures)
- Favoris
- Artistes suivis
- XP / niveau (colonne `profiles.xp`, via la RPC sécurisée `increment_xp`)
- Streak quotidien (colonnes `profiles.streak_days` / `last_active_date`,
  via la RPC sécurisée `bump_daily_streak`)
- Votes aux débats
- Réactions aux débats
- "J'y vais" aux événements
- Badges débloqués (paliers automatiques et badges de fin de quiz)
- Progression des collections (items découverts)
- Publications du fil communautaire
- Stories **texte, photo et vidéo** (upload réel vers Supabase Storage)
- **Amis réels** — recherche de vrais utilisateurs inscrits par nom (onglet
  Communauté → Amis), ajout/suppression synchronisés
- **Messages privés réels** — conversations chargées et envoyées via la
  table `messages`, entre vraies personnes inscrites
- **Nom de profil modifiable** (dans Profil) — nécessaire pour que la
  recherche d'utilisateurs ait un sens (tout le monde s'appelle "Fan de
  rumba" par défaut sinon)

Toutes ces données sont aussi **rechargées automatiquement** à la connexion
(`useEffect` dédié dans `App.jsx`), donc un utilisateur retrouve son profil
tel qu'il l'a laissé, même sur un autre appareil.

**Encore en mode maquette (mémoire locale)** :
- Sans Supabase configuré, l'onglet Amis retombe automatiquement sur
  `COMMUNITY_MEMBERS` (profils de démonstration) exactement comme avant —
  utile pour présenter/tester l'app sans backend
- Les notifications éditoriales de la page d'accueil restent locales. Les
  notifications sociales générées par Supabase (par exemple une réponse à
  une Story ou un message privé) sont, elles, rechargées depuis la table
  `notifications` et marquées comme lues à l'ouverture.

Les résultats de quiz sont désormais historisés dans `quiz_results` quand
Supabase est configuré, puis rechargés à la connexion et affichés dans
l'écran de résultat. Le score final inclut bien la dernière réponse donnée.

La migration `20260822_p3_social_experience.sql` crée également une
notification serveur pour chaque nouveau message privé. Si la migration P3
était déjà appliquée, il faut la rejouer pour installer ce trigger idempotent.

### Test d'intégration Supabase

Le projet Supabase configuré répond correctement et expose les tables
applicatives ainsi que la RPC `send_story_reply`. Le test d'intégration réel
entre deux comptes confirmés passe désormais pour les profils, publications,
médias, Stories, commentaires, republications, messages, notifications,
quiz, XP et streak. Les scénarios négatifs RLS et rollback testés passent
également. Le lanceur utilise un fichier local non versionné
`.env.test.local`.

Le test laisse volontairement un message privé et un résultat de quiz par
exécution : les policies client du schéma n'autorisent pas leur suppression.
Ces résidus sont attendus pour des comptes de test et ne concernent pas les
posts, Stories ou fichiers Storage, qui sont nettoyés automatiquement.

---

## 6. Structure du projet

```
243kulture-app/
├── index.html
├── package.json
├── vite.config.js          ← config PWA (installable sur mobile)
├── public/
│   ├── favicon.svg           ← icône (placeholder, à remplacer par le vrai logo)
│   ├── icon-192.png           ← icône PWA (placeholder)
│   └── icon-512.png           ← icône PWA (placeholder)
├── .env.example             ← à copier en .env
├── schema.sql                 ← schéma initial Supabase
├── 20260822_p*_*.sql          ← migrations Supabase, à exécuter dans l'ordre
├── main.jsx                   ← point d'entrée React
├── App.jsx                    ← application principale
└── supabaseClient.js          ← connexion au backend
```

---

## Prochaines étapes suggérées

1. Teste le mode maquette en local (`npm run dev`) pour vérifier que tout
   fonctionne bien identique au prototype.
2. Crée ton projet Supabase et exécute le schéma.
3. Active Google, teste la vraie connexion — favoris, XP, badges, votes,
   événements et publications se synchronisent déjà automatiquement.
4. Déploie sur Vercel, connecte ton domaine.
5. Reviens vers moi pour construire un vrai annuaire d'utilisateurs (pour
   que "amis" et "messages" fonctionnent avec de vraies personnes), et pour
   brancher l'upload de photos/vidéos de stories sur Supabase Storage.


## Stories — Supabase Storage

La version actuelle utilise le bucket Supabase Storage `stories` pour les photos et vidéos.

1. Ouvrir `schema.sql` dans le SQL Editor de Supabase et exécuter le script (ou au minimum la section `STORAGE DES STORIES`).
2. Vérifier que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont configurées dans `.env`.
3. Le bucket `stories` est créé automatiquement par le SQL et les uploads sont rangés dans un dossier portant l'ID de l'utilisateur.
4. Les Stories visibles dans l'app sont limitées aux 24 dernières heures.

En mode maquette (Supabase non configuré), le fonctionnement local reste inchangé.


## Authentification e-mail
La version actuelle prend en charge Google, la création/connexion par e-mail + mot de passe et la récupération du mot de passe. Meta et TikTok ne sont pas affichés tant que leurs intégrations OAuth ne sont pas réellement configurées.

## Onboarding personnalisé
Après la première inscription, 243Kulture demande les centres d'intérêt, les artistes à suivre et le pays/région. Ces préférences sont enregistrées dans `profiles` et servent de base à la personnalisation.


## Creator Experience V1

La V1 ajoute une première expérience créateur sans modifier les fonctionnalités membres existantes : choix Membre/Créateur, profil créateur, badge/statut, demande de vérification, Creator Studio et portfolio à la une (6 publications maximum).

### Migration Supabase

Après les migrations P1 et P2 comptes créateurs, exécuter `20260822_p2_creator_experience.sql`.

### Limites V1

Les vues/impressions ne sont pas encore trackées et ne sont donc pas simulées. Il n'y a pas encore de bannière créateur ni d'interface d'administration de certification.


## Social Experience — ajout du 22/08/2026

Cette version ajoute de façon additive :
- authentification obligatoire, sans mode invité ;
- liste de pays complète avec drapeaux et recherche ;
- défilement PC/mobile renforcé ;
- carrousel d’actualité automatique toutes les 4 secondes ;
- commentaires et réponses aux commentaires ;
- réactions persistantes quand Supabase est configuré ;
- republication et partage ;
- photos/vidéos dans les publications ;
- réponses aux Stories avec message + notification via RPC sécurisé ;
- migration `20260822_p3_social_experience.sql`.

Cette migration est additive et ne remplace pas les migrations P1/P2 existantes.


## Correctifs de persistance — bêta du 06/09/2026

La migration `20260822_p1_security.sql` (durcissement anti-triche de l'XP)
avait été appliquée sans jamais créer la fonction de remplacement permettant
un gain d'XP légitime, et avait involontairement supprimé la permission
d'enregistrer des badges. Résultat une fois Supabase configuré : aucun gain
d'XP, aucun badge enregistré, aucune réaction de débat sauvegardée, et un
streak qui restait bloqué à zéro.

La migration `20260822_p4_progress_persistence.sql`
corrige ces quatre points en ajoutant deux fonctions RPC sécurisées
(`increment_xp`, `bump_daily_streak`) et en restaurant la permission
d'insertion sur la table `badges`. Le fonctionnement visible par
l'utilisateur (montants d'XP, conditions de déblocage des badges, règles du
streak) reste identique à ce qui était prévu à l'origine — seule la
sauvegarde en base était manquante.

À exécuter après les migrations 1 à 5 (voir section 2 ci-dessus).
