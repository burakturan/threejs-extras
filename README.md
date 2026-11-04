# threejs-extras

I'm building a 3D editor for galleries and museums in three.js, and every so often I hit something three.js leaves
for you to figure out. When the fix turns out small and general enough, it goes here as its own package, with a demo
that shows the before and after. The [demos](https://burakturan.github.io/threejs-extras/) run in the browser.

## [light-slots](packages/light-slots)

Hanging one more lamp froze the view for a second or more, because three.js recompiles every lit shader when the
number of lights changes. `LightSlots` keeps the count steady, so the frame a lamp lands on takes a couple of
milliseconds instead.

[![light-slots demo](assets/light-slots.png)](https://burakturan.github.io/threejs-extras/light-slots/)

## [spot-beam](packages/spot-beam)

A visible beam for a spot light. The usual transparent cone cuts the wall and floor with a hard line; this one marches
through the cone against the scene's depth, so it thins out where it meets a surface.

| Plain cone | SpotBeam |
| --- | --- |
| [![plain cone](assets/spot-beam-cone.jpg)](https://burakturan.github.io/threejs-extras/spot-beam/) | [![spot-beam](assets/spot-beam.jpg)](https://burakturan.github.io/threejs-extras/spot-beam/) |

## Run locally

```bash
pnpm install
pnpm dev
```

MIT licensed.
