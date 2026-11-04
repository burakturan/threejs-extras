# @threejs-extras/add-when-ready

In the gallery editor, dropping a new kind of object into a room stopped the view for most of a second. Same story as
[light-slots](../light-slots), different trigger: three.js compiles a material's shader on the first frame that draws
it, on the main thread, and nothing moves until it's linked.

three has had `renderer.compileAsync` for a while. Where the browser and driver offer `KHR_parallel_shader_compile`,
as desktop Chrome did for me, the compile runs off the main thread and the promise tells you when it's done. Two
things make it work in practice. The object mustn't be drawn before then, or the frame that draws it waits anyway, so
it stays out of the scene until the promise resolves. And it has to be compiled against the scene's lights and the
render target the frame really draws into, since those decide which program three picks; the target matters for tone
mapping and colour space. `addWhenReady` does both: compile first, then add.

**[Live demo](https://burakturan.github.io/threejs-extras/add-when-ready/)**

## What it changes

Each press in the demo adds eight objects with physical materials. A random salt goes into each shader's source and
its program key, so three can't reuse a program and the source is new to the browser too. The camera keeps turning,
and the demo records the longest gap between two animation frames in the two seconds after the press. Desktop Chrome,
GTX 1060, five presses each:

| | Longest frame |
| --- | --- |
| `scene.add` | 913 to 959 ms |
| `addWhenReady` | 8 to 13 ms |

With `addWhenReady` the objects joined the scene 215 to 277 ms after the press. In an editor that's the trade I want:
the object turns up a beat later and the camera keeps moving.

## Use

```ts
import { addWhenReady } from '@threejs-extras/add-when-ready'

await addWhenReady(renderer, mesh, { scene, camera })

// into a group, drawn into a render target of your own:
await addWhenReady(renderer, mesh, { scene, camera, parent: room, target: sceneTarget })
```

| Option | Default | |
| --- | --- | --- |
| `scene` | | The scene the object will be drawn in; its lights decide the program. |
| `camera` | | The camera it will be drawn with. |
| `parent` | `scene` | Where the object is added once it's ready. |
| `target` | `null` | The render target the scene is drawn into. `null` is the canvas. |

With an `EffectComposer`, the scene pass draws into whichever buffer is its read buffer at that moment; any of the
composer's ordinary half float targets compiles the same program, so passing one of them is enough.

## The catch

The object isn't in the scene until the promise resolves, so anything that looks for it in the meantime (a raycast,
a selection outline) won't find it.

Without `KHR_parallel_shader_compile`, three can't ask whether a program is ready. It waits a moment and resolves, and
the first frame that draws the object can still stall. Safari and many phones don't have the extension; I haven't
measured those.

If the scene's lights change before the object shows (one more light, one more shadow caster), the object needs a
program for the new mix, and the first frame compiles it unless it's already cached. [light-slots](../light-slots)
keeps the light counts steady; it doesn't cover shadow casters.

MIT licensed.
