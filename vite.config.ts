import { defineConfig } from 'vite'

/* GitHub Pages serves the demo under /threejs-extras/; locally it stays at the root. */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/threejs-extras/' : '/',
}))
