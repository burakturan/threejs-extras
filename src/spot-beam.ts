import { SpotBeam, useDepth } from '@threejs-extras/spot-beam'
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/*
 * A dark gallery with three spots. The scene is drawn into a target that keeps its depth, shown on screen, and the
 * beams are added on top reading that depth. The plain cone is the usual trick: a transparent additive cone that
 * fades along its length, depth tested like any mesh.
 */
type Mode = 'none' | 'cone' | 'beam'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const renderer = new THREE.WebGLRenderer({ antialias: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.append(renderer.domElement)

const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0x8890a0, 0x302418, 1.1))

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 60)
camera.position.set(2.5, 2.4, 10)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(-0.5, 1.6, -2.5)
controls.update()

const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9 })
function slab(w: number, h: number, d: number, x: number, y: number, z: number, mat = wallMat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}
slab(16, 0.1, 12, 0, -0.05, 0, new THREE.MeshStandardMaterial({ color: 0x7a6250, roughness: 0.55 }))
slab(16, 5, 0.2, 0, 2.5, -6)
slab(0.2, 5, 12, -8, 2.5, 0)
slab(0.2, 5, 12, 8, 2.5, 0)
slab(16, 0.1, 12, 0, 5.05, 0, new THREE.MeshStandardMaterial({ color: 0x1a1a1c }))
/* The free-standing wall: walk behind it and the beams past it should go. */
slab(3.2, 3, 0.2, -3.6, 1.5, 1.6)

const plinth = slab(0.7, 1, 0.7, 2.5, 0.5, -1.5, new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.7 }))
const bust = new THREE.Mesh(new THREE.TorusKnotGeometry(0.28, 0.1, 128, 16), new THREE.MeshStandardMaterial({ color: 0xb08850, metalness: 0.8, roughness: 0.35 }))
bust.position.set(2.5, 1.45, -1.5)
bust.castShadow = true
scene.add(bust)
for (const [x, w] of [[-4.5, 2], [0, 1.4]] as const) slab(w, w * 0.75, 0.05, x, 2, -5.87, new THREE.MeshStandardMaterial({ color: x < 0 ? 0x34506a : 0x8a3a2c, roughness: 0.6 }))

const spots = [
  { at: new THREE.Vector3(-4.5, 1.8, -5.8), from: new THREE.Vector3(-4.5, 4.95, -3.2), colour: 0xffe2b8 },
  { at: new THREE.Vector3(0, 1.8, -5.8), from: new THREE.Vector3(0, 4.95, -3.4), colour: 0xfff1dc },
  { at: plinth.position.clone().setY(1.2), from: new THREE.Vector3(1.2, 4.95, 0.2), colour: 0xffd9a8 },
].map(({ at, from, colour }) => {
  const light = new THREE.SpotLight(colour, 60, 9, THREE.MathUtils.degToRad(17), 0.5, 2)
  light.position.copy(from)
  light.target.position.copy(at)
  light.castShadow = true
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.bias = -0.0004
  scene.add(light, light.target)
  light.updateMatrixWorld()
  light.target.updateMatrixWorld()
  return light
})

let steps = 24
let strength = 0.35
let beams: SpotBeam[] = []
const beamScene = new THREE.Scene()
function buildBeams() {
  for (const beam of beams) beam.removeFromParent(), beam.dispose()
  beams = spots.map((light) => {
    const beam = new SpotBeam(light, { steps, strength })
    beamScene.add(beam)
    return beam
  })
}
buildBeams()

/* The plain cone everybody starts with. */
const coneMat = new THREE.ShaderMaterial({
  uniforms: { colour: { value: new THREE.Color() }, strength: { value: strength } },
  vertexShader: /* glsl */ `
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vAlong = uv.y;
      vNormal = normalize(normalMatrix * normal);
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vView = normalize(-view.xyz);
      gl_Position = projectionMatrix * view;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 colour;
    uniform float strength;
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float rim = pow(abs(dot(normalize(vNormal), vView)), 2.0);
      gl_FragColor = vec4(colour * strength * 0.6 * vAlong * rim, 1.0);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
})
const cones = spots.map((light) => {
  const length = light.distance
  const geometry = new THREE.ConeGeometry(Math.tan(light.angle) * length, length, 48, 1, true).translate(0, -length / 2, 0).rotateX(Math.PI)
  const mat = coneMat.clone()
  mat.uniforms.colour.value.set(light.color)
  const cone = new THREE.Mesh(geometry, mat)
  cone.position.copy(light.position)
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), light.target.position.clone().sub(light.position).normalize())
  scene.add(cone)
  return cone
})

/* Linear HDR scene with its depth; shown through a quad that tone maps it. */
const size = renderer.getDrawingBufferSize(new THREE.Vector2())
const target = new THREE.WebGLRenderTarget(size.x, size.y, {
  type: THREE.HalfFloatType,
  samples: 4,
  depthTexture: new THREE.DepthTexture(size.x, size.y),
})
const show = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: { image: { value: target.texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D image;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(image, vUv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  }),
)
show.frustumCulled = false
const showScene = new THREE.Scene().add(show)
const flat = new THREE.OrthographicCamera()

let mode: Mode = 'beam'
function setMode(next: Mode) {
  mode = next
  for (const cone of cones) cone.visible = mode === 'cone'
  for (const button of document.querySelectorAll<HTMLButtonElement>('.modes button')) button.classList.toggle('on', button.dataset.mode === mode)
  samples.length = 0
}

const gl = renderer.getContext()
const samples: number[] = []
renderer.autoClear = false
function frame() {
  controls.update()
  const start = performance.now()
  renderer.setRenderTarget(target)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  renderer.clear()
  renderer.render(showScene, flat)
  if (mode === 'beam') {
    useDepth(target, camera)
    renderer.render(beamScene, camera)
  }
  gl.finish()
  samples.push(performance.now() - start)
  if (samples.length >= 30) {
    $('cost').textContent = `${(samples.reduce((a, b) => a + b) / samples.length).toFixed(2)} ms`
    samples.length = 0
  }
  requestAnimationFrame(frame)
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.modes button')) button.addEventListener('click', () => setMode(button.dataset.mode as Mode))
$<HTMLInputElement>('steps').addEventListener('input', (event) => {
  steps = Number((event.target as HTMLInputElement).value)
  $('stepsOut').textContent = String(steps)
  buildBeams()
  samples.length = 0
})
$<HTMLInputElement>('strength').addEventListener('input', (event) => {
  strength = Number((event.target as HTMLInputElement).value)
  $('strengthOut').textContent = strength.toFixed(2)
  for (const beam of beams) beam.material.uniforms.strength.value = strength
  for (const cone of cones) cone.material.uniforms.strength.value = strength
})
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  const next = renderer.getDrawingBufferSize(new THREE.Vector2())
  target.setSize(next.x, next.y)
})

setMode('beam')
requestAnimationFrame(frame)
