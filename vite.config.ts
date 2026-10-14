import { defineConfig } from '@lovable.dev/vite-tanstack-config';

// Local development: proxy the authenticated same-origin browser WebSocket.
// Production uses the reverse proxy in deploy/browser/nginx.conf instead.
export default defineConfig({
  server: {
    proxy: {
      '/browser/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
