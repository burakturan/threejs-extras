# @threejs-extras/light-slots

In the gallery editor I'm working on, hanging one linear pendant lamp froze the whole view for a second or more.
Taking it down again was instant. That asymmetry was the clue.

three.js puts the number of point, spot and rect area lights into the cache key of every lit shader program. Add one
light and the count changes, so every lit material needs a new program. If it isn't cached yet, it compiles on the
next render, all at once, on the main thread. Removing the lamp goes back to a count three.js has already compiled
for, which is why that part felt free.

`LightSlots` keeps those counts from moving. It pads each kind of light up to a fixed step with lights at zero
intensity, parked far away. A real lamp coming or going inside a step leaves the count where it was, and nothing
compiles.

**[Live demo](https://burakturan.github.io/threejs-extras/light-slots/)**

## What it changes

The [demo](https://burakturan.github.io/threejs-extras/light-slots/) has 64 boxes, each with its own shader program on purpose
(a furnished scene gets there through maps, normal maps, transparency and so on), and the lamps are `RectAreaLight`s.
I added five lamps and removed two, timing the frame each change landed on with the GPU flushed. Desktop Chrome, NVIDIA
card:

| | Lamp added | Programs compiled | Lamp removed |
| --- | --- | --- | --- |
| Plain three.js | 1.2 to 4.2 s | 65 each time | 1.5 to 2.7 ms |
| `LightSlots`, `step: 8`, `reserve: { area: 8 }` | 0.6 to 3.7 ms | 0 | 0.7 ms |

## Use

```ts
import { LightSlots } from '@threejs-extras/light-slots'

const slots = new LightSlots(scene) // steps of 4

scene.add(lamp)
slots.update() // after adding or removing lamps, before the next render

// once the camera has been still for a moment:
slots.release()
```

With steps of 4, lamps 1 to 4 share one count, 5 to 8 the next, and so on. Crossing a step still compiles once. The
very first lamp also compiles, because the count goes from 0 to 4. If you know roughly how many lamps a scene will
have, reserve them up front and the compile moves to the first render instead, where nobody notices:

```ts
const slots = new LightSlots(scene, { step: 8, reserve: { area: 8 } })
```

That's what the demo does.

The held count never drops by itself, so taking lamps down never compiles either. `release()` brings it back to what
the scene needs. It compiles if the count changes, so call it when the view is idle.

| Option | Default | |
| --- | --- | --- |
| `step` | `4` | Counts are rounded up to a multiple of this. |
| `reserve` | `{}` | Minimum count per kind (`point`, `spot`, `area`), held even before the first lamp. |

## The catch

An empty slot gives no light, but the shader still loops over it for every lit pixel. Area lights are the most
expensive of the three. I keep `step` and `reserve` close to what the scene actually uses and call `release()` when
the editor goes quiet.

Shadow-casting lights and spot lights with a `map` are keyed separately by three.js and aren't touched.

MIT licensed.
