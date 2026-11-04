import * as THREE from 'three'
import { cellsOf, type Spot } from './cells'
import { sightOf, sightTexture } from './sight'
import { blockedBy } from './walls'

/*
 * three lights every fragment with every light in the scene: sixty spots are sixty light evaluations per pixel, and a
 * new shader each time the count changes. Here the spots live in a texture, the floor plan is cut into cells, and each
 * cell lists the few spots whose light reaches it. A fragment finds its cell and lights itself with those alone,
 * through the material's own RE_Direct, so a spot looks as it would as a SpotLight without a shadow. The shader never
 * changes with the number of spots. Given walls, each spot's light is also scaled by what it sees of the plan
 * (./sight.ts), so the walls throw soft shadows.
 */

export interface LightGridOptions {
  /** The part of the world the spots light, x and z for the plan, y for the heights the cells are weighed at. */
  area: THREE.Box3
  /** A cell's side, in scene units. */
  cell?: number
  /** The most spots one cell takes, a multiple of 4; the weakest past it are left out. */
  perCell?: number
  /** With walls: how finely the plan is sampled for what each spot sees, and the two heights it's sampled at. */
  sight?: { step?: number; heights?: [number, number] }
}

/* Texels per spot: position and cut-off, direction and decay, colour and cone, penumbra. */
const TEXELS = 4
const ROW = 64

const VERTEX_PARS = /* glsl */ `
varying vec3 vGridWorld;
`
const VERTEX = /* glsl */ `
{
  vec4 gridWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
  gridWorld = batchingMatrix * gridWorld;
  #endif
  #ifdef USE_INSTANCING
  gridWorld = instanceMatrix * gridWorld;
  #endif
  vGridWorld = ( modelMatrix * gridWorld ).xyz;
}
`
const FRAGMENT_PARS = /* glsl */ `
varying vec3 vGridWorld;
uniform highp sampler2D lightGridCells;
uniform highp sampler2D lightGridSpots;
uniform vec2 lightGridOrigin;
uniform vec2 lightGridSize;
uniform vec2 lightGridEnd;
uniform float lightGridCell;
uniform sampler2D lightGridSight;
uniform vec4 lightGridSightSize;
uniform float lightGridSightStep;
uniform vec2 lightGridSightHeights;
/* How much of a spot's light the walls let through to a point, 1 with no walls given. */
float lightGridSightOf( int spot, vec3 world ) {
  if ( lightGridSightSize.x <= 0.0 ) return 1.0;
  vec2 at = clamp( ( world.xz - lightGridOrigin ) / lightGridSightStep - 0.5, vec2( 0.0 ), lightGridSightSize.xy - 1.0 ) + 0.5;
  float t = clamp( ( world.y - lightGridSightHeights.x ) / ( lightGridSightHeights.y - lightGridSightHeights.x ), 0.0, 1.0 );
  int across = int( lightGridSightSize.z );
  vec2 size = vec2( lightGridSightSize.z * lightGridSightSize.x, lightGridSightSize.w );
  int low = spot * 2;
  vec2 lowAt = vec2( float( low % across ) * lightGridSightSize.x, float( low / across ) * lightGridSightSize.y ) + at;
  vec2 highAt = vec2( float( ( low + 1 ) % across ) * lightGridSightSize.x, float( ( low + 1 ) / across ) * lightGridSightSize.y ) + at;
  return mix( texture( lightGridSight, lowAt / size ).r, texture( lightGridSight, highAt / size ).r, t );
}
`
/* After three's own lights, adding to the same reflected light. */
const FRAGMENT = /* glsl */ `
#if defined( RE_Direct )
/* three sets this only when the scene has a light of its own, and the physical BRDF reads it. */
#if defined( STANDARD ) && !( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / ( material.dfg.x + material.dfg.y ) - 1.0 );
#endif
{
  ivec2 gridCell = ivec2( floor( ( vGridWorld.xz - lightGridOrigin ) / lightGridCell ) );
  if ( all( greaterThanEqual( gridCell, ivec2( 0 ) ) ) && all( lessThan( gridCell, ivec2( lightGridSize ) ) ) && all( lessThanEqual( vGridWorld.xz, lightGridEnd ) ) ) {
    IncidentLight gridLight;
    /* Read a little off the surface into the room it faces, so a lit wall doesn't take in the dark behind it. */
    vec3 sightAt = vGridWorld + normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz ) * lightGridSightStep * 0.6;
    for ( int part = 0; part < LIGHT_GRID_PER / 4; part ++ ) {
      vec4 slots = texelFetch( lightGridCells, ivec2( gridCell.x * ( LIGHT_GRID_PER / 4 ) + part, gridCell.y ), 0 );
      for ( int k = 0; k < 4; k ++ ) {
        if ( slots[ k ] < 0.0 ) continue;
        int i = int( slots[ k ] );
        ivec2 at = ivec2( ( i % ${ROW} ) * ${TEXELS}, i / ${ROW} );
        vec4 a = texelFetch( lightGridSpots, at, 0 );
        vec4 b = texelFetch( lightGridSpots, at + ivec2( 1, 0 ), 0 );
        vec4 c = texelFetch( lightGridSpots, at + ivec2( 2, 0 ), 0 );
        vec4 d = texelFetch( lightGridSpots, at + ivec2( 3, 0 ), 0 );
        vec3 lVector = ( viewMatrix * vec4( a.xyz, 1.0 ) ).xyz - geometryPosition;
        gridLight.direction = normalize( lVector );
        float cone = getSpotAttenuation( c.w, d.x, dot( gridLight.direction, normalize( ( viewMatrix * vec4( b.xyz, 0.0 ) ).xyz ) ) );
        if ( cone <= 0.0 ) continue;
        gridLight.color = c.rgb * cone * getDistanceAttenuation( length( lVector ), a.w, b.w ) * lightGridSightOf( i, sightAt );
        gridLight.visible = true;
        RE_Direct( gridLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      }
    }
  }
}
#endif
`

