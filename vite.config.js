// vite.config.js — build 1772881715
import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Recursively copy src dir into dest dir, skipping entries in the exclude list
function copyDir(src, dest, exclude = []) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (exclude.includes(entry)) continue;
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
      // Exclude 'video' — Rollup already emits hashed copies to dist/assets/
      copyDir('assets', 'dist/assets', ['video']);
      // Tile spritesheet + manifest
      if (existsSync('public/tiles')) {
        copyDir('public/tiles', 'dist/tiles');
      }
      // E5-A: copy Game-Icons SVGs to dist/icons/
      if (existsSync('public/icons')) {
        copyDir('public/icons', 'dist/icons');
      }
      // Canva-generated UI assets (HUD bar bg, slot frame, ornaments)
      if (existsSync('public/assets/ui')) {
        copyDir('public/assets/ui', 'dist/assets/ui');
      }
      // Canva-generated icon PNGs (emoji replacements)
      if (existsSync('public/assets/icons')) {
        copyDir('public/assets/icons', 'dist/assets/icons');
      }
    }
  };
}

export default defineConfig({
  // Serve public/ in dev (icons, tiles, ui assets). Build-time copying
  // is still handled by copyStaticAssets() for the production dist.
  publicDir: 'public',

  plugins: [copyStaticAssets()],

  build: {
    outDir: 'dist',
    rollupOptions: {
      external: (id) => id.startsWith('https://'),
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'vendor-firebase';
          if (id.includes('node_modules/pixi') || id.includes('node_modules/@pixi')) return 'vendor-pixi';
          if (id.includes('node_modules/rot-js') || id.includes('node_modules/easystarjs')) return 'vendor-map';
          if (id.includes('node_modules/@babylonjs') || id.includes('node_modules/babylonjs')) return 'vendor-babylon';
        },
      },
    },
  },
});
// credits build 1772883977
