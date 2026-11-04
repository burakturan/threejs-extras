# @threejs-extras/light-grid

One of the gallery halls I built had sixty spots. three.js lights every pixel with every light in the scene, so a
pixel of floor in one corner still works through the spot on the far wall, sixty times over. And the lit shaders are
written for exactly sixty lights: a count three hasn't drawn with before compiles them all again. The hall was slow to
open and slow to look at.

`LightGrid` keeps the spots out of the scene. They go into a texture, the floor plan is cut into cells, and each cell
lists the few spots whose light reaches it. A pixel finds its cell and lights itself with those, through the
material's own `RE_Direct`, so a spot looks the way an unshadowed `SpotLight` would. The shader doesn't change with how
many spots there are. Games call this tiled or clustered lighting; three has a clustered version for the
`WebGPURenderer` (`ClusteredLighting` in the addons), and nothing like it for the `WebGLRenderer` I draw with.

**[Live demo](https://burakturan.github.io/threejs-extras/light-grid/)**

| 60 SpotLights | LightGrid |
| --- | --- |
| ![sixty spot lights](../../assets/light-grid-lights.jpg) | ![light grid](../../assets/light-grid-grid.jpg) |

## What it changes

The demo is a 24 by 16 hall: sixty spots, twelve plinths with a metal knot on each, standard materials. Desktop
Chrome, GTX 1060, 1064 by 847, GPU time from a timer query, rounds in one sitting:

| | GPU time per frame | First frame after switching to it |
| --- | --- | --- |
| 60 SpotLights | 9.4 to 10.3 ms | 2333 ms the first time, 872 ms with the browser's shader cache warm |
| LightGrid | 2.3 to 2.9 ms | 113 ms |

With one-metre cells and eight spots a cell, no cell had more candidates than slots. Building the grid for the sixty
spots took 18 to 19 ms on the main thread.

## Use

```ts
import { LightGrid } from '@threejs-extras/light-grid'

const grid = new LightGrid({ area: new THREE.Box3(min, max), cell: 1, perCell: 8 })
grid.set(spots) // SpotLights, not added to the scene
for (const material of litMaterials) grid.apply(material)
```

`area`'s x and z are the plan the cells cover, and grid light stops at its edges. Its y range is only where a cell is
weighed when deciding which spots reach it; grid light isn't cut above or below it. `apply` works on the built-in lit
materials (standard, physical, lambert, phong, toon) through `onBeforeCompile`; call it before the material first
compiles. If a spot moves, turns, or changes colour, intensity, distance, decay, angle or penumbra, call `set` again.
The shaders stay as they are, only the two textures change.

| Option | Default | |
| --- | --- | --- |
| `area` | | The box the spots light. |
| `cell` | `1` | A cell's side in scene units. Smaller cells hold fewer spots each and cost more to build. |
| `perCell` | `8` | The most spots a cell takes, rounded up to a multiple of 4. Past it the weakest are left out. |

`set` returns how many cells had more candidate spots than `perCell`. If it isn't 0, some light is missing there:
raise `perCell` or shrink `cell`. A 0 doesn't prove every spot was found, see below.

## The catch

No shadows, and no projected `map` on a spot. Grid light goes through walls the way an unshadowed `SpotLight`'s does.
In the gallery editor I keep the few spots nearest the camera as real `SpotLight`s with shadows and leave them out of
the grid; this package doesn't do that part, and it doesn't know about walls.

A cell is weighed at nine points across and three heights. A narrow spot that only touches a cell between those points
isn't listed for it and leaves a gap, even with slots free. One-metre cells and gallery spots haven't hit that for me;
smaller cells make it less likely.

Every pixel inside the plan still loops over `perCell` slots, filled or not, and reads four texels from a float
texture for each spot it lights with. With only a handful of spots, plain `SpotLight`s are cheaper.

It needs three r187 or later.

MIT licensed.
