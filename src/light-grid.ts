import { LightGrid } from '@threejs-extras/light-grid'
import { GpuTimer, shown } from './gpu-timer'
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/*
 * A hall of sixty spots in a ten by six grid, each aimed at its own patch of floor, wall or plinth. Either they are
 * sixty SpotLights in the scene, or the same sixty are handed to a LightGrid and the scene holds none. The switch
 * changes the shaders, so its first frame shows what compiling costs each way.
 */
type Way = 'lights' | 'grid' | 'walls'
const $ = (id: string) => document.getElementById(id) as HTMLElement
const PER_CELL = 8

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.append(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0e0e10)
scene.add(new THREE.HemisphereLight(0xb0b8c8, 0x302820, 0.15))
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100)
camera.position.set(-9, 6.5, 13)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 0.5, 0)
controls.update()

const area = new THREE.Box3(new THREE.Vector3(-12, 0, -8), new THREE.Vector3(12, 5, 8))
const grid = new LightGrid({ area, cell: 1, perCell: PER_CELL })

/* Every mesh keeps its plain material and a copy that takes the grid; the switch swaps them. */
const pairs: { mesh: THREE.Mesh; plain: THREE.Material; gridded: THREE.Material }[] = []
function keep(mesh: THREE.Mesh) {
  const plain = mesh.material as THREE.Material
  const gridded = plain.clone()
  grid.apply(gridded)
  pairs.push({ mesh, plain, gridded })
  scene.add(mesh)
}
function box(w: number, h: number, d: number, x: number, y: number, z: number, colour: number, roughness = 0.8) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: colour, roughness }))
  mesh.position.set(x, y, z)
  keep(mesh)
  return mesh
}
box(24, 0.1, 16, 0, -0.05, 0, 0x6e5a48, 0.6)
box(24, 5, 0.2, 0, 2.5, -8, 0xd8d4cc)
box(0.2, 5, 16, -12, 2.5, 0, 0xd8d4cc)
box(0.2, 5, 16, 12, 2.5, 0, 0xd8d4cc)
/* Two free partitions, the walls the grid is told about. */
const walls = [box(5, 3, 0.15, -5, 1.5, -0.3, 0xd8d4cc), box(0.15, 3, 6, 3.6, 1.5, 2, 0xd8d4cc)]
const knot = new THREE.TorusKnotGeometry(0.22, 0.08, 96, 12)
for (let i = 0; i < 12; i++) {
  const x = (i % 6) * 3.6 - 9
  const z = Math.floor(i / 6) * 5 - 3
  box(0.6, 1, 0.6, x, 0.5, z, 0xefede8, 0.7)
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 12, 0.5, 0.55), metalness: 0.6, roughness: 0.35 })
  const mesh = new THREE.Mesh(knot, material)
  mesh.position.set(x, 1.35, z)
  keep(mesh)
}

const spots: THREE.SpotLight[] = []
for (let i = 0; i < 60; i++) {
  const column = i % 10
  const row = Math.floor(i / 10)
  const x = column * 2.3 - 10.35
  const z = row * 2.5 - 6.5
  const light = new THREE.SpotLight(new THREE.Color().setHSL(0.08 + (i % 7) * 0.012, 0.6, 0.75), 40, 9, THREE.MathUtils.degToRad(16 + (i % 3) * 6), 0.4, 2)
  light.position.set(x, 4.9, z)
  /* The back row washes the wall; the rest fall the same slant on the floor, so what stands in them throws a shadow. */
  if (row === 0) light.target.position.set(x, 2.2, -7.9)
  else light.target.position.set(x + 1.6, 0, z + 1.6)
  scene.add(light.target)
  spots.push(light)
}
$('per').textContent = String(PER_CELL)
function build(withWalls: boolean) {
  const building = performance.now()
  const crowded = grid.set(spots, withWalls ? { walls } : {})
  $('built').textContent = `${(performance.now() - building).toFixed(1)} ms`
  $('crowded').textContent = String(crowded)
}

const timer = new GpuTimer(renderer)
let way: Way = 'walls'
let timeNext = false
let switched = 0
function setWay(next: Way) {
  way = next
  if (way !== 'lights') build(way === 'walls')
  for (const spot of spots) {
    if (way === 'lights') scene.add(spot)
    else spot.removeFromParent()
  }
  for (const { mesh, plain, gridded } of pairs) mesh.material = way === 'lights' ? plain : gridded
  for (const button of document.querySelectorAll<HTMLButtonElement>('#ways button')) button.classList.toggle('on', button.dataset.way === way)
  timer.reset()
  timeNext = true
  switched = performance.now()
}

function frame() {
  controls.update()
  timer.begin()
  renderer.render(scene, camera)
  timer.end()
  if (timeNext) {
    timeNext = false
    $('switch').textContent = `${(performance.now() - switched).toFixed(0)} ms`
  }
  shown(timer, $('cost'))
  requestAnimationFrame(frame)
}

for (const button of document.querySelectorAll<HTMLButtonElement>('#ways button')) button.addEventListener('click', () => setWay(button.dataset.way as Way))
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
setWay('walls')
requestAnimationFrame(frame)
