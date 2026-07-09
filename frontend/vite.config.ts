import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Serve the shared brand assets folder (repo-root /assets) as static files,
  // so logo.png / logo-white.png are reachable at /logo.png. Falls back to the
  // wordmark in <Logo/> until those files are dropped in.
  publicDir: '../assets',
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../assets', import.meta.url)),
      ],
    },
    // Honor an injected PORT (used by the preview tooling); default to Vite's 5173.
    port: Number(process.env.PORT) || 5173,
  },
})
