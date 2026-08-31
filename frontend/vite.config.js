import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/* React calls relative paths (`/api/items`), which the browser sees as
   same-origin on :5173 -- so no CORS check happens -- and Vite forwards them to
   the backend. The same relative paths work in production behind nginx, so no
   host is hardcoded anywhere in the app.

   Set VITE_API_URL to forward to a backend on someone else's machine instead of
   localhost. Then a frontend developer needs no backend, database or Redis. */

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // NOT 8080 for the backend: Jenkins owns 8080 on the dev machine.
  const target = env.VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [react()],

    server: {
      port: 5173,
      // Fail loudly rather than sliding to 5174, which would silently fall
      // outside the backend's CORS allow-list.
      strictPort: true,

      proxy: {
        '/api': { target, changeOrigin: true, secure: false },
        // Uploaded photos are written and served by the backend, so they need
        // forwarding too -- otherwise every upload 404s.
        '/uploads': { target, changeOrigin: true, secure: false },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})
