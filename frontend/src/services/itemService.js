/**
 * services/itemService.js -- item endpoints, named.
 *
 * WHY A SECOND LAYER ON TOP OF api.js?
 * api.js knows HTTP. This file knows ReuseHub. A component calls
 *
 *     itemService.getAll()
 *
 * and does not need to know the URL, the method, or that the rows
 * arrive wrapped in a { success, count, data } envelope. Two things
 * follow from that:
 *
 *  1. THE URL EXISTS IN ONE PLACE. When Phase 9 adds query strings
 *     for search and filters, that logic lands here and no page
 *     changes.
 *  2. THE ENVELOPE IS UNWRAPPED ONCE. Pages receive a plain array.
 *     Without this, every page would repeat `response.data` and would
 *     all break together if the envelope ever changed.
 *
 * This mirrors the backend's model layer: one file per resource,
 * holding all the knowledge about that resource's endpoints.
 */

import { api } from './api.js'

/**
 * Every item, newest first.
 * Returns a plain array -- the envelope is unwrapped here.
 *
 * The `?? []` is a small but real safeguard. If the backend ever
 * answered { success: true } with no data key, `.map()` on undefined
 * would crash the page with "Cannot read properties of undefined".
 * An empty array renders the empty state instead: wrong, but not
 * broken.
 */
async function getAll({ signal } = {}) {
  const response = await api.get('/items', { signal })
  return response.data ?? []
}

/** One item by id. Throws ApiError with status 404 if absent. */
async function getById(id, { signal } = {}) {
  const response = await api.get(`/items/${id}`, { signal })
  return response.data
}

export const itemService = { getAll, getById }
