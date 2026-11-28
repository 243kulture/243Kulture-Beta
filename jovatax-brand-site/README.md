# Jovatax — site marque + bêta download (tip)

Next.js tip (pas le monolithe app Beta social). Deep green + gold.

## Sécurité

- `DOWNLOAD_SESSION_SECRET` ≥32, **aucun** fallback HMAC
- `INVITE_HASH_ALLOWLIST` stricte ; vide = refus
- APK sous `secured/downloads/` — middleware 404 sur `/downloads/*` et `*.apk`
- Download uniquement via `GET /api/download/android` + session

## Dev

```bash
cp .env.example .env.local
# renseigner secret ≥32 + allowlist hashes
npm install
npm run dev -- -H 127.0.0.1 -p 4321
npm test
npm run test:smoke
```

Secrets publish (noms) : `INVITE_HASH_ALLOWLIST`, `DOWNLOAD_SESSION_SECRET`.
