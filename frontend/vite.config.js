import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Auth server on :8001
      '/api/auth':    { target: 'http://localhost:8001', changeOrigin: true },
      // Course engine on :8000
      '/api/courses': { target: 'http://localhost:8000', changeOrigin: true },
      '/api/course':  { target: 'http://localhost:8000', changeOrigin: true },
      '/api/generate':{ target: 'http://localhost:8000', changeOrigin: true },
      '/api/status':  { target: 'http://localhost:8000', changeOrigin: true },
      '/api/get_syllabus': { target: 'http://localhost:8000', changeOrigin: true },
      '/api/student':      { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
