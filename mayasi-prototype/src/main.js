import './styles.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const ACTIONS = ['arise', 'attack', 'dead', 'idle']

const ASSET_CANDIDATES = {
  mayasi: [
    '/models/Mayasi.glb',
    '/models/Mayasi_d3ee.glb',
  ],
  arise: [
    '/models/Meshy_AI_Urban_Ease_biped_Animation_Arise_withSkin.glb',
    '/models/Meshy_AI_Urban_Ease_biped_Animation_Arise_withSkin_fff7.glb',
    '/models/Arise.glb',
  ],
  attack: [
    '/models/Meshy_AI_Urban_Ease_biped_Animation_Attack_withSkin.glb',
    '/models/Meshy_AI_Urban_Ease_biped_Animation_Attack_withSkin_c2d7.glb',
    '/models/Attack.glb',
  ],
  dead: [
    '/models/Meshy_AI_Urban_Ease_biped_Animation_Dead_withSkin.glb',
    '/models/Meshy_AI_Urban_Ease_biped_Animation_Dead_withSkin_e683.glb',
    '/models/Dead.glb',
  ],
}

const FALLBACK_URL = '/fallback/RobotExpressive.glb'
const FALLBACK_CLIPS = {
  arise: ['Jump', 'Standing', 'Idle'],
  attack: ['Punch', 'ThumbsUp', 'Wave'],
  dead: ['Death', 'Sitting'],
  idle: ['Idle', 'Standing', 'Walking'],
}

const els = {
  canvas: document.getElementById('stage'),
  status: document.getElementById('status'),
  banner: document.getElementById('banner'),
  clipName: document.getElementById('clip-name'),
  sourceName: document.getElementById('source-name'),
  fps: document.getElementById('fps'),
  buttons: [...document.querySelectorAll('.action')],
}

const state = {
  mode: 'none', // 'meshy-set' | 'fallback'
  packs: new Map(), // action -> { scene, mixer, clips, root }
  active: null,
  clock: new THREE.Clock(),
  frames: 0,
  lastFps: performance.now(),
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

function setButtonsEnabled(enabled) {
  for (const btn of els.buttons) {
    const action = btn.dataset.action
    const available =
      enabled &&
      ((state.mode === 'meshy-set' && state.packs.has(action)) ||
        (state.mode === 'fallback' && action in FALLBACK_CLIPS) ||
        (state.mode === 'meshy-set' && action === 'idle' && state.packs.has('mayasi')))
    btn.disabled = !available
  }
}

function markActive(action) {
  for (const btn of els.buttons) {
    btn.classList.toggle('active', btn.dataset.action === action)
  }
}

async function resolveFirst(urls, loader) {
  for (const url of urls) {
    try {
      const gltf = await loader.loadAsync(url)
      return { url, gltf }
    } catch {
      // try next candidate
    }
  }
  return null
}

function fitCameraToObject(camera, object, controls, offset = 1.35) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const fov = camera.fov * (Math.PI / 180)
  let distance = (maxDim / (2 * Math.tan(fov / 2))) * offset
  distance = Math.max(distance, maxDim * 1.2)

  camera.position.set(center.x + distance * 0.35, center.y + distance * 0.2, center.z + distance)
  camera.near = Math.max(0.01, distance / 100)
  camera.far = distance * 100
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
}

function prepareScene(gltf, name) {
  const root = gltf.scene
  root.name = name
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
      if (obj.material) {
        obj.material.envMapIntensity = 0.9
      }
    }
  })
  const mixer = new THREE.AnimationMixer(root)
  return {
    root,
    mixer,
    clips: gltf.animations || [],
    url: name,
  }
}

function hideAllPacks() {
  for (const pack of state.packs.values()) {
    pack.root.visible = false
    pack.mixer.stopAllAction()
  }
}

function playClipOnPack(pack, preferredNames = [], loop = THREE.LoopOnce) {
  if (!pack.clips.length) {
    pack.root.visible = true
    return { clipName: '(pose)', duration: 0 }
  }

  let clip =
    preferredNames
      .map((n) => pack.clips.find((c) => c.name.toLowerCase() === n.toLowerCase()))
      .find(Boolean) || pack.clips[0]

  pack.mixer.stopAllAction()
  const action = pack.mixer.clipAction(clip)
  action.reset()
  action.setLoop(loop, Infinity)
  action.clampWhenFinished = loop === THREE.LoopOnce
  action.fadeIn(0.15)
  action.play()
  pack.root.visible = true
  return { clipName: clip.name, duration: clip.duration }
}

async function loadGltf(loader, url) {
  return loader.loadAsync(url)
}

async function tryLoadMayasiSet(loader, characterRoot) {
  const resolved = {}
  for (const [key, urls] of Object.entries(ASSET_CANDIDATES)) {
    resolved[key] = await resolveFirst(urls, loader)
  }

  const animKeys = ['arise', 'attack', 'dead']
  const foundAnims = animKeys.filter((k) => resolved[k])
  if (foundAnims.length === 0) {
    return false
  }

  // Prefer animated GLBs (Meshy withSkin). Mayasi base optional for idle.
  // resolveFirst already loaded once — load again for the scene graph (cheap vs complexity).
  for (const key of [...animKeys, 'mayasi']) {
    if (!resolved[key]) continue
    const gltf = await loadGltf(loader, resolved[key])
    const pack = prepareScene(gltf, resolved[key])
    pack.root.visible = false
    characterRoot.add(pack.root)
    state.packs.set(key, pack)
  }

  // If idle has no dedicated clip, use Mayasi static or first frame of arise
  if (!state.packs.has('idle')) {
    if (state.packs.has('mayasi')) {
      state.packs.set('idle', state.packs.get('mayasi'))
    } else if (state.packs.has('arise')) {
      state.packs.set('idle', state.packs.get('arise'))
    }
  }

  state.mode = 'meshy-set'
  els.sourceName.textContent = 'GLB Mayasi / Meshy'
  setBanner('')
  return true
}

