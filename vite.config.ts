import { defineConfig } from '@lovable.dev/vite-tanstack-config';

export default defineConfig({
  // Local-only: remote-browser WS is served from the same origin in production by Caddy.
  server: { proxy: {
    '/browser/ws': { target: 'http://127.0.0.1:8787', ws: true },
  } },
});
