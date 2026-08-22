/**
 * services/locationService.js -- the city / area / college directory.
 *
 * WHAT IS THIS FILE?
 * Named functions for the four /api/locations endpoints, plus the one
 * call that saves a college onto the logged-in user. Same job as
 * itemService.js: components ask for "the areas of Jaipur", not for
 * "GET /api/locations/cities/1/areas", and the { success, data }
 * envelope is unwrapped exactly once, here.
 *
 * >>> WHY THREE SEPARATE REQUESTS INSTEAD OF ONE BIG TREE? <<<
 * The whole directory could be returned as one nested object -- cities
 * containing areas containing colleges -- and then the picker would
 * need no further requests at all. We do not, for one reason that
 * matters more the more the project succeeds:
 *
 *   The tree is O(everything). Three cities is nothing; three hundred
 *   cities with twenty areas each is a payload every visitor
 *   downloads in full to read three lines of it.
 *
 * Fetching one level at a time means each request is bounded by what
 * the user actually chose. It costs two extra round trips on the happy
 * path, both of which happen while the user is reading the list they
 * were just given.
 */

import { api } from './api.js'

/**
 * Every city, alphabetically, each with a college_count.
 *
 * The `?? []` guards the same crash as in itemService: if the backend
 * ever answered { success: true } with no data key, `.map()` on
 * undefined would blank the page. An empty list renders "no cities"
 * instead -- wrong, but legible.
 */
async function getCities({ signal } = {}) {
  const response = await api.get('/locations/cities', { signal })
  return response.data ?? []
}

/**
 * The areas of one city.
 *
 * Throws ApiError with status 404 if the city does not exist, which
 * is a real case rather than a theoretical one: a saved location in
 * localStorage outlives the database it was chosen from, so a
 * bookmarked or re-seeded id can absolutely arrive here. The picker
 * catches that and clears the stale selection.
 */
async function getAreas(cityId, { signal } = {}) {
  const response = await api.get(`/locations/cities/${cityId}/areas`, { signal })
  return response.data ?? []
}

/**
 * Colleges, optionally narrowed to an area or a whole city.
 *
 * Both filters are optional and the backend applies the narrower one,
 * so passing neither is a legitimate "show me everywhere" query --
 * which is what the picker uses to resolve a saved college on a cold
 * page load, before any city has been chosen.
 *
 * Empty values are dropped rather than sent as `?area=`. The backend
 * treats an empty parameter as absent, so this is belt-and-braces --
 * but it keeps the URLs in the network tab readable, which is worth
 * something when debugging why a filter did not apply.
 */
async function getColleges({ areaId, cityId, signal } = {}) {
  const query = new URLSearchParams()
  if (areaId) query.set('area', areaId)
  if (cityId) query.set('city', cityId)

  const suffix = query.toString() ? `?${query}` : ''
  const response = await api.get(`/locations/colleges${suffix}`, { signal })
  return response.data ?? []
}

/**
 * One college, resolved all the way up to its state.
 *
 * This exists for the shared-link case: /?college=4 arrives with no
 * picker state at all, and the page must be able to print "SKIT
 * Jaipur, Jagatpura" rather than the number 4.
 */
async function getCollege(collegeId, { signal } = {}) {
  const response = await api.get(`/locations/colleges/${collegeId}`, { signal })
  return response.data
}

/**
 * Saves the logged-in user's college. Pass null to clear it.
 *
 * Returns the updated user, re-read by the server after the write and
 * including the resolved college_name / area_name / city_name -- so the
 * caller can put it straight into auth state without a second request.
 *
 * WHO IS "ME"? The server takes the user id from the verified token
 * signature and ignores anything in the body. There is deliberately no
 * userId parameter here, because there is nowhere to send one.
 */
async function saveMyCollege(collegeId, { signal } = {}) {
  const response = await api.put('/users/me/college', { collegeId }, { signal })
  // The updated user arrives under data.user now, the same envelope the
  // auth routes use. The value returned to callers is unchanged.
  return response.data.user
}

export const locationService = {
  getCities,
  getAreas,
  getColleges,
  getCollege,
  saveMyCollege,
}
