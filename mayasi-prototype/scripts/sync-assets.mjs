#!/usr/bin/env node
/**
 * Copy real Mayasi / Meshy GLBs into public/models/.
 * Ignores tiny JS/stub "GLBs" from bad uploads (size < 100 KB).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const destDir = path.join(root, 'public', 'models')

const searchRoots = [
  '/cursor/stores/self/media/mayasi-assets',
  '/cursor/stores/bc-c56263a8-5ec7-4a51-92dd-795fa05947d8/media/mayasi-assets',
  '/home/ubuntu/.cursor/projects/workspace/uploads',
  path.join(root, 'incoming'),
]

const STUB_NAMES = new Set([
  'Mayasi_d3ee.glb',
  'Meshy_AI_Urban_Ease_biped_Animation_Arise_withSkin_fff7.glb',
  'Meshy_AI_Urban_Ease_biped_Animation_Attack_withSkin_c2d7.glb',
  'Meshy_AI_Urban_Ease_biped_Animation_Dead_withSkin_e683.glb',
])

const MIN_REAL_BYTES = 100_000

function isGlbMagic(buf) {
  return buf.length >= 4 && buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46
}

function clipKeyFromName(name) {
  const m = name.match(/Animation_(.+?)_withSkin/i)
  if (m) return m[1]
  return path.basename(name, '.glb')
}

fs.mkdirSync(destDir, { recursive: true })

for (const name of fs.readdirSync(destDir)) {
  if (/\.glb$/i.test(name) || name === 'manifest.json') {
    fs.unlinkSync(path.join(destDir, name))
  }
}

let copied = 0
const seen = new Set()

for (const dir of searchRoots) {
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir)) {
    if (!/\.glb$/i.test(name)) continue
    if (STUB_NAMES.has(name)) {
      console.log(`skip stub ${name}`)
      continue
    }
    const src = path.join(dir, name)
    const st = fs.statSync(src)
    if (st.size < MIN_REAL_BYTES) {
      console.log(`skip tiny ${name} (${st.size} B)`)
      continue
    }
    const head = Buffer.alloc(4)
    const fd = fs.openSync(src, 'r')
    fs.readSync(fd, head, 0, 4, 0)
    fs.closeSync(fd)
    if (!isGlbMagic(head)) {
      console.log(`skip non-glTF ${name}`)
      continue
    }

    const key = clipKeyFromName(name)
    if (seen.has(key.toLowerCase())) continue
    seen.add(key.toLowerCase())

    const destName = `Meshy_${key}.glb`
    fs.copyFileSync(src, path.join(destDir, destName))
    console.log(`copied ${name} -> ${destName} (${(st.size / 1e6).toFixed(1)} MB)`)
    copied += 1
  }
}

const entries = fs
  .readdirSync(destDir)
  .filter((n) => /^Meshy_.+\.glb$/i.test(n))
  .map((n) => {
    const clip = n.replace(/^Meshy_/, '').replace(/\.glb$/i, '')
    return { id: clip, file: n, url: `/models/${n}` }
  })
  .sort((a, b) => a.id.localeCompare(b.id))

fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify({ clips: entries }, null, 2))
console.log(`Synced ${copied} real GLB(s). Manifest: ${entries.length} clip(s).`)
if (copied === 0) {
  console.log('No real GLBs found in:')
  for (const d of searchRoots) console.log(`  - ${d}`)
  process.exitCode = 1
}
