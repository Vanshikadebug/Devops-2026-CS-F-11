/**
 * Where the backend lives.
 *
 * Blank (the default) means same-origin: the Vite dev proxy forwards /api and
 * /uploads to localhost:5000, and in production nginx does the same. That is
 * the setup for anyone running the whole stack.
 *
 * Set VITE_API_URL in frontend/.env to point at a backend running somewhere
 * else — a teammate's tunnel, a staging box — and work on the frontend without
 * running a backend, a database or Redis at all.
 *
 *   VITE_API_URL=https://reusehub-api.trycloudflare.com
 *
 * Read at build time, not runtime: Vite inlines import.meta.env, so changing it
 * needs a dev-server restart.
 */

// Trailing slashes are stripped so `${ORIGIN}/api` never becomes `//api`.
export const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

/** Base for API calls. */
export const API_BASE = `${API_ORIGIN}/api`

/**
 * Resolves a stored asset path for display.
 *
 * Uploaded photos are stored as root-relative paths (`/uploads/ab12.png`)
 * because the backend that wrote them also serves them. With a remote backend
 * those paths would resolve against the *frontend* origin and 404, so they need
 * the API origin prepended. Absolute URLs and bundled art under /images are
 * left alone.
 */
export function assetUrl(path) {
  if (!path) return path
  if (/^(https?:)?\/\/|^data:|^blob:/i.test(path)) return path
  if (path.startsWith('/uploads/')) return `${API_ORIGIN}${path}`
  return path
}
