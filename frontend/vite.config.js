import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3101,
    proxy: {
      '/api': 'http://localhost:3100',
      '/socket.io': {
        target: 'http://localhost:3100',
        ws: true
      }
    }
  }
})