export class LightGrid {
  readonly uniforms = {
    lightGridCells: { value: null as THREE.DataTexture | null },
    lightGridSpots: { value: null as THREE.DataTexture | null },
    lightGridOrigin: { value: new THREE.Vector2() },
    lightGridSize: { value: new THREE.Vector2() },
    lightGridEnd: { value: new THREE.Vector2() },
    lightGridCell: { value: 1 },
    lightGridSight: { value: null as THREE.DataTexture | null },
    lightGridSightSize: { value: new THREE.Vector4() },
    lightGridSightStep: { value: 0.25 },
    lightGridSightHeights: { value: new THREE.Vector2() },
  }
  readonly #area: THREE.Box3
  readonly #cell: number
  readonly #perCell: number
  readonly #sightHeights: [number, number]
  readonly #marked = new WeakSet<THREE.Material>()

  constructor({ area, cell = 1, perCell = 8, sight = {} }: LightGridOptions) {
    this.#area = area.clone()
    this.#cell = cell
    this.#perCell = Math.max(4, Math.ceil(perCell / 4) * 4)
    this.uniforms.lightGridCell.value = cell
    this.uniforms.lightGridSightStep.value = sight.step ?? cell / 4
    const height = area.max.y - area.min.y
    this.#sightHeights = sight.heights ?? [area.min.y + 0.05 * height, area.min.y + 0.6 * height]
    this.uniforms.lightGridSightHeights.value.fromArray(this.#sightHeights)
  }

  /**
   * Takes these spots as the grid's light. They needn't be in the scene; if they are, hide them, or they light twice.
   * With `walls`, meshes that stand in the light, each taken as its box, spots light only what they can see.
   * Returns how many cells were reached by more spots than they could take.
   */
  set(lights: THREE.SpotLight[], { walls }: { walls?: THREE.Object3D[] } = {}) {
    const spots = lights.map(spotOf)
    const blocked = walls?.length ? blockedBy(walls) : undefined
    const sight = blocked && sightOf(spots, this.#area, this.uniforms.lightGridSightStep.value, this.#sightHeights, blocked)
    /* A neighbour's spots only go where the sight texture can still cut them off. */
    const grid = cellsOf(spots, this.#area, this.#cell, this.#perCell, blocked, !!sight)
    this.#replace('lightGridSpots', spotTexture(spots))
    this.#replace('lightGridCells', new THREE.DataTexture(grid.cells, grid.columns * (this.#perCell / 4), grid.rows, THREE.RGBAFormat, THREE.FloatType))
    this.uniforms.lightGridOrigin.value.set(this.#area.min.x, this.#area.min.z)
    this.uniforms.lightGridSize.value.set(grid.columns, grid.rows)
    this.uniforms.lightGridEnd.value.set(this.#area.max.x, this.#area.max.z)
    this.uniforms.lightGridSight.value?.dispose()
    this.uniforms.lightGridSight.value = sight ? sightTexture(sight) : null
    if (sight) this.uniforms.lightGridSightSize.value.set(sight.width, sight.rows, sight.across, sight.height)
    else this.uniforms.lightGridSightSize.value.set(0, 0, 1, 1)
    return grid.crowded
  }

  /** Lets a lit material (standard, physical, lambert, phong, toon) take the grid's spots. */
  apply(material: THREE.Material) {
    if (this.#marked.has(material)) return
    this.#marked.add(material)
    const before = material.onBeforeCompile.bind(material)
    const key = material.customProgramCacheKey.bind(material)
    const per = this.#perCell
    material.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer)
      if (!shader.fragmentShader.includes('#include <lights_fragment_begin>')) return
      Object.assign(shader.uniforms, this.uniforms)
      shader.defines = { ...shader.defines, LIGHT_GRID_PER: per }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
        .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>\n${FRAGMENT}`)
    }
    material.customProgramCacheKey = () => `${key()}|light-grid-${per}`
    material.needsUpdate = true
  }

  dispose() {
    this.uniforms.lightGridCells.value?.dispose()
    this.uniforms.lightGridSpots.value?.dispose()
    this.uniforms.lightGridSight.value?.dispose()
  }

  #replace(name: 'lightGridCells' | 'lightGridSpots', texture: THREE.DataTexture) {
    texture.needsUpdate = true
    this.uniforms[name].value?.dispose()
    this.uniforms[name].value = texture
  }
}

/** A spot light as three's shader takes it: world position and direction, colour times intensity, its cone. */
function spotOf(light: THREE.SpotLight): Spot {
  light.updateMatrixWorld()
  light.target.updateMatrixWorld()
  const position = light.getWorldPosition(new THREE.Vector3())
  const toward = position.clone().sub(light.target.getWorldPosition(new THREE.Vector3())).normalize()
  return {
    position,
    toward,
    colour: light.color.clone().multiplyScalar(light.intensity),
    distance: light.distance,
    decay: light.decay,
    coneCos: Math.cos(light.angle),
    penumbraCos: Math.cos(light.angle * (1 - light.penumbra)),
  }
}

function spotTexture(spots: Spot[]) {
  const rows = Math.max(1, Math.ceil(spots.length / ROW))
  const data = new Float32Array(ROW * TEXELS * rows * 4)
  spots.forEach((spot, i) => {
    const at = ((Math.floor(i / ROW) * ROW + (i % ROW)) * TEXELS) * 4
    data.set([...spot.position.toArray(), spot.distance], at)
    data.set([...spot.toward.toArray(), spot.decay], at + 4)
    data.set([spot.colour.r, spot.colour.g, spot.colour.b, spot.coneCos], at + 8)
    data.set([spot.penumbraCos, 0, 0, 0], at + 12)
  })
  return new THREE.DataTexture(data, ROW * TEXELS, rows, THREE.RGBAFormat, THREE.FloatType)
}
