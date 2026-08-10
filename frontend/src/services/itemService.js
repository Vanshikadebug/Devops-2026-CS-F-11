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
 * Items, optionally filtered.
 * Returns a plain array -- the envelope is unwrapped here.
 *
 * Accepts { college, area, city, search, category, condition, status,
 * sort, limit }. Every one is optional; passing none returns
 * everything, newest first, exactly as this function did before
 * filtering existed.
 *
 * >>> WHY EMPTY VALUES ARE DROPPED RATHER THAN SENT <<<
 * A UI that keeps its filter state in one object sends the whole
 * object on every request, so an untouched dropdown arrives here as
 * '' and an unchosen college as null. Sending those verbatim would
 * produce `?category=&college=null` -- and `college=null` is not
 * empty, it is the four-character string "null", which the backend
 * correctly rejects as not-a-number. The page would answer 400 the
 * moment someone typed in the search box before choosing a campus.
 *
 * Dropping them here means every caller can pass its state object
 * directly and never think about it. URLSearchParams also does the
 * percent-encoding, so a search for "50% off" cannot break the URL.
 *
 * The `?? []` is a small but real safeguard. If the backend ever
 * answered { success: true } with no data key, `.map()` on undefined
 * would crash the page with "Cannot read properties of undefined".
 * An empty array renders the empty state instead: wrong, but not
 * broken.
 */
async function getAll(filters = {}, { signal } = {}) {
  const query = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, value)
  })

  const suffix = query.toString() ? `?${query}` : ''
  const response = await api.get(`/items${suffix}`, { signal })
  return response.data ?? []
}

/** One item by id. Throws ApiError with status 404 if absent. */
async function getById(id, { signal } = {}) {
  const response = await api.get(`/items/${id}`, { signal })
  return response.data
}

export const itemService = { getAll, getById }
