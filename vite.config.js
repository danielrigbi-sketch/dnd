import { defineConfig } from 'vite';

export default defineConfig({
  // Keep assets/ as the static public directory so audio/images are
  // served at /assets/ in both dev and the dist build.
  publicDir: 'assets',

  build: {
    outDir: 'dist',
    rollupOptions: {
      // dice-box loads its own web workers from the CDN at runtime —
      // mark all https:// imports as external so Rollup leaves them as
      // native browser URL imports in the bundle.
      external: (id) => id.startsWith('https://'),
    },
  },
});
