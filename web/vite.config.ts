import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../internal/static/files',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5090',
      '/ws': { target: 'http://localhost:5090', ws: true },
    },
  },
})
