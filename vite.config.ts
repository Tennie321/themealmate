import { defineConfig } from '@lovable.dev/vite-tanstack-config';

export default defineConfig({
  server: {
    proxy: {
      '/remote-browser': {
        target: 'http://127.0.0.1:8787',
        ws: true,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/remote-browser/, ''),
      },
    },
  },
});
