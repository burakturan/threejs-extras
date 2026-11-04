# threejs-extras

I'm building a 3D editor for galleries and museums in three.js, and every so often I hit something three.js leaves
for you to figure out. When the fix turns out small and general enough, it goes here as its own package, with a demo
that shows the before and after.

![spot-beam demo](assets/spot-beam.jpg)

- [`@threejs-extras/light-slots`](packages/light-slots): adding or removing a lamp no longer recompiles every lit
  shader and freezes the view.
- [`@threejs-extras/spot-beam`](packages/spot-beam): a visible spot light beam that fades into the wall and floor
  instead of cutting them with a hard line.

## Try it

The [demos](https://burakturan.github.io/threejs-extras/) run in the browser. Or locally:

```bash
pnpm install
pnpm dev
```

MIT licensed.
