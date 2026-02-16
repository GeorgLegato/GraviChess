import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/GraviChess/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
  server: {
    open: true,
  },
});
