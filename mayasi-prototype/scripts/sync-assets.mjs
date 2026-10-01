#!/usr/bin/env node
/**
 * Copy Mayasi / Meshy GLBs into public/models from known upload / store locations.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const destDir = path.join(root, 'public', 'models')

const searchRoots = [
  '/home/ubuntu/.cursor/projects/workspace/uploads',
  '/cursor/stores/self/media/mayasi-assets',
  '/cursor/stores/bc-c56263a8-5ec7-4a51-92dd-795fa05947d8/media/mayasi-assets',
  path.join(root, 'incoming'),
]

const patterns = [
  { match: /package.*\.json$/i, out: null }, // ignore
  { match: /Mayasi/i, out: 'Mayasi.glb' },
  { match: /Arise/i, out: 'Meshy_AI_Urban_Ease_biped_Animation_Arise_withSkin.glb' },
  { match: /Attack/i, out: 'Meshy_AI_Urban_Ease_biped_Animation_Attack_withSkin.glb' },
  { match: /Dead/i, out: 'Meshy_AI_Urban_Ease_biped_Animation_Dead_withSkin.glb' },
]

fs.mkdirSync(destDir, { recursive: true })

let copied = 0
for (const dir of searchRoots) {
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir)) {
    if (!/\.glb$/i.test(name)) continue
    const rule = patterns.find((p) => p.match.test(name) && p.out)
    if (!rule) continue
    const src = path.join(dir, name)
    const dest = path.join(destDir, rule.out)
    fs.copyFileSync(src, dest)
    // Keep hashed original name too for resolver
    fs.copyFileSync(src, path.join(destDir, name))
    console.log(`copied ${src} -> ${dest}`)
    copied += 1
  }
}

if (copied === 0) {
  console.log('No Mayasi/Meshy GLBs found in:')
  for (const dir of searchRoots) console.log(`  - ${dir}`)
  console.log('Place files in mayasi-prototype/public/models/ or media/mayasi-assets/')
  process.exitCode = 0
} else {
  console.log(`Synced ${copied} asset(s).`)
}
