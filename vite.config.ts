import { defineConfig } from '@lovable.dev/vite-tanstack-config';

// Local-only proxy for the separately deployed remote browser container.
// Production requires a TLS WebSocket reverse proxy or VITE_BROWSER_BRIDGE_URL.
export default defineConfig({
  server: {
    proxy: {
      '/browser-api': { target: 'http://127.0.0.1:8787', ws: true, changeOrigin: false },
    },
  },
});
