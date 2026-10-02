# Mayasi — prototype cliquable (Meshy)

## Lancer

```bash
cd mayasi-prototype
npm install
npm run sync-assets
npm run dev
```

Ouvre **http://localhost:5174/**

`sync-assets` copie les **vrais** GLB (~4 Mo, magic glTF) depuis `/cursor/stores/self/media/mayasi-assets/` vers `public/models/` (ignore les stubs JS).

## Contrôles

Boutons groupés :

- **Locomotion** — Casual_Walk, Unsteady_Walk, Running, RunFast
- **Combat** — Attack, Triple_Combo_Attack, Boxing_Practice, BeHit_FlyUp, Dead
- **Dance** — Boom_Dance, You_Groove, All_Night_Dance
- **Skills** — Skill_01, Skill_03

Orbite souris/doigt · molette zoom.

## Assets

Chaque fichier `*_withSkin_*.glb` Meshy est un personnage + clip. Le viewer swap le modèle au clic (fiable, pas de retarget).
