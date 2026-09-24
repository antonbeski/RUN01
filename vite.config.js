import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Relative base path ensures deployment works seamlessly on GitHub Pages subpaths
  // (e.g. https://<user>.github.io/<repo>/) and Cloudflare Pages custom domains.
  base: './',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    headers: {
      // Required for SharedArrayBuffer / multi-threaded WebAssembly in ONNX Runtime Web
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
