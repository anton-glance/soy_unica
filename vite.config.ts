import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 3000 and 3100 are taken on the store's machines; the kiosk runs on 5180
// and proxies every /api call to the local Worker on 8790.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8790',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
