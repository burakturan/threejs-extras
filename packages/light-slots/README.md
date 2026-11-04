# @threejs-extras/light-slots

Add or remove a lamp in three.js and the next frame can freeze for seconds. This keeps it under a few milliseconds.

## Why it freezes

three.js compiles each lit material's shader for the exact number of lights in the scene. The program cache key
holds how many point, spot and rect area lights there are. Change that number by one, and every lit material is
compiled again on the next frame. With a handful of materials you won't notice; in a real scene with dozens of
distinct materials the view stops dead.

## What it does

`LightSlots` keeps those counts steady. It tops each kind of light up to the next multiple of `step` with lights that
give no light (intensity 0, far away). A lamp coming or going inside a step changes nothing three keys on, so nothing
compiles. The count it holds never drops on its own; you call `release()` when the view is still, the one moment a
compile costs nobody anything.

## Measured

The demo: 64 objects, each with its own shader, lamps as rect area lights. Five lamps added, then two removed, the
frame each one lands on timed with the GPU flushed. Desktop Chrome, NVIDIA card.

| | Each lamp added | Shaders compiled per lamp | Lamp removed |
| --- | --- | --- | --- |
| Plain three.js | 1.2 to 4.2 s | 65 | 1.5 to 2.7 ms (programs already cached) |
| With `LightSlots` (`step: 8, reserve: { area: 8 }`) | 0.6 to 3.7 ms | 0 | 0.7 ms |

## Use

```ts
import { LightSlots } from '@threejs-extras/light-slots'

const slots = new LightSlots(scene, { step: 4 })

scene.add(lamp)
slots.update() // after any lamp is added or removed

// later, when the camera has been still for a moment:
slots.release()
```

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `step` | `4` | Lights are held in multiples of this many. Crossing a step still compiles once. |
| `reserve` | `{}` | Slots held from the start per kind (`point`, `spot`, `area`), so not even the first lamps compile. |

## Trade-off

An empty slot still costs: three loops over every light of a kind for every lit pixel, whether it gives light or not.
Area lights are the dearest. Keep `step` and `reserve` near what the scene really uses, and `release()` when idle.

Shadow-casting lights and spot lights with a `map` are keyed apart by three and are left alone.
