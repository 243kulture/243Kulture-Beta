# Push — checklist Firebase (Android) + APNs (iOS)

**Statut code (Wave 1) :** câblage client prêt, **`VITE_PUSH_ENABLED=false`** partout. Aucun secret dans le repo.
Rien n’est envoyé, aucun prompt OS, aucune écriture Supabase tant que le flag est off.

> Ne colle **jamais** un secret (clé `.p8`, JSON service account, clé serveur) dans le chat, Git, un ticket,
> ou une variable `VITE_*` (tout ce qui commence par `VITE_` est publié dans le bundle web).

---

## 0. Ce qui est déjà câblé (côté app)

| Élément | Où | Comportement flag OFF | Flag ON (après cette checklist) |
|---|---|---|---|
| Consentement d’abord | Profil → Notifications → feuille « Rester au courant, sans spam » | Feuille + préférences locales seulement | Feuille → **puis** prompt OS au clic « Continuer » |
| Familles MVP | Messages privés · Posts suivis · Rappel 6 h | Switches locaux | Synchro `push_preferences` |
| Token | `registration` listener **avant** `register()` | Jamais appelé | RPC `register_push_device` |
| Logout / switch off | `disable_push_device` + `unregister()` | Rien | Device désactivé avant `signOut` (max 3 s) |
| Présence 6 h | `visibilitychange` + `appStateChange` | Rien | RPC `touch_user_presence` (debounce 5 min client + serveur) |
| Tap notif → écran | `pushNotificationActionPerformed` | Rien | DM → Messages · intérêt / 6 h → **Abonnements** |
| CTA contextuels | Onglet Messages · après un follow | **Jamais affichés** | Seulement sur natif, 1 fois / 30 j par contexte, jamais si refus OS |
| Canaux Android | `dm` · `interest` · `reengage` | — | Créés après accord OS |

Code : `src/lib/pushNotifications.js` · tests : `scripts/push-wiring.test.mjs` · SQL (draft, non appliqué) : `supabase/drafts/push_phase1_tokens.sql`.

---

## 1. Firebase — Android (FCM)

Prérequis : compte Google du projet 243Kulture.

