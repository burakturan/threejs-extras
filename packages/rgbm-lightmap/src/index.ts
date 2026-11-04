import * as THREE from 'three'

/*
 * A baked lightmap as an 8-bit RGBM PNG: each texel holds the square root of its light over a range, as a colour and a
 * multiplier in alpha. The browser decodes the PNG off the main thread, the GPU holds four bytes a texel, and the
 * material's shader turns it back into light where it reads the lightmap. The alpha is a multiplier, not coverage, so
 * nothing on the way may premultiply it or convert its colour.
 */

export interface LoadOptions {
  /** Turn the image over. glTF UVs count v down from the image's top and want false. */
  flipY?: boolean
}

/** Loads an RGBM PNG as a lightmap texture, decoded off the main thread and left as it was written. */
export async function loadRGBM(url: string, { flipY = false }: LoadOptions = {}) {
  const loader = new THREE.ImageBitmapLoader().setOptions({
    imageOrientation: flipY ? 'flipY' : 'from-image',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  const bitmap = await loader.loadAsync(url)
  const texture = new THREE.Texture(bitmap)
  texture.colorSpace = THREE.NoColorSpace
  texture.flipY = false
  texture.premultiplyAlpha = false
  /* A mip averages coded texels, not light; a lightmap is smooth enough to go without. */
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

const TEXEL = 'vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );'
const DECODED = `${TEXEL}
lightMapTexel.rgb *= lightMapTexel.a;
lightMapTexel.rgb *= lightMapTexel.rgb * rgbmRange;`

const ranges = new WeakMap<THREE.Material, { value: number }>()

/**
 * Lets a material read its lightMap as RGBM written with this range. Works on the basic material and the lit ones
 * (lambert, phong, standard, physical, toon). Call it again to change the range; the shader stays the same.
 */
export function readRGBM(material: THREE.Material, range: number) {
  const known = ranges.get(material)
  if (known) {
    known.value = range
    return
  }
  const uniform = { value: range }
  ranges.set(material, uniform)
  const before = material.onBeforeCompile.bind(material)
  const key = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer)
    shader.uniforms.rgbmRange = uniform
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float rgbmRange;')
      .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps)
      .replace(TEXEL, DECODED)
  }
  material.customProgramCacheKey = () => `${key()}|rgbm`
  material.needsUpdate = true
}
