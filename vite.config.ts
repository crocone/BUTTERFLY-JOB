import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any static host path.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 0,
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
