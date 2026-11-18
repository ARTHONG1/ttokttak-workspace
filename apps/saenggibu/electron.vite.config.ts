import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

// 똑딱생기부 builds on its own: nothing here imports from the 똑딱작업실 apps or packages.
export default defineConfig({
  main: {
    // driven at run time from the packaged node_modules (the NEIS browser)
    build: { rollupOptions: { external: ['playwright-core'] } },
  },
  preload: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
    server: {
      port: Number(process.env.SAENGGIBU_DEV_PORT) || 5277,
      strictPort: Boolean(process.env.SAENGGIBU_DEV_PORT),
    },
  },
})
