import { defineConfig } from 'vite'

/* GitHub Pages serves the demos under /threejs-extras/; locally they stay at the root. */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/threejs-extras/' : '/',
  build: {
    rollupOptions: {
      input: ['index.html', 'light-slots/index.html', 'spot-beam/index.html'],
    },
  },
}))
