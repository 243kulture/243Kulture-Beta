import './styles.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const GROUPS = [
  {
    id: 'locomotion',
    label: 'Locomotion',
    clips: ['Casual_Walk', 'Unsteady_Walk', 'Running', 'RunFast'],
  },
  {
    id: 'combat',
    label: 'Combat',
    clips: ['Attack', 'Triple_Combo_Attack', 'Boxing_Practice', 'BeHit_FlyUp', 'Dead'],
  },
  {
    id: 'dance',
    label: 'Dance',
    clips: ['Boom_Dance', 'You_Groove', 'All_Night_Dance'],
  },
  {
    id: 'skills',
    label: 'Skills',
    clips: ['Skill_01', 'Skill_03'],
  },
]

const LOOPING = new Set([
  'Casual_Walk',
  'Unsteady_Walk',
  'Running',
  'RunFast',
  'Boom_Dance',
  'You_Groove',
  'All_Night_Dance',
  'Boxing_Practice',
])

const LABELS = {
  Casual_Walk: 'Marche',
  Unsteady_Walk: 'Pas hésitant',
  Running: 'Course',
  RunFast: 'Sprint',
  Attack: 'Attaque',
  Triple_Combo_Attack: 'Combo ×3',
  Boxing_Practice: 'Boxe',
  BeHit_FlyUp: 'Touché',
  Dead: 'KO',
  Boom_Dance: 'Boom Dance',
  You_Groove: 'Groove',
  All_Night_Dance: 'All Night',
  Skill_01: 'Skill 01',
  Skill_03: 'Skill 03',
}

const els = {
  canvas: document.getElementById('stage'),
  status: document.getElementById('status'),
  banner: document.getElementById('banner'),
  groups: document.getElementById('groups'),
  clipName: document.getElementById('clip-name'),
  groupName: document.getElementById('group-name'),
  fps: document.getElementById('fps'),
}

const state = {
  catalog: new Map(), // id -> { id, url }
  packs: new Map(),
  loading: new Set(),
  activeId: null,
  clock: new THREE.Clock(),
  frames: 0,
  lastFps: performance.now(),
  groupOf: new Map(),
  characterRoot: null,
  camera: null,
  controls: null,
  framed: false,
}

function setStatus(text, kind = '') {
  els.status.textContent = text
  els.status.className = `status ${kind}`.trim()
}

function setBanner(text) {
  if (!text) {
    els.banner.classList.add('hidden')
    els.banner.textContent = ''
    return
  }
  els.banner.textContent = text
  els.banner.classList.remove('hidden')
}

function pretty(id) {
  return LABELS[id] || id.replaceAll('_', ' ')
}

function buildUI(availableIds) {
  els.groups.innerHTML = ''
  for (const group of GROUPS) {
    const ids = group.clips.filter((id) => availableIds.includes(id))
    if (!ids.length) continue
    const block = document.createElement('div')
    block.className = 'group'
    const title = document.createElement('p')
    title.className = 'group-title'
    title.textContent = group.label
    block.appendChild(title)
    const grid = document.createElement('div')
    grid.className = 'actions'
    grid.setAttribute('role', 'group')
    grid.setAttribute('aria-label', group.label)
    for (const id of ids) {
      state.groupOf.set(id, group.label)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'action'
      btn.dataset.action = id
      btn.innerHTML = `<span class="action-label">${pretty(id)}</span><span class="action-hint">${id}</span>`
      btn.addEventListener('click', () => playAction(id))
      grid.appendChild(btn)
    }
    block.appendChild(grid)
    els.groups.appendChild(block)
  }
}

function markActive(id) {
  for (const btn of document.querySelectorAll('.action')) {
    btn.classList.toggle('active', btn.dataset.action === id)
  }
}

function fitCameraToObject(camera, object, controls, offset = 1.45) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const fov = camera.fov * (Math.PI / 180)
  let distance = (maxDim / (2 * Math.tan(fov / 2))) * offset
  distance = Math.max(distance, maxDim * 1.25)
  camera.position.set(center.x + distance * 0.4, center.y + distance * 0.18, center.z + distance)
  camera.near = Math.max(0.01, distance / 100)
  camera.far = distance * 100
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
}

function prepareScene(gltf, url) {
  const root = gltf.scene
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
      if (obj.material) obj.material.envMapIntensity = 0.95
    }
  })
  const box = new THREE.Box3().setFromObject(root)
  root.position.y -= box.min.y
  return {
    root,
    mixer: new THREE.AnimationMixer(root),
    clips: gltf.animations || [],
    url,
  }
}

function hideAll() {
  for (const pack of state.packs.values()) {
    pack.root.visible = false
    pack.mixer.stopAllAction()
  }
}

const loader = new GLTFLoader()

async function ensurePack(id) {
  if (state.packs.has(id)) return state.packs.get(id)
  if (state.loading.has(id)) {
    while (state.loading.has(id)) await new Promise((r) => setTimeout(r, 50))
    return state.packs.get(id)
  }
  const entry = state.catalog.get(id)
  if (!entry) throw new Error(`Clip inconnu: ${id}`)
  state.loading.add(id)
  try {
    const gltf = await loader.loadAsync(entry.url)
    const pack = prepareScene(gltf, entry.url)
    pack.root.visible = false
    state.characterRoot.add(pack.root)
    state.packs.set(id, pack)
    return pack
  } finally {
    state.loading.delete(id)
  }
}

