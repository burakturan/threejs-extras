# threejs-extras

Small, focused fixes for things three.js leaves to you. Each one is a separate package with a demo that shows the
difference it makes, measured.

![light-slots demo](assets/light-slots.png)

| Package | What it does |
| --- | --- |
| [`@threejs-extras/light-slots`](packages/light-slots) | Adding or removing a lamp no longer recompiles every shader and freezes the view. |

## Demo

**Live:** https://burakturan.github.io/threejs-extras/

Or run it locally:

```bash
pnpm install
pnpm dev
```

Open the page, press **Add lamp** a few times, then tick **Use LightSlots** and do it again.

More coming.

## License

MIT
