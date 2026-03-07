// vite.config.js — build 1772881715
import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Recursively copy src dir into dest dir
function copyDir(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath  = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Plugin: copy the assets/ folder into dist/assets/ after build
function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      copyDir('assets', 'dist/assets');
      // Tile spritesheet + manifest
      if (existsSync('public/tiles')) {
        copyDir('public/tiles', 'dist/tiles');
      }
      // E5-A: copy Game-Icons SVGs to dist/icons/
      if (existsSync('public/icons')) {
        copyDir('public/icons', 'dist/icons');
      }
    }
  };
}

export default defineConfig({
  // Disable Vite's built-in publicDir — we handle asset copying ourselves
  publicDir: false,

  plugins: [copyStaticAssets()],

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
// credits build 1772883977
