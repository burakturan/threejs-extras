import { BeamDepth, SpotBeam, useDepth } from '@threejs-extras/spot-beam'
import { GpuTimer, shown } from './gpu-timer'
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/*
 * A dark gallery with three spots. The scene is drawn into a target that keeps its depth, shown on screen, and the
 * beams are added on top reading that depth. The plain cone is the usual trick: a transparent additive cone that
 * fades along its length, depth tested like any mesh.
 */
type Mode = 'none' | 'cone' | 'soft' | 'beam'
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

/*
 * The cones a beam usually starts as: a transparent additive surface, brighter where it faces the eye and fading along
 * its length. The plain one is depth tested like any mesh, so it cuts what it meets with a line. The soft one is drawn
 * after the scene and fades as its surface comes near the scene's depth, the soft particle trick.
 */
function coneMaterial(colour: THREE.ColorRepresentation, soft: boolean) {
  return new THREE.ShaderMaterial({
    defines: soft ? { SOFT: '' } : {},
    uniforms: {
      colour: { value: new THREE.Color(colour) },
      strength: { value: strength },
      depthTexture: BeamDepth.texture,
      near: BeamDepth.near,
      far: BeamDepth.far,
      resolution: BeamDepth.resolution,
    },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vViewDepth;
      void main() {
        vAlong = uv.y;
        vNormal = normalize(normalMatrix * normal);
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-view.xyz);
        vViewDepth = -view.z;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform vec3 colour;
      uniform float strength;
      uniform sampler2D depthTexture;
      uniform float near;
      uniform float far;
      uniform vec2 resolution;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vViewDepth;
      void main() {
        float rim = pow(abs(dot(normalize(vNormal), vView)), 2.0);
        float glow = strength * 0.6 * vAlong * rim;
        #ifdef SOFT
          float scene = -perspectiveDepthToViewZ(texture2D(depthTexture, gl_FragCoord.xy / resolution).x, near, far);
          glow *= smoothstep(0.0, 1.0, scene - vViewDepth);
        #endif
        gl_FragColor = vec4(colour * glow, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: !soft,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}
const softScene = new THREE.Scene()
const coneGeometry = (light: THREE.SpotLight) =>
  new THREE.ConeGeometry(Math.tan(light.angle) * light.distance, light.distance, 48, 1, true)
    .translate(0, -light.distance / 2, 0)
    .rotateX(Math.PI)
const coneOf = (light: THREE.SpotLight, soft: boolean) => {
  const cone = new THREE.Mesh(coneGeometry(light), coneMaterial(light.color, soft))
  cone.position.copy(light.position)
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), light.target.position.clone().sub(light.position).normalize())
  return cone
}
const cones = spots.map((light) => scene.add(coneOf(light, false)).children.at(-1) as THREE.Mesh<THREE.ConeGeometry, THREE.ShaderMaterial>)
const softCones = spots.map((light) => softScene.add(coneOf(light, true)).children.at(-1) as THREE.Mesh<THREE.ConeGeometry, THREE.ShaderMaterial>)

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
  timer.reset()
}

const timer = new GpuTimer(renderer)
renderer.autoClear = false
function frame() {
  controls.update()
  timer.begin()
  renderer.setRenderTarget(target)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  renderer.clear()
  renderer.render(showScene, flat)
  if (mode === 'soft' || mode === 'beam') {
    useDepth(target, camera)
    renderer.render(mode === 'beam' ? beamScene : softScene, camera)
  }
  timer.end()
  shown(timer, $('cost'))
  requestAnimationFrame(frame)
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.modes button')) button.addEventListener('click', () => setMode(button.dataset.mode as Mode))
$<HTMLInputElement>('steps').addEventListener('input', (event) => {
  steps = Number((event.target as HTMLInputElement).value)
  $('stepsOut').textContent = String(steps)
  buildBeams()
  timer.reset()
})
$<HTMLInputElement>('strength').addEventListener('input', (event) => {
  strength = Number((event.target as HTMLInputElement).value)
  $('strengthOut').textContent = strength.toFixed(2)
  for (const beam of beams) beam.material.uniforms.strength.value = strength
  for (const cone of [...cones, ...softCones]) cone.material.uniforms.strength.value = strength
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
