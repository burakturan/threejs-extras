import * as THREE from 'three'

/*
 * A spot light's beam as it shows in hazy air. Each pixel of the cone walks the part of its sight line that lies inside
 * the light's cone, stopping at whatever surface the scene has there, and adds up the light the haze would send toward
 * the eye: the cone's soft edge, falling off with distance squared, scattered mostly forward. Because it stops at the
 * scene's depth, the beam fades into the floor instead of cutting it with a line, and a wall in front hides it.
 *
 * It needs the scene's depth: render the scene into a target with a depth texture first and hand it over in
 * `BeamDepth`. Beams are additive and drawn after the scene, so keep them in a scene of their own.
 */

/** The scene's depth, shared by every beam: fill it each frame before drawing them. */
export const BeamDepth = {
  texture: { value: null as THREE.Texture | null },
  near: { value: 0.1 },
  far: { value: 100 },
  resolution: { value: new THREE.Vector2(1, 1) },
}

/** Points `BeamDepth` at a target's depth and the camera that drew it. */
export function useDepth(target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera) {
  BeamDepth.texture.value = target.depthTexture
  BeamDepth.near.value = camera.near
  BeamDepth.far.value = camera.far
  BeamDepth.resolution.value.set(target.width, target.height)
}

export interface SpotBeamOptions {
  /** How far the beam reaches, metres; the light's distance when it has one, else 6. */
  reach?: number
  /** The brightest share of white the beam adds; keep it low for gallery haze. */
  strength?: number
  /** Samples along each sight line; more is smoother and dearer. */
  steps?: number
}

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying float vViewDepth;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 view = viewMatrix * world;
    vViewDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`

const fragmentShader = /* glsl */ `
  #include <packing>
  uniform vec3 colour;
  uniform float strength;
  uniform vec3 apex;
  uniform vec3 axis;
  uniform float cosOuter;
  uniform float cosInner;
  uniform float reach;
  uniform sampler2D depthTexture;
  uniform float near;
  uniform float far;
  uniform vec2 resolution;
  varying vec3 vWorld;
  varying float vViewDepth;

  const float G = 0.6;
  float phase(float c) {
    float d = 1.0 + G * G - 2.0 * G * c;
    return 0.04 + 0.08 * (1.0 - G * G) / (d * sqrt(d));
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = vWorld - ro;

    // Where the sight line enters the cone: at once if the eye is inside it.
    vec3 co = ro - apex;
    float c2 = cosOuter * cosOuter;
    float da = dot(rd, axis);
    float oa = dot(co, axis);
    float t0 = 0.0;
    if (!(oa > 0.0 && oa * oa > dot(co, co) * c2)) {
      float a = da * da - dot(rd, rd) * c2;
      float b = 2.0 * (da * oa - dot(rd, co) * c2);
      float c = oa * oa - dot(co, co) * c2;
      float disc = b * b - 4.0 * a * c;
      if (disc < 0.0) discard;
      float root = sqrt(disc);
      float ta = (-b - root) / (2.0 * a);
      float tb = (-b + root) / (2.0 * a);
      float first = min(ta, tb);
      float second = max(ta, tb);
      t0 = first > 0.0 && oa + first * da > 0.0 ? first : max(second, 0.0);
    }

    // Where it leaves: the cone's far side (this fragment), or the scene's surface if that comes first.
    float sceneDepth = -perspectiveDepthToViewZ(texture2D(depthTexture, gl_FragCoord.xy / resolution).x, near, far);
    float t1 = min(1.0, sceneDepth / vViewDepth);
    if (t1 <= t0) discard;

    // A different start per pixel turns the steps' banding into fine grain.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float dt = (t1 - t0) / float(STEPS);
    float sum = 0.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * (t0 + (float(i) + jitter) * dt);
      vec3 out_ = p - apex;
      float along = dot(out_, axis);
      if (along <= 0.0 || along > reach) continue;
      float d2 = max(dot(out_, out_), 1e-4);
      vec3 toward = out_ * inversesqrt(d2);
      float edge = smoothstep(cosOuter, cosInner, dot(toward, axis));
      float fade = 1.0 - smoothstep(reach * 0.7, reach, along);
      sum += edge * fade / (1.0 + 0.3 * d2) * phase(dot(toward, normalize(ro - p)));
    }
    float gathered = sum * length(rd) * dt * 5.0;
    gl_FragColor = vec4(colour * strength * (1.0 - exp(-gathered)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** The beam of `light`, a mesh to add to the scene; call `update()` when the light or its target moves. */
export class SpotBeam extends THREE.Mesh<THREE.ConeGeometry, THREE.ShaderMaterial> {
  readonly light: THREE.SpotLight
  readonly #reach: number

  constructor(light: THREE.SpotLight, { reach, strength = 0.35, steps = 24 }: SpotBeamOptions = {}) {
    const length = reach ?? (light.distance > 0 ? light.distance : 6)
    /* A closed cone a little wider than the light, drawn from the inside so it shows from within as from without. */
    const radius = Math.tan(light.angle) * length * 1.05
    const geometry = new THREE.ConeGeometry(radius, length, 48, 1, false).translate(0, -length / 2, 0).rotateX(Math.PI)
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { STEPS: Math.max(4, Math.round(steps)) },
      uniforms: {
        colour: { value: light.color.clone() },
        strength: { value: strength },
        apex: { value: new THREE.Vector3() },
        axis: { value: new THREE.Vector3(0, -1, 0) },
        cosOuter: { value: Math.cos(light.angle) },
        cosInner: { value: Math.cos(light.angle * (1 - light.penumbra)) },
        reach: { value: length },
        depthTexture: BeamDepth.texture,
        near: BeamDepth.near,
        far: BeamDepth.far,
        resolution: BeamDepth.resolution,
      },
      transparent: true,
      depthWrite: false,
      /* The surface the beam ends on is found in the shader; a hard depth test would cut it with a line. */
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
    super(geometry, material)
    this.light = light
    this.#reach = length
    this.frustumCulled = false
    this.update()
  }

  /** Follows the light: its place, where it points and its colour. */
  update() {
    const apex = this.light.getWorldPosition(new THREE.Vector3())
    const target = this.light.target.getWorldPosition(new THREE.Vector3())
    const axis = target.sub(apex).normalize()
    this.position.copy(apex)
    /* The cone is built along +y from its tip; turned so +y runs down the light's axis. */
    this.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
    const u = this.material.uniforms
    u.apex.value.copy(apex)
    u.axis.value.copy(axis)
    u.colour.value.copy(this.light.color)
    u.cosOuter.value = Math.cos(this.light.angle)
    u.cosInner.value = Math.cos(this.light.angle * (1 - this.light.penumbra))
    u.reach.value = this.#reach
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
