import * as THREE from 'three'
import type { Blocked } from './walls'

/** A spot in world space, as three's shader lights with it. */
export interface Spot {
  position: THREE.Vector3
  /** Unit vector from the target toward the light. */
  toward: THREE.Vector3
  colour: THREE.Color
  distance: number
  decay: number
  coneCos: number
  penumbraCos: number
}

/* Points a cell is weighed at: its edges and middle both ways, at the bottom, middle and top of the area. */
const ACROSS = [0, 0.5, 1]
const UP = [0, 0.5, 1]

const at = new THREE.Vector3()
const toLight = new THREE.Vector3()

/** What a spot gives a point, the way three's shader works it out, ignoring the surface's facing. */
export function strength(spot: Spot, point: THREE.Vector3) {
  toLight.subVectors(spot.position, point)
  const length = toLight.length()
  if (spot.distance > 0 && length >= spot.distance) return 0
  const cos = toLight.dot(spot.toward) / Math.max(length, 1e-6)
  const cone = THREE.MathUtils.smoothstep(cos, spot.coneCos, spot.penumbraCos)
  if (cone <= 0) return 0
  let falloff = 1 / Math.max(length ** spot.decay, 0.01)
  if (spot.distance > 0) falloff *= Math.min(Math.max(1 - (length / spot.distance) ** 4, 0), 1) ** 2
  return cone * falloff * (spot.colour.r + spot.colour.g + spot.colour.b)
}

/**
 * Which spots each cell takes, strongest first, `perCell` at most: four to a texel, -1 where a slot is empty.
 * `crowded` counts the cells that more spots reached than they could take. With `blocked`, a point a wall hides from a
 * spot doesn't count for it. With `spread`, after its own spots a cell takes those that light a neighbour, so a
 * shadow's soft edge carries on across the cell's border instead of stopping at it.
 */
export function cellsOf(spots: Spot[], area: THREE.Box3, cell: number, perCell: number, blocked?: Blocked, spread = false) {
  const columns = Math.max(1, Math.ceil((area.max.x - area.min.x) / cell))
  const rows = Math.max(1, Math.ceil((area.max.z - area.min.z) / cell))
  const height = area.max.y - area.min.y
  const best = new Float32Array(columns * rows * spots.length)
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++)
      spots.forEach((spot, index) => {
        let most = 0
        for (const u of ACROSS)
          for (const v of ACROSS)
            for (const w of UP) {
              at.set(area.min.x + (column + u) * cell, area.min.y + w * height, area.min.z + (row + v) * cell)
              const value = strength(spot, at)
              if (value > most && !blocked?.(spot.position, at)) most = value
            }
        best[(row * columns + column) * spots.length + index] = most
      })
  const cells = new Float32Array(columns * rows * perCell).fill(-1)
  let crowded = 0
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const own: { index: number; value: number }[] = []
      const near: { index: number; value: number }[] = []
      spots.forEach((_, index) => {
        const value = best[(row * columns + column) * spots.length + index]!
        if (value > 0) return own.push({ index, value })
        if (!spread) return
        let around = 0
        for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++)
          for (let c = Math.max(0, column - 1); c <= Math.min(columns - 1, column + 1); c++)
            around = Math.max(around, best[(r * columns + c) * spots.length + index]!)
        if (around > 0) near.push({ index, value: around })
      })
      if (own.length > perCell) crowded++
      const byValue = (a: { value: number }, b: { value: number }) => b.value - a.value
      ;[...own.sort(byValue), ...near.sort(byValue)]
        .slice(0, perCell)
        .forEach(({ index }, k) => (cells[(row * columns + column) * perCell + k] = index))
    }
  return { cells, columns, rows, crowded }
}