async function playAction(id) {
  markActive(id)
  setStatus(`Chargement · ${pretty(id)}`)
  try {
    const pack = await ensurePack(id)
    hideAll()
    pack.root.visible = true

    if (!state.framed) {
      fitCameraToObject(state.camera, pack.root, state.controls)
      state.framed = true
    }

    if (!pack.clips.length) {
      state.activeId = id
      els.clipName.textContent = '(pose)'
      els.groupName.textContent = state.groupOf.get(id) || '—'
      setStatus(`Pose · ${pretty(id)}`, 'ready')
      return
    }

    const clip = pack.clips[0]
    const action = pack.mixer.clipAction(clip)
    action.reset()
    const loop = LOOPING.has(id) ? THREE.LoopRepeat : THREE.LoopOnce
    action.setLoop(loop, Infinity)
    action.clampWhenFinished = loop === THREE.LoopOnce
    action.fadeIn(0.12)
    action.play()

    state.activeId = id
    els.clipName.textContent = clip.name || id
    els.groupName.textContent = state.groupOf.get(id) || '—'
    setStatus(`Lecture · ${pretty(id)}`, 'ready')
  } catch (err) {
    console.error(err)
    setStatus(`Erreur · ${pretty(id)}`, 'error')
  }
}

async function loadManifest() {
  const res = await fetch('/models/manifest.json', { cache: 'no-store' })
  if (!res.ok) throw new Error('manifest.json introuvable — npm run sync-assets')
  const data = await res.json()
  return data.clips || []
}

async function boot() {
  const renderer = new THREE.WebGLRenderer({
    canvas: els.canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const glInfo = renderer.getContext()?.getParameter?.(renderer.getContext().RENDERER) || ''
  const isSoftGL = /SwiftShader|llvmpipe|software/i.test(glInfo)
  renderer.shadowMap.enabled = !isSoftGL
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = null
  scene.fog = new THREE.Fog(0x07110e, 8, 28)

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 100)
  camera.position.set(1.6, 1.4, 3.2)
  state.camera = camera

  const controls = new OrbitControls(camera, els.canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 1.1
  controls.maxDistance = 12
  controls.maxPolarAngle = Math.PI * 0.49
  controls.target.set(0, 1, 0)
  state.controls = controls

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  scene.add(new THREE.HemisphereLight(0xdff7ea, 0x1a2a22, 1.15))
  const key = new THREE.DirectionalLight(0xfff2d1, 2.15)
  key.position.set(3.5, 6, 2.5)
  key.castShadow = !isSoftGL
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x3ecf8e, 0.85)
  rim.position.set(-4, 2.5, -3)
  scene.add(rim)

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 64),
    new THREE.MeshStandardMaterial({ color: 0x14241c, roughness: 0.92, metalness: 0.05 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.12, 64),
    new THREE.MeshBasicMaterial({
      color: 0xd4a017,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.01
  scene.add(ring)

  state.characterRoot = new THREE.Group()
  scene.add(state.characterRoot)

  setStatus('Chargement catalogue…')
  setBanner('')

  try {
    const clips = await loadManifest()
    if (!clips.length) throw new Error('Aucun clip Meshy')

    for (const c of clips) state.catalog.set(c.id, c)

    const ordered = GROUPS.flatMap((g) => g.clips).filter((id) => state.catalog.has(id))
    const extras = [...state.catalog.keys()].filter((id) => !ordered.includes(id))
    const available = [...ordered, ...extras]
    buildUI(available)

    const first =
      available.find((id) => id === 'Casual_Walk') ||
      available.find((id) => id === 'Running') ||
      available[0]

    // Warm a few combat / dance clips in background after first paint
    await playAction(first)
    setStatus(`Prêt · ${available.length} animations Meshy`, 'ready')

    const warm = ['Attack', 'Dead', 'Running', 'Boom_Dance', 'Skill_01'].filter((id) =>
      state.catalog.has(id)
    )
    ;(async () => {
      for (const id of warm) {
        if (state.packs.has(id)) continue
        try {
          await ensurePack(id)
        } catch {
          /* ignore warm errors */
        }
      }
    })()
  } catch (err) {
    console.error(err)
    setStatus('Échec de chargement', 'error')
    setBanner(
      `Impossible de charger Mayasi Meshy : ${err.message}. Place les GLB réels dans media/mayasi-assets/ puis npm run sync-assets.`
    )
  }

  window.addEventListener('resize', () => {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  })

  function tick() {
    const dt = state.clock.getDelta()
    for (const pack of state.packs.values()) {
      if (pack.root.visible) pack.mixer.update(dt)
    }
    controls.update()
    ring.rotation.z += dt * 0.15
    renderer.render(scene, camera)

    state.frames += 1
    const now = performance.now()
    if (now - state.lastFps >= 500) {
      els.fps.textContent = `${Math.round((state.frames * 1000) / (now - state.lastFps))} fps`
      state.frames = 0
      state.lastFps = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

boot()
