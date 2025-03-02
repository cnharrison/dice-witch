import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    'import.meta.env.VITE_API_PROXY_TARGET': JSON.stringify(process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000')
  },
  server: {
    port: parseInt(process.env.VITE_PORT || "5173"),
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    },
  },
})
