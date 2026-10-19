import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = 'http://127.0.0.1:8096'

const proxy = {
  '/api': backend,
  '/media': backend,
  '/__mock': backend,
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy,
  },
  preview: {
    host: true,
    port: 4173,
    proxy,
  },
})
