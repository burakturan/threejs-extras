import type * as THREE from 'three'

/*
 * GPU time of what is drawn between begin() and end(), read back a few frames later. gl.finish() is no clock in
 * Chrome: it returns before the GPU is done, so timing around it shows the CPU side only.
 */
export class GpuTimer {
  readonly #gl: WebGL2RenderingContext
  readonly #ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  readonly #pending: WebGLQuery[] = []
  readonly #samples: number[] = []

  constructor(renderer: THREE.WebGLRenderer) {
    this.#gl = renderer.getContext() as WebGL2RenderingContext
    this.#ext = this.#gl.getExtension('EXT_disjoint_timer_query_webgl2')
  }

  get available() {
    return this.#ext !== null
  }

  begin() {
    if (!this.#ext) return
    const query = this.#gl.createQuery()
    this.#gl.beginQuery(this.#ext.TIME_ELAPSED_EXT, query)
    this.#pending.push(query)
  }

  end() {
    if (!this.#ext) return
    const gl = this.#gl
    gl.endQuery(this.#ext.TIME_ELAPSED_EXT)
    const disjoint = gl.getParameter(this.#ext.GPU_DISJOINT_EXT)
    while (this.#pending.length && gl.getQueryParameter(this.#pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.#pending.shift()!
      if (!disjoint) this.#samples.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6)
      gl.deleteQuery(query)
    }
  }

  /** The median of the last `count` frames in milliseconds, once that many are in; then it starts over. */
  median(count = 60): number | null {
    if (this.#samples.length < count) return null
    const sorted = this.#samples.splice(0).sort((a, b) => a - b)
    return sorted[sorted.length >> 1]
  }

  reset() {
    this.#samples.length = 0
  }
}

/** What to show for a timer: the median, or why there is none. */
export function shown(timer: GpuTimer, element: HTMLElement) {
  if (!timer.available) element.textContent = 'no GPU timer here'
  const ms = timer.median()
  if (ms !== null) element.textContent = `${ms.toFixed(2)} ms`
}
