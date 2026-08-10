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

/** The signed-in user's own items. GET /api/items/mine. */
async function getMine(filters = {}, { signal } = {}) {
  const query = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, value)
  })

  const suffix = query.toString() ? `?${query}` : ''
  const response = await api.get(`/items/mine${suffix}`, { signal })
  return response.data ?? []
}

/* ===============================================================
   THE WRITE HALF -- added in Phase 8
   ===============================================================
   >>> WHAT THESE FUNCTIONS DELIBERATELY DO NOT SEND <<<
   There is no `userId` field anywhere below. Not because the
   backend would reject it -- it ignores it -- but because a
   frontend that sends an owner id teaches everyone reading this
   code that the owner is the client's to state. It is not. The
   server takes it from the token signature, and the request has
   nowhere to put an alternative.
   Nor is there a token here. api.js attaches the Authorization
   header to every request from tokenStorage, so a service never
   handles credentials; see the note at the top of that file.
=============================================================== */

/**
 * Turns the form's state into the body the API accepts.
 *
 * >>> WHY THE FORM'S SHAPE AND THE API'S SHAPE ARE NOT THE SAME <<<
 * The form holds a whole LocationPicker selection --
 * { cityId, areaId, collegeId } -- because the picker needs all
 * three to render its cascading dropdowns. The API wants only
 * `collegeId`: city and area are derivable from it (the server
 * looks them up and builds the location text itself, see
 * resolvePlace in itemController.js).
 *
 * Sending cityId and areaId anyway would be harmless today and
 * wrong in principle -- they are two more values that could
 * disagree with the college, in a request where the server has
 * already decided not to trust them. The translation happens here,
 * once, rather than in each of the two pages that submit items.
 */
function toRequestBody(form) {
  return {
    name: form.name,
    description: form.description,
    category: form.category,
    condition: form.condition,
    /* `?? null` and not `|| null`: both give null for an unchosen
       college, but || would also swallow a legitimate 0 if ids ever
       started there. The habit is what matters more than this case. */
    collegeId: form.collegeId ?? null,
    /* Sent only when there is no college. When there IS one the
       server derives the text and discards whatever arrives here --
       so sending the stale contents of a text box the user has
       since stopped using would be sending a value we know is
       ignored, which reads as a bug to the next person. */
    location: form.collegeId ? '' : form.location ?? '',
    imageUrl: form.imageUrl ?? '',
    status: form.status || 'Available',
  }
}

/**
 * POST /api/items -- list a new item. Returns the created row.
 *
 * The returned object is the item as STORED, not as submitted: its
 * `location` is the text the server derived, and it carries the id,
 * created_at and owner_name the form never knew. Callers use it
 * rather than their own form state for exactly that reason -- see
 * the redirect in ItemForm.
 */
async function create(form) {
  const response = await api.post('/items', toRequestBody(form))
  return response.data
}

/** PUT /api/items/:id -- full replacement. 403 if not yours. */
async function update(id, form) {
  const response = await api.put(`/items/${id}`, toRequestBody(form))
  return response.data
}

/**
 * PATCH /api/items/:id/status -- one field, one click.
 *
 * Separate from update() because the caller is a button on a card
 * that holds a summary row, not the full item. Routing this through
 * PUT would mean a list page had to know every field of every item
 * just to toggle an enum -- and would make an accidental blanking
 * of the description possible from a control that has nothing to do
 * with it.
 */
async function updateStatus(id, status) {
  const response = await api.patch(`/items/${id}/status`, { status })
  return response.data
}

/**
 * DELETE /api/items/:id.
 *
 * >>> THIS ALSO REMOVES EVERY REQUEST FOR THE ITEM <<<
 * requests.item_id carries ON DELETE CASCADE in schema.sql, so
 * other users' pending requests disappear with it. That is the
 * right outcome -- a request to collect something that no longer
 * exists is not actionable -- but it is a consequence the caller
 * cannot see in this function name, which is why MyItems confirms
 * in a modal before calling it.
 */
async function remove(id) {
  await api.del(`/items/${id}`)
  return true
}

export const itemService = {
  getAll,
  getById,
  getMine,
  create,
  update,
  updateStatus,
  remove,
}
