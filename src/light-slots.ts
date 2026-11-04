import { LightSlots } from '@threejs-extras/light-slots'
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'

/*
 * A furnished room in miniature: 64 objects, each with a material whose shader is its own (a real scene gets there
 * through maps, normal maps, transparency, skinning, custom chunks...). Lamps are rect area lights, as linear pendants
 * and LED strips are. The frame a lamp lands on is timed with the GPU flushed, so a recompile shows as a long frame.
 */
const useSlots = new URLSearchParams(location.search).has('slots')
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

RectAreaLightUniformsLib.init()
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
document.body.append(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x15161a)
scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.25))

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100)
camera.position.set(9, 7, 11)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1, 0)
controls.update()

const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.8 }))
floor.rotation.x = -Math.PI / 2
scene.add(floor)

const box = new THREE.BoxGeometry(0.8, 1, 0.8)
for (let i = 0; i < 64; i++) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(i / 64, 0.45, 0.55),
    roughness: 0.3 + (i % 5) * 0.12,
    metalness: i % 3 === 0 ? 0.6 : 0,
  })
  /* Its own program, as a distinct material in a real scene would have. */
  material.customProgramCacheKey = () => `demo-${i}`
  const mesh = new THREE.Mesh(box, material)
  mesh.position.set((i % 8) * 1.6 - 5.6, 0.5 + Math.floor(i / 32) * 0, Math.floor(i / 8) * 1.6 - 5.6)
  mesh.scale.y = 0.6 + ((i * 37) % 10) / 6
  mesh.position.y = mesh.scale.y / 2
  scene.add(mesh)
}

/* Eight area slots held from the start: the first eight lamps compile nothing at all. */
const slots = useSlots ? new LightSlots(scene, { step: 8, reserve: { area: 8 } }) : null
const lamps: THREE.Group[] = []
const tube = new THREE.BoxGeometry(3, 0.05, 0.08)
const glow = new THREE.MeshBasicMaterial({ color: 0xfff4e0 })

function addLamp() {
  const n = lamps.length
  const lamp = new THREE.Group()
  const light = new THREE.RectAreaLight(0xfff4e0, 40, 3, 0.08)
  light.lookAt(0, -1, 0)
  lamp.add(light, new THREE.Mesh(tube, glow))
  lamp.position.set(((n % 4) - 1.5) * 3.5, 4, (Math.floor(n / 4) % 4) * 3 - 4.5)
  scene.add(lamp)
  lamps.push(lamp)
  changed()
}

function removeLamp() {
  const lamp = lamps.pop()
  if (!lamp) return
  lamp.removeFromParent()
  changed()
}

/* The next frame is the one to time: it is where three finds the light counts changed. */
let timeNext = false
let programsBefore = 0
function changed() {
  slots?.update()
  programsBefore = renderer.info.programs?.length ?? 0
  timeNext = true
}

const gl = renderer.getContext()
function frame() {
  controls.update()
  if (timeNext) {
    timeNext = false
    const start = performance.now()
    renderer.render(scene, camera)
    gl.finish()
    const ms = performance.now() - start
    const compiled = (renderer.info.programs?.length ?? 0) - programsBefore
    const freeze = $('freeze')
    freeze.textContent = `${ms.toFixed(1)} ms`
    freeze.className = ms > 50 ? 'bad' : 'good'
    $('compiled').textContent = String(Math.max(0, compiled))
  } else renderer.render(scene, camera)
  let counted = 0
  scene.traverseVisible((node) => {
    if (node instanceof THREE.RectAreaLight) counted++
  })
  $('lamps').textContent = String(lamps.length)
  $('counted').textContent = String(counted)
  $('programs').textContent = String(renderer.info.programs?.length ?? 0)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

$('add').addEventListener('click', addLamp)
$('remove').addEventListener('click', removeLamp)
const toggle = $<HTMLInputElement>('slots')
toggle.checked = useSlots
toggle.addEventListener('change', () => {
  location.search = toggle.checked ? '?slots' : ''
})
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
