import * as THREE from 'three'

/** Whether something stands on the straight line from a spot to a point. */
export type Blocked = (from: THREE.Vector3, to: THREE.Vector3) => boolean

interface Wall {
  inverse: THREE.Matrix4
  box: THREE.Box3
}

const a = new THREE.Vector3()
const b = new THREE.Vector3()

/* The share of the way from a to b where the segment enters the box, or Infinity: slabs, one axis at a time. */
function entry(box: THREE.Box3, from: THREE.Vector3, to: THREE.Vector3) {
  let near = 0
  let far = 1
  for (const axis of ['x', 'y', 'z'] as const) {
    const start = from[axis]
    const run = to[axis] - start
    const [low, high] = [box.min[axis], box.max[axis]]
    if (Math.abs(run) < 1e-9) {
      if (start < low || start > high) return Infinity
      continue
    }
    let t0 = (low - start) / run
    let t1 = (high - start) / run
    if (t0 > t1) [t0, t1] = [t1, t0]
    near = Math.max(near, t0)
    far = Math.min(far, t1)
    if (near > far) return Infinity
  }
  return near
}

/**
 * The meshes under `objects`, each taken as its geometry's box where it stands in the world, as a test for what they
 * hide. A point on a wall's own face isn't hidden by that wall: `margin` (scene units) is left clear at the end.
 */
export function blockedBy(objects: THREE.Object3D[], margin = 0.02): Blocked {
  const walls: Wall[] = []
  for (const object of objects) {
    object.updateWorldMatrix(true, true)
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      node.geometry.computeBoundingBox()
      walls.push({ inverse: node.matrixWorld.clone().invert(), box: node.geometry.boundingBox!.clone() })
    })
  }
  return (from, to) => {
    const length = from.distanceTo(to)
    if (length < 1e-6) return false
    const end = 1 - margin / length
    for (const wall of walls) {
      a.copy(from).applyMatrix4(wall.inverse)
      b.copy(to).applyMatrix4(wall.inverse)
      if (entry(wall.box, a, b) < end) return true
    }
    return false
  }
}
