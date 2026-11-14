import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  main: { build: { externalizeDeps: true } },
  preload: { build: { rollupOptions: { output: { format: 'cjs' } } } },
  renderer: { plugins: [vue()] }
})
