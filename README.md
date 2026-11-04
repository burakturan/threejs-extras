# threejs-extras

I'm building a 3D editor for galleries and museums in three.js, and every so often I hit something three.js leaves
for you to figure out. When the fix turns out small and general enough, it goes here as its own package, with a demo
that shows the before and after.

![light-slots demo](assets/light-slots.png)

So far there's one:

- [`@threejs-extras/light-slots`](packages/light-slots): adding or removing a lamp no longer recompiles every lit
  shader and freezes the view.

## Try it

[Live demo](https://burakturan.github.io/threejs-extras/). Press Add lamp a few times and watch the frame time, then
tick Use LightSlots (it reloads the page) and do the same.

Or locally:

```bash
pnpm install
pnpm dev
```

MIT licensed.
