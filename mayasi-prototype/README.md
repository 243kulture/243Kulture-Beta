# Mayasi — prototype cliquable

## Lancer

```bash
cd mayasi-prototype
npm install
npm run sync-assets   # copie les GLB depuis uploads/ ou media/mayasi-assets/ si présents
npm run dev
```

Ouvre **http://localhost:5174/**

## Contrôles

| UI / clavier | Action |
|---|---|
| **Arise** / `1` | Animation se relever |
| **Attack** / `2` | Animation attaque |
| **Dead** / `3` | Animation chute |
| **Idle** / `4` | Pose / boucle repos |
| Souris / doigt | Orbite |
| Molette | Zoom |

## Assets attendus (`public/models/`)

- `Mayasi.glb` (base)
- `Meshy_AI_Urban_Ease_biped_Animation_Arise_withSkin.glb`
- `Meshy_AI_Urban_Ease_biped_Animation_Attack_withSkin.glb`
- `Meshy_AI_Urban_Ease_biped_Animation_Dead_withSkin.glb`

Sans ces fichiers, le viewer utilise un **stand-in** temporaire (RobotExpressive) pour garder la démo cliquable, avec un bandeau d’avertissement.
