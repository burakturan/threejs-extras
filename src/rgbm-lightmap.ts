import { loadRGBM, readRGBM } from '@threejs-extras/rgbm-lightmap'
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/*
 * A gallery room baked once in Blender (rgbm-lightmap/bake.py) and its light written twice: a half-float EXR and an
 * RGBM PNG. Each press loads the chosen file again, from the HTTP cache after the first time, so what is left is the
 * decoding. The scene keeps turning, and the longest gap between two frames while it loads is how long the page stood
 * still.
 */
type Way = 'exr' | 'rgbm'
const $ = (id: string) => document.getElementById(id) as HTMLElement
/* bake.py's RANGE: the light the PNG's full scale stands for. */
const RANGE = 16

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.append(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0e0e10)
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100)
camera.position.set(1.1, 1.6, 2.0)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(-0.3, 1.3, -0.4)
/* Close round the middle, so the turn stays inside the room. */
controls.maxDistance = 2.8
controls.autoRotate = true
controls.autoRotateSpeed = 0.6
controls.update()

/* Every mesh keeps a material that reads the lightmap as light and one that reads it as RGBM; the switch swaps them. */
const pairs: { mesh: THREE.Mesh; exr: THREE.MeshStandardMaterial; rgbm: THREE.MeshStandardMaterial }[] = []
/* A black stand-in, so both sets compile with a lightmap up front and a switch costs only the file. */
const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
blank.channel = 1
blank.needsUpdate = true
function place(room: THREE.Object3D) {
  room.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const exr = node.material as THREE.MeshStandardMaterial
    /* Cycles baked what a white diffuse surface sends back; three takes a lightmap as irradiance and divides by pi. */
    exr.lightMapIntensity = Math.PI
    exr.lightMap = blank
    const rgbm = exr.clone()
    readRGBM(rgbm, RANGE)
    pairs.push({ mesh: node, exr, rgbm })
  })
  scene.add(room)
  for (const set of ['exr', 'rgbm'] as const) {
    for (const pair of pairs) pair.mesh.material = pair[set]
    renderer.compile(scene, camera)
  }
}

const exrLoader = new EXRLoader().setDataType(THREE.HalfFloatType)
let way: Way = 'rgbm'
let map: THREE.Texture | null = null
let watching = false
let longest = 0
let last = performance.now()

async function load(next: Way) {
  way = next
  for (const button of document.querySelectorAll<HTMLButtonElement>('#ways button')) button.classList.toggle('on', button.dataset.way === way)
  for (const id of ['stall', 'shown', 'size', 'memory']) $(id).textContent = '...'
  longest = 0
  watching = true
  /* The files sit beside the page, in public/rgbm-lightmap. */
  const url = way === 'exr' ? 'light.exr' : 'light.png'
  const started = performance.now()
  const texture = way === 'exr' ? await exrLoader.loadAsync(url) : await loadRGBM(url)
  /* EXRLoader lays the rows from the image's foot and glTF's v counts from its top: turned over in the UV transform. */
  if (way === 'exr') {
    texture.repeat.y = -1
    texture.offset.y = 1
  }
  texture.channel = 1
  map?.dispose()
  map = texture
  for (const pair of pairs) {
    pair[way].lightMap = texture
    pair.mesh.material = pair[way]
  }
  await new Promise(requestAnimationFrame)
  $('shown').textContent = `${(performance.now() - started).toFixed(0)} ms`
  /* The frame that uploads the texture is seen by the next one. */
  for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
  watching = false
  $('stall').textContent = `${longest.toFixed(0)} ms`
  const entry = performance.getEntriesByName(new URL(url, location.href).href).at(-1) as PerformanceResourceTiming | undefined
  $('size').textContent = entry?.decodedBodySize ? `${(entry.decodedBodySize / 1e6).toFixed(1)} MB` : '-'
  const { width, height } = texture.image as { width: number; height: number }
  $('memory').textContent = `${((width * height * (way === 'exr' ? 8 : 4)) / 2 ** 20).toFixed(0)} MB`
}

function frame(now: number) {
  if (watching) longest = Math.max(longest, now - last)
  last = now
  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

for (const button of document.querySelectorAll<HTMLButtonElement>('#ways button')) button.addEventListener('click', () => load(button.dataset.way as Way))
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
void new GLTFLoader().loadAsync('room.glb').then((room) => {
  place(room.scene)
  requestAnimationFrame(frame)
  return load('rgbm')
})
