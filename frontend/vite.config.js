import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// ---------------------------------------------------------------
// Vite configuration for the ReuseHub frontend.
//
// THE IMPORTANT PART IS THE PROXY.
//
// The browser enforces the "same-origin policy": a page loaded from
// http://localhost:5173 is not normally allowed to call an API on
// http://localhost:5000, because the port differs. That is a
// different origin, and the browser blocks it (a CORS error).
//
// The proxy sidesteps this. Our React code calls a RELATIVE path:
//
//     fetch('/api/items')
//
// The browser sees /api/items on localhost:5173 -- the SAME origin,
// so no CORS check happens at all. Vite's dev server then quietly
// forwards that request to http://localhost:5000/api/items.
//
// Why this matters beyond convenience:
//   - No hard-coded "http://localhost:5000" scattered in the code.
//   - In production the frontend is served by nginx, which does the
//     same forwarding. So the SAME relative URLs work in dev, in
//     Docker, and in production, with zero code changes.
// ---------------------------------------------------------------
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  /* With VITE_API_URL set, api.js calls that origin directly and the proxy is
     never used -- so it is only configured for the same-origin default. */
  const target = env.VITE_API_URL || 'http://localhost:5000'

  return {
  plugins: [react()],

  server: {
    port: 5173,
    // Fail loudly instead of silently sliding to 5174 if 5173 is
    // taken. A surprise port change would break the backend's CORS
    // allow-list and cost you 20 minutes of confused debugging.
    strictPort: true,

    proxy: {
      // NOT 8080 for the backend: Jenkins owns 8080 on this machine.
      '/api': { target, changeOrigin: true },
      // Uploaded listing photos are written and served by the API, so they
      // need forwarding too -- otherwise every upload 404s in development.
      '/uploads': { target, changeOrigin: true },
    },
  },

  build: {
    // `npm run build` writes the static site here. Docker (Phase 13)
    // copies this folder into an nginx image.
    outDir: 'dist',
    sourcemap: true,
  },
  }
})
