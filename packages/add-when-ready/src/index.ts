import type * as THREE from 'three'

/*
 * A new material compiles on the first frame that draws it, on the main thread, and the view stops until it links.
 * Here the object's shaders compile before it joins the scene: in the background where the browser has
 * KHR_parallel_shader_compile, with the scene's lights and the frame's render target, so the program is the one the
 * frame will use and nothing is compiled twice.
 */

export interface AddOptions {
  scene: THREE.Scene
  camera: THREE.Camera
  /** Where the object goes; the scene by default. */
  parent?: THREE.Object3D
  /** The target the frame draws into (a composer's, say); null for the canvas. Shaders differ between the two. */
  target?: THREE.WebGLRenderTarget | null
}

export async function addWhenReady(renderer: THREE.WebGLRenderer, object: THREE.Object3D, options: AddOptions) {
  const { scene, camera, parent = scene, target = null } = options
  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  const ready = renderer.compileAsync(object, camera, scene)
  renderer.setRenderTarget(previous)
  await ready
  parent.add(object)
}
