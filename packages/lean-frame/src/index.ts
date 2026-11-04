import * as THREE from 'three'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/*
 * The frame in two steps: the scene into one multisampled HDR target that keeps its depth, then onto the screen through
 * three's output pass (tone mapping and colour space). No ping-pong between full-size targets, no anti-aliasing pass,
 * and a cap on device pixels per CSS pixel, where a phone at 3x pays nine times the pixels for a sharpness few notice.
 * The depth stays on the target for whatever reads it after (beams, fog, outlines).
 */

export interface LeanFrameOptions {
  /** The most device pixels to a CSS pixel. */
  maxRatio?: number
  /** MSAA samples on the target; 0 turns anti-aliasing off. */
  samples?: number
}

export class LeanFrame {
  readonly target: THREE.WebGLRenderTarget
  readonly #renderer: THREE.WebGLRenderer
  readonly #output = new OutputPass()
  readonly #maxRatio: number

  constructor(renderer: THREE.WebGLRenderer, { maxRatio = 1.5, samples = 4 }: LeanFrameOptions = {}) {
    this.#renderer = renderer
    this.#maxRatio = maxRatio
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples,
      depthTexture: new THREE.DepthTexture(1, 1),
    })
    this.#output.renderToScreen = true
  }

  /** The pixel ratio the frame draws at for a device of `device` pixels per CSS pixel. */
  ratio(device = devicePixelRatio) {
    return Math.min(device, this.#maxRatio)
  }

  /** Sizes the canvas and the target; `width` and `height` in CSS pixels. */
  setSize(width: number, height: number, device = devicePixelRatio) {
    this.#renderer.setPixelRatio(this.ratio(device))
    this.#renderer.setSize(width, height)
    const buffer = this.#renderer.getDrawingBufferSize(new THREE.Vector2())
    this.target.setSize(buffer.x, buffer.y)
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    const renderer = this.#renderer
    renderer.setRenderTarget(this.target)
    renderer.render(scene, camera)
    this.#output.render(renderer, null as unknown as THREE.WebGLRenderTarget, this.target, 0, false)
  }

  dispose() {
    this.target.dispose()
    this.#output.dispose()
  }
}