- [ ] **Créer le projet** sur <https://console.firebase.google.com> → « Ajouter un projet » → nom `243Kulture` (Google Analytics : **désactivé**, pas nécessaire pour FCM).
- [ ] **Ajouter une app Android** → nom de package **exactement** `app.kulture243.mobile` (= `appId` dans `capacitor.config.json`, PR #11).
  - Surnom : `243Kulture Android`. SHA-1 : optionnel pour FCM (utile plus tard pour Google Sign-In natif — voir `ANDROID_PLAY_SIGNING.md`).
- [ ] **Télécharger `google-services.json`** → le placer dans `android/app/google-services.json` (branche Android, **après** OK sur #11).
  - Ce fichier n’est pas une clé privée, mais il identifie le projet. Décision à prendre : l’ajouter au `.gitignore` Android (la ligne `# google-services.json` est commentée dans `android/.gitignore` de #11) et l’injecter au build, **ou** le committer si le repo reste privé.
  - `android/app/build.gradle` (#11) applique déjà le plugin `com.google.gms.google-services` **seulement si** ce fichier existe.
- [ ] **Clé service account (HTTP v1)** — l’API « legacy server key » est fermée, ne pas l’utiliser.
  - Firebase → ⚙ Paramètres du projet → **Comptes de service** → « Générer une nouvelle clé privée » → fichier JSON.
  - C’est un **secret** : il va **uniquement** dans Supabase (§3), jamais dans l’app.
- [ ] Noter le **Project ID** Firebase (ex. `kulture243-xxxxx`).

⚠️ **Crash Android :** `PushNotifications.register()` sans `google-services.json` fait planter l’app. Ne **jamais** builder un APK avec `VITE_PUSH_ENABLED=true` sans ce fichier.

---

## 2. Apple — iOS (APNs)

Prérequis : **Apple Developer Program** (payant) + **Mac avec Xcode** (voir `IOS_SCAFFOLD.md`, PR #12).

- [ ] Noter le **Team ID** (developer.apple.com → Membership).
- [ ] **Identifier** : Certificates, IDs & Profiles → Identifiers → App ID `app.kulture243.mobile` → cocher **Push Notifications**.
- [ ] **Clé APNs** : Keys → « + » → cocher **Apple Push Notifications service (APNs)** → télécharger le fichier **`AuthKey_XXXXXXXXXX.p8`**.
  - ⚠️ Téléchargeable **une seule fois**. Le ranger dans un coffre (1Password, etc.).
  - Noter le **Key ID** (10 caractères).
  - Une clé `.p8` sert pour sandbox **et** production, et pour toutes les apps du Team.
- [ ] **Xcode** (sur la branche iOS, après OK #12) → target App → *Signing & Capabilities* :
  - « + Capability » → **Push Notifications** (crée `App.entitlements` — absent de #12 aujourd’hui).
  - « + Capability » → **Background Modes** → cocher *Remote notifications* (optionnel MVP, utile pour badges silencieux).
- [ ] **AppDelegate.swift** (#12 ne l’a pas encore) — ajouter le relais token exigé par `@capacitor/push-notifications` :

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}

func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

- [ ] Choix d’envoi iOS : **APNs direct** depuis l’Edge Function (recommandé). Le plugin Capacitor renvoie un **token APNs** (hex) sur iOS, pas un token FCM — d’où `provider = 'apns'` dans `push_devices`. Passer iOS par FCM demanderait le SDK Firebase Messaging iOS en plus (hors MVP).

---

## 3. Supabase — secrets + base

Projet Beta : `kvmzriikfefgbhqsihwj`.

- [ ] **OK explicite** pour appliquer le SQL : copier `supabase/drafts/push_phase1_tokens.sql` → `supabase/migrations/<timestamp>_push_phase1_tokens.sql`, exécuter dans le SQL Editor.
  - Crée `push_preferences`, `push_devices`, `user_presence`, `push_deliveries` + RPC `register_push_device`, `disable_push_device`, `touch_user_presence`. RLS : chacun ne lit que ses lignes ; devices / présence / journal écrits seulement via RPC ou service role.
- [ ] **Secrets Edge Functions** (Dashboard → Edge Functions → *Secrets*, ou `supabase secrets set …`) :

| Nom | Valeur | Source |
|---|---|---|
| `FCM_PROJECT_ID` | Project ID Firebase | §1 |
| `FCM_SERVICE_ACCOUNT_JSON` | contenu **complet** du JSON service account | §1 |
| `APNS_KEY_P8` | contenu du fichier `.p8` (avec `-----BEGIN PRIVATE KEY-----`) | §2 |
| `APNS_KEY_ID` | Key ID (10 car.) | §2 |
| `APNS_TEAM_ID` | Team ID | §2 |
| `APNS_BUNDLE_ID` | `app.kulture243.mobile` | §2 |
| `APNS_ENV` | `sandbox` (builds Xcode / TestFlight interne) puis `production` | — |

- [ ] **Edge Function `dispatch-push`** (Phase 1, pas encore écrite) : déclenchée par Database Webhook sur `insert` dans `notifications` ; vérifie préférences + caps (4/h, 12/j) ; envoie FCM (Android, `android.notification.channel_id` = `dm` / `interest` / `reengage`) ou APNs (iOS) ; écrit `push_deliveries`. Payload `data` : `{ kind, post_id?, deep_link? }` — l’app route déjà ces valeurs.

---

## 4. Ordre d’activation (ne pas sauter d’étape)

1. [ ] Samsung OK → merge **#11** (Android) — *décision utilisateur*.
2. [ ] Mac OK → rebase / merge **#12** (iOS) — *décision utilisateur*.
3. [ ] §1 Firebase + `google-services.json` dans le build Android.
4. [ ] §2 APNs + capability + AppDelegate.
5. [ ] §3 SQL appliqué + secrets + `dispatch-push` déployée (DMs d’abord).
6. [ ] Build **natif** avec `VITE_PUSH_ENABLED=true` (ex. `.env.production.local` sur la machine de build APK/Xcode).
   **Web (Vercel) peut rester `false`** : sur le web le flag ne donne que des préférences, pas de Web Push.
7. [ ] Tests device réel (§5), puis seulement familles intérêt + 6 h.

Rollback instantané : rebuild avec `VITE_PUSH_ENABLED=false` (côté client) ou désactiver le webhook `dispatch-push` (côté serveur).

---

## 5. Tests sur appareil réel (après activation)

- [ ] Lancement à froid : **aucun** prompt notifications.
- [ ] Profil → switch → la feuille explique **avant** le prompt OS ; « Plus tard » ne demande rien.
- [ ] « Continuer » → prompt OS → Autoriser → une ligne `push_devices` (`enabled = true`) pour ce user.
- [ ] Refuser → switch reste off + chemin Réglages ; l’app reste utilisable ; pas de CTA qui revient.
- [ ] Désactiver le switch → ligne `enabled = false`.
- [ ] Logout → ligne `enabled = false` ; login avec un autre compte sur le même téléphone → l’ancien compte ne reçoit plus rien.
- [ ] Message reçu app fermée → notif → tap → onglet **Messages**.
- [ ] Rappel 6 h / post suivi → tap → onglet **Abonnements**.
- [ ] Android 13+ : canaux « Messages privés », « Posts suivis », « Rappels » visibles dans Réglages de l’app.
