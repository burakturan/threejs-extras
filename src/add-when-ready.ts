import { addWhenReady } from '@threejs-extras/add-when-ready'
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/*
 * Each press brings eight physical materials with shader sources no one has compiled yet: a random salt goes into the
 * source, so neither three's program cache nor the browser's shader cache has them. The scene turns on its own, and the
 * longest gap between two animation frames after the press is how long the page stood still.
 */
type Way = 'add' | 'ready'
const $ = (id: string) => document.getElementById(id) as HTMLElement

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.append(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x15161a)
scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 0.8))
for (const [x, z, colour] of [[-4, -4, 0xffd0a0], [4, -4, 0xa0c8ff], [0, 4, 0xffa0c8]] as const) {
  const light = new THREE.PointLight(colour, 30, 14, 2)
  light.position.set(x, 3.5, z)
  scene.add(light)
}
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100)
camera.position.set(8, 6, 10)
const controls = new OrbitControls(camera, renderer.domElement)
controls.autoRotate = true
controls.autoRotateSpeed = 1.5
controls.target.set(0, 0.8, 0)

const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.7 }))
floor.rotation.x = -Math.PI / 2
scene.add(floor)

const shapes = [new THREE.TorusKnotGeometry(0.35, 0.12, 128, 16), new THREE.IcosahedronGeometry(0.5, 3), new THREE.TorusGeometry(0.4, 0.15, 24, 64)]
let placed = 0
const group = new THREE.Group()
scene.add(group)

function material(salt: string, i: number) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(Math.random(), 0.5, 0.55),
    roughness: 0.2 + (i % 4) * 0.15,
    metalness: i % 3 === 0 ? 0.7 : 0,
    clearcoat: i % 2,
    sheen: i % 5 === 0 ? 1 : 0,
    iridescence: i % 7 === 0 ? 1 : 0,
  })
  m.customProgramCacheKey = () => salt
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = `// ${salt}\n${shader.fragmentShader}`
  }
  return m
}

function batch() {
  return Array.from({ length: 8 }, (_, i) => {
    const salt = `${Math.random()}`
    const mesh = new THREE.Mesh(shapes[i % shapes.length], material(salt, i))
    const n = placed++
    mesh.position.set((n % 8) * 1.3 - 4.55, 0.7, (Math.floor(n / 8) % 8) * 1.3 - 4.55)
    return mesh
  })
}

let way: Way = 'ready'
let watching = 0
let pressed = 0
let longest = 0
let last = performance.now()

async function press() {
  pressed = performance.now()
  longest = 0
  watching = pressed + 2000
  $('stall').textContent = '...'
  $('shown').textContent = '...'
  const meshes = batch()
  if (way === 'add') {
    for (const mesh of meshes) group.add(mesh)
    requestAnimationFrame(() => requestAnimationFrame(() => ($('shown').textContent = `${(performance.now() - pressed).toFixed(0)} ms`)))
    return
  }
  await Promise.all(meshes.map((mesh) => addWhenReady(renderer, mesh, { scene, camera, parent: group })))
  $('shown').textContent = `${(performance.now() - pressed).toFixed(0)} ms`
}

function frame(now: number) {
  const gap = now - last
  last = now
  if (now < watching) {
    longest = Math.max(longest, gap)
    $('stall').textContent = `${longest.toFixed(0)} ms`
  }
  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

function setWay(next: Way) {
  way = next
  for (const button of document.querySelectorAll<HTMLButtonElement>('#ways button')) button.classList.toggle('on', button.dataset.way === way)
}
for (const button of document.querySelectorAll<HTMLButtonElement>('#ways button')) button.addEventListener('click', () => setWay(button.dataset.way as Way))
$('add').addEventListener('click', press)
$('clear').addEventListener('click', () => {
  for (const mesh of [...group.children] as THREE.Mesh[]) {
    mesh.removeFromParent()
    ;(mesh.material as THREE.Material).dispose()
  }
  placed = 0
})
$('parallel').textContent = renderer.extensions.has('KHR_parallel_shader_compile') ? 'yes' : 'no'
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
setWay('ready')
requestAnimationFrame(frame)
