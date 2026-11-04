import * as THREE from 'three'
import { strength, type Spot } from './cells'
import type { Blocked } from './walls'

/*
 * What each spot sees of the floor plan, so a wall throws a soft shadow where it stands instead of the grid cutting the
 * light off at a cell's edge. The plan is sampled every `step` at two heights, a byte each: one slab per spot and
 * height, the slabs side by side, then in bands below. The shader reads it through the texture's linear filter. Where a
 * spot's cone and reach don't take a point in, the point is left seen: the cone already ends the light there.
 */

/** The longest side of a texture every WebGL2 device takes. */
const TALLEST = 4096

export interface Sight {
  data: Uint8Array
  /** One slab's samples across and along, how many slabs lie side by side, and the texture's whole height. */
  width: number
  rows: number
  across: number
  height: number
}

export function sightOf(spots: Spot[], area: THREE.Box3, step: number, heights: [number, number], blocked: Blocked): Sight | null {
  const width = Math.max(1, Math.ceil((area.max.x - area.min.x) / step))
  const rows = Math.max(1, Math.ceil((area.max.z - area.min.z) / step))
  const slabs = spots.length * 2
  const across = Math.max(1, Math.min(slabs, Math.floor(TALLEST / width)))
  const height = Math.max(1, Math.ceil(slabs / across) * rows)
  if (width > TALLEST || height > TALLEST) return null
  const stride = across * width
  const data = new Uint8Array(stride * height).fill(255)
  const point = new THREE.Vector3()
  spots.forEach((spot, index) =>
    heights.forEach((y, layer) => {
      const slab = index * 2 + layer
      const [left, top] = [(slab % across) * width, Math.floor(slab / across) * rows]
      for (let row = 0; row < rows; row++)
        for (let column = 0; column < width; column++) {
          point.set(area.min.x + (column + 0.5) * step, y, area.min.z + (row + 0.5) * step)
          if (strength(spot, point) > 0 && blocked(spot.position, point)) data[(top + row) * stride + left + column] = 0
        }
    }),
  )
  return { data, width, rows, across, height }
}

export function sightTexture({ data, width, across, height }: Sight) {
  const texture = new THREE.DataTexture(data, across * width, height, THREE.RedFormat, THREE.UnsignedByteType)
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  /* A row of bytes needn't be a multiple of four long. */
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}
