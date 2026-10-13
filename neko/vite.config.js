import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 8717,
    strictPort: false,
  },
  preview: {
    port: 8717,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
})
