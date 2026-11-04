import { LeanFrame } from '@threejs-extras/lean-frame'
import { GpuTimer, shown } from './gpu-timer'
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'

/*
 * The composer path is the stack most three.js projects start from: a render pass, SMAA because the composer's targets
 * drop the canvas's MSAA, and the output pass, at the device's full pixel ratio. The lean path draws the same scene
 * through LeanFrame. Shaded with physical materials and several lights, so each pixel costs something.
 */
type Path = 'composer' | 'lean'
const $ = (id: string) => document.getElementById(id) as HTMLElement

const renderer = new THREE.WebGLRenderer({ antialias: false })
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.append(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x15161a)
scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 0.6))
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.set(7, 5, 9)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 0.8, 0)
controls.update()

const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.7 }))
floor.rotation.x = -Math.PI / 2
scene.add(floor)
const knot = new THREE.TorusKnotGeometry(0.32, 0.11, 160, 20)
for (let i = 0; i < 100; i++) {
  const mesh = new THREE.Mesh(
    knot,
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL((i * 0.13) % 1, 0.5, 0.55),
      roughness: 0.25 + (i % 4) * 0.15,
      metalness: i % 3 === 0 ? 0.8 : 0,
      clearcoat: i % 2,
      sheen: i % 5 === 0 ? 1 : 0,
    }),
  )
  mesh.position.set((i % 10) * 1.1 - 4.95, 0.6, Math.floor(i / 10) * 1.1 - 4.95)
  mesh.rotation.set(i, i * 0.7, 0)
  scene.add(mesh)
}
for (const [x, z, colour] of [[-3, -3, 0xffd0a0], [3, -3, 0xa0c8ff], [-3, 3, 0xffa0c8], [3, 3, 0xc8ffa0]] as const) {
  const light = new THREE.PointLight(colour, 18, 12, 2)
  light.position.set(x, 3, z)
  scene.add(light)
}

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
composer.addPass(new SMAAPass())
composer.addPass(new OutputPass())
const lean = new LeanFrame(renderer)

let path: Path = 'lean'
let device: number | 'device' = 'device'

/* Bytes the render targets hold: colour and depth per pixel, MSAA keeping every sample plus the resolved copy. */
function bytesOf(target: THREE.WebGLRenderTarget, colour: number) {
  const copies = target.samples > 0 ? target.samples + 1 : 1
  return target.width * target.height * (colour + 4) * copies
}
function memory() {
  if (path === 'lean') return bytesOf(lean.target, 8)
  /* Two half float ping-pong targets, then SMAA's edge and weight targets at 8 bit. */
  const { width, height } = composer.renderTarget1
  return bytesOf(composer.renderTarget1, 8) + bytesOf(composer.renderTarget2, 8) + width * height * 4 * 2
}

function resize() {
  const ratio = device === 'device' ? devicePixelRatio : device
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  if (path === 'lean') lean.setSize(innerWidth, innerHeight, ratio)
  else {
    renderer.setPixelRatio(ratio)
    renderer.setSize(innerWidth, innerHeight)
    composer.setPixelRatio(ratio)
    composer.setSize(innerWidth, innerHeight)
  }
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2())
  $('size').textContent = `${buffer.x} x ${buffer.y}`
  $('pixels').textContent = `${((buffer.x * buffer.y) / 1e6).toFixed(2)} M`
  $('memory').textContent = `${(memory() / 2 ** 20).toFixed(0)} MB`
  for (const button of document.querySelectorAll<HTMLButtonElement>('#paths button')) button.classList.toggle('on', button.dataset.path === path)
  for (const button of document.querySelectorAll<HTMLButtonElement>('#ratios button'))
    button.classList.toggle('on', button.dataset.ratio === String(device))
  timer.reset()
  $('cost').textContent = '-'
}

const timer = new GpuTimer(renderer)
let frames = 0
let since = performance.now()
function frame() {
  controls.update()
  timer.begin()
  if (path === 'lean') lean.render(scene, camera)
  else composer.render()
  timer.end()
  shown(timer, $('cost'))
  frames++
  const now = performance.now()
  if (now - since >= 1000) {
    $('fps').textContent = String(Math.round((frames * 1000) / (now - since)))
    frames = 0
    since = now
  }
  requestAnimationFrame(frame)
}

for (const button of document.querySelectorAll<HTMLButtonElement>('#paths button'))
  button.addEventListener('click', () => {
    path = button.dataset.path as Path
    resize()
  })
for (const button of document.querySelectorAll<HTMLButtonElement>('#ratios button'))
  button.addEventListener('click', () => {
    device = button.dataset.ratio === 'device' ? 'device' : Number(button.dataset.ratio)
    resize()
  })
addEventListener('resize', resize)
resize()
requestAnimationFrame(frame)
