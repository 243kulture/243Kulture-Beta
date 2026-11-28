import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 5174,
    strictPort: true,
  },
})