async function loadFallback(loader, characterRoot) {
  const gltf = await loadGltf(loader, FALLBACK_URL)
  const pack = prepareScene(gltf, FALLBACK_URL)
  characterRoot.add(pack.root)
  for (const action of ACTIONS) {
    state.packs.set(action, pack)
  }
  state.mode = 'fallback'
  els.sourceName.textContent = 'Stand-in (RobotExpressive)'
  setBanner(
    'GLB Mayasi / Meshy introuvables sur ce worker. Démo temporaire avec un personnage stand-in. Place Mayasi.glb + Arise/Attack/Dead dans mayasi-prototype/public/models/ puis recharge.'
  )
  return true
}

function playAction(actionName) {
  if (!state.packs.size) return

  hideAllPacks()

  if (state.mode === 'fallback') {
    const pack = state.packs.get(actionName)
    const preferred = FALLBACK_CLIPS[actionName] || []
    const loop = actionName === 'idle' ? THREE.LoopRepeat : THREE.LoopOnce
    const { clipName } = playClipOnPack(pack, preferred, loop)
    state.active = actionName
    markActive(actionName)
    els.clipName.textContent = clipName
    setStatus(`Lecture · ${actionName}`, 'ready')
    return
  }

  // meshy-set: each anim GLB is its own skinned character
  let pack = state.packs.get(actionName)
  let preferred = []
  let loop = THREE.LoopOnce

  if (actionName === 'idle') {
    pack = state.packs.get('idle') || state.packs.get('mayasi') || state.packs.get('arise')
    loop = pack?.clips?.length ? THREE.LoopRepeat : THREE.LoopOnce
  }

  if (!pack) {
    setStatus(`Action indisponible · ${actionName}`, 'error')
    return
  }

  const { clipName } = playClipOnPack(pack, preferred, loop)
  // Center camera lightly on first play
  state.active = actionName
  markActive(actionName)
  els.clipName.textContent = clipName || actionName
  setStatus(`Lecture · ${actionName}`, 'ready')
}

async function boot() {
  const renderer = new THREE.WebGLRenderer({
    canvas: els.canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = null
  scene.fog = new THREE.Fog(0x07110e, 8, 28)

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 100)
  camera.position.set(1.6, 1.4, 3.2)

  const controls = new OrbitControls(camera, els.canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 1.2
  controls.maxDistance = 10
  controls.maxPolarAngle = Math.PI * 0.49
  controls.target.set(0, 1, 0)

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const hemi = new THREE.HemisphereLight(0xdff7ea, 0x1a2a22, 1.1)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xfff2d1, 2.1)
  key.position.set(3.5, 6, 2.5)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 24
  key.shadow.bias = -0.0002
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x3ecf8e, 0.85)
  rim.position.set(-4, 2.5, -3)
  scene.add(rim)

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 64),
    new THREE.MeshStandardMaterial({
      color: 0x14241c,
      roughness: 0.92,
      metalness: 0.05,
    })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.12, 64),
    new THREE.MeshBasicMaterial({ color: 0xd4a017, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.01
  scene.add(ring)

  const characterRoot = new THREE.Group()
  scene.add(characterRoot)

  const loader = new GLTFLoader()

  setStatus('Chargement des modèles…')
  try {
    const ok = (await tryLoadMayasiSet(loader, characterRoot)) || (await loadFallback(loader, characterRoot))
    if (!ok) throw new Error('Aucun modèle chargeable')

    // Frame the first visible pack
    const first =
      state.packs.get('arise') ||
      state.packs.get('idle') ||
      state.packs.get('attack') ||
      [...state.packs.values()][0]
    if (first) {
      first.root.visible = true
      fitCameraToObject(camera, first.root, controls)
      first.root.visible = false
    }

    setButtonsEnabled(true)
    // Default: Arise if available else idle
    const initial = state.packs.has('arise') ? 'arise' : 'idle'
    playAction(initial)
    setStatus('Prêt — clique une action', 'ready')
  } catch (err) {
    console.error(err)
    setStatus('Échec de chargement', 'error')
    setBanner(`Impossible de charger la scène 3D : ${err.message}`)
    setButtonsEnabled(false)
  }

  for (const btn of els.buttons) {
    btn.addEventListener('click', () => playAction(btn.dataset.action))
  }

  window.addEventListener('keydown', (e) => {
    const map = { '1': 'arise', '2': 'attack', '3': 'dead', '4': 'idle' }
    if (map[e.key]) playAction(map[e.key])
  })

  function onResize() {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }
  window.addEventListener('resize', onResize)

  function tick() {
    const dt = state.clock.getDelta()
    for (const pack of new Set(state.packs.values())) {
      if (pack.root.visible) pack.mixer.update(dt)
    }
    controls.update()
    // Subtle ring pulse
    ring.rotation.z += dt * 0.15
    renderer.render(scene, camera)

    state.frames += 1
    const now = performance.now()
    if (now - state.lastFps >= 500) {
      const fps = Math.round((state.frames * 1000) / (now - state.lastFps))
      els.fps.textContent = `${fps} fps`
      state.frames = 0
      state.lastFps = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

boot()
