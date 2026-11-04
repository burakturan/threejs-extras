import * as THREE from 'three'

/*
 * three.js builds every lit shader for the exact number of lights in the scene: its program cache key holds how many
 * point, spot and rect area lights there are. Add or remove one lamp and every lit material compiles again on the
 * next frame, which freezes the view for tens to thousands of milliseconds depending on how many materials there are.
 *
 * LightSlots keeps those counts steady. It tops each kind up to the next multiple of `step` with lights that give no
 * light (intensity 0, far away), so a lamp coming or going inside a step changes nothing three keys on. The count it
 * holds never drops on its own; `release()` lets it fall back when nobody is looking, the one moment a compile is free.
 */

type Kind = 'point' | 'spot' | 'area'

export interface LightSlotsOptions {
  /** Lights are held in steps of this many; 4 by default. */
  step?: number
  /** Slots to hold from the start, even before the first lamp, so not even the first one compiles. */
  reserve?: Partial<Record<Kind, number>>
}

const KINDS: Kind[] = ['point', 'spot', 'area']

/* The lights three counts in its key for each kind; shadowed and projected lights are keyed apart and left alone. */
function kindOf(node: THREE.Object3D): Kind | null {
  if (node.userData.lightSlot) return null
  if (node instanceof THREE.RectAreaLight) return 'area'
  if (node instanceof THREE.SpotLight) return node.castShadow || node.map ? null : 'spot'
  if (node instanceof THREE.PointLight) return node.castShadow ? null : 'point'
  return null
}

function makeSlot(kind: Kind): THREE.Light {
  const light =
    kind === 'area'
      ? new THREE.RectAreaLight(0xffffff, 0, 0.01, 0.01)
      : kind === 'spot'
        ? new THREE.SpotLight(0xffffff, 0)
        : new THREE.PointLight(0xffffff, 0)
  light.userData.lightSlot = true
  light.position.set(0, -1e5, 0)
  return light
}

export class LightSlots {
  readonly #scene: THREE.Scene
  readonly #step: number
  readonly #reserve: Record<Kind, number>
  readonly #slots: Record<Kind, THREE.Light[]> = { point: [], spot: [], area: [] }
  readonly #held: Record<Kind, number> = { point: 0, spot: 0, area: 0 }

  constructor(scene: THREE.Scene, { step = 4, reserve = {} }: LightSlotsOptions = {}) {
    this.#scene = scene
    this.#step = Math.max(1, step)
    this.#reserve = { point: 0, spot: 0, area: 0, ...reserve }
    this.update()
  }

  /** The scene's own lights of each kind, the slots aside. */
  count(): Record<Kind, number> {
    const counts: Record<Kind, number> = { point: 0, spot: 0, area: 0 }
    this.#scene.traverseVisible((node) => {
      const kind = kindOf(node)
      if (kind) counts[kind]++
    })
    return counts
  }

  /** Call after lamps were added or removed: tops every kind up to what it holds, or to its next step. */
  update() {
    this.#fill(false)
  }

  /** Lets every kind fall back to what the scene needs now; it compiles, so call it while the view is still. */
  release() {
    this.#fill(true)
  }

  /** How many lights three now counts of each kind, the scene's own and the slots together. */
  get held(): Readonly<Record<Kind, number>> {
    return { ...this.#held }
  }

  dispose() {
    for (const kind of KINDS)
      for (const slot of this.#slots[kind]) {
        slot.removeFromParent()
        slot.dispose()
      }
  }

  #fill(release: boolean) {
    const counts = this.count()
    for (const kind of KINDS) {
      const own = counts[kind]
      const needed = Math.max(this.#reserve[kind], own ? Math.ceil(own / this.#step) * this.#step : 0)
      this.#held[kind] = release ? needed : Math.max(needed, this.#held[kind])
      const wanted = this.#held[kind] - own
      const slots = this.#slots[kind]
      while (slots.length < wanted) slots.push(makeSlot(kind))
      slots.forEach((slot, index) => {
        if (slot.parent !== this.#scene) this.#scene.add(slot)
        slot.visible = index < wanted
      })
    }
  }
}
