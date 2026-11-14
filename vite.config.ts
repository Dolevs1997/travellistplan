import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre's worker is bundled separately (see src/maplibreSetup.ts) and is an ES module.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1600 },
})
