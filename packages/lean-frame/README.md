# @threejs-extras/lean-frame

My gallery viewer drew every frame through an `EffectComposer`: a render pass, ambient occlusion, SMAA, the output
pass. On a laptop that was fine. On a phone it felt heavy, and the first online gallery I'd made, which drew far less,
had felt lighter on the same phone. So I gave the viewer a second way to draw and let phones start with it.

`LeanFrame` is that second way. The scene goes into one multisampled half float target that keeps its depth, and
three's `OutputPass` puts it on the screen with tone mapping and colour space. No ping-pong between full-size targets,
no anti-aliasing pass, and the pixel ratio is capped at 1.5. The depth stays on `target.depthTexture`, so something
like [spot-beam](../spot-beam) can read it after.

**[Live demo](https://burakturan.github.io/threejs-extras/lean-frame/)**

## What it changes

The demo is 100 torus knots in physical materials under four point lights, drawn either through a composer stack
(`RenderPass`, `SMAAPass`, `OutputPass` at the device's pixel ratio) or through `LeanFrame`.

On my desktop, a GTX 1060 at 1064 by 847, timed on the GPU with a timer query:

| Pixel ratio | Composer + SMAA | LeanFrame |
| --- | --- | --- |
| 1x | 2.5 ms, 28 MB | 3.7 ms, 52 MB |
| 2x | 3.9 ms, 110 MB | 4.0 ms, 116 MB (drawn at 1.5x) |
| 3x | 5.7 ms, 248 MB | 4.0 ms, 116 MB (drawn at 1.5x) |

At the same pixel count it's slower and holds more memory on this card; my guess is the four MSAA samples, but I
haven't separated that out. At 2x it's about even, and only at 3x does the cap pay for itself here.

On my phone (ratio about 2.75; no timer query, so frames per second):

| | Composer + SMAA | LeanFrame |
| --- | --- | --- |
| Frames per second | 60 | 60 to 80 |
| Render target memory | 67 MB | 37 MB |

Memory is the demo's estimate for the render targets of the path in use, from their sizes and formats. It isn't the
page's total GPU memory and it isn't a reading from the driver.

## Use

```ts
import { LeanFrame } from '@threejs-extras/lean-frame'

const frame = new LeanFrame(renderer) // maxRatio 1.5, 4 samples
frame.setSize(innerWidth, innerHeight)
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  frame.setSize(innerWidth, innerHeight)
})

renderer.setAnimationLoop(() => frame.render(scene, camera))
```

`setSize` sets the renderer's pixel ratio and size as well as the target's, so call it instead of `renderer.setSize`.
Create the renderer with `antialias: false`; the target does the anti-aliasing and the canvas's own would be wasted.
Tone mapping and colour space come from the renderer's settings, as with any `OutputPass`. `frame.dispose()` frees
the target and the pass.

| Option | Default | |
| --- | --- | --- |
| `maxRatio` | `1.5` | The most device pixels to a CSS pixel. |
| `samples` | `4` | MSAA samples on the target. `0` turns anti-aliasing off and saves the most memory. |

## The catch

If all you want is the cap, `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))` does it in one line. With a
composer, set `composer.setPixelRatio` to the same, since it keeps its own. `LeanFrame` is for when you also want to
drop the composer chain and still have anti-aliasing and a depth texture.

You give up whatever the composer was doing: ambient occlusion, bloom, anything else in the chain. Drawn at 1.5x on a
3x phone screen the image is a little softer; I couldn't tell without looking for it.

MIT licensed.
