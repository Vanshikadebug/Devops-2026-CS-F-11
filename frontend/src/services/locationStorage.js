/**
 * services/locationStorage.js -- remembers where the user is browsing.
 *
 * WHAT IS THIS FILE?
 * Read/write/clear over one localStorage key holding the chosen
 * { cityId, areaId, collegeId }. Same shape and the same reasons as
 * tokenStorage.js: two different places need this value and must never
 * disagree about where it lives.
 *
 * WHY PERSIST IT AT ALL?
 * Because the alternative is asking every visitor to pick their city,
 * their area and their college again on every single page load. The
 * selection is the price of admission to the item grid, so making them
 * pay it repeatedly is the fastest way to make the feature feel
 * broken. Choosing SKIT once should be the last time anyone thinks
 * about it.
 *
 * =================================================================
 * WHY THIS IS NOT IN THE USER RECORD -- AND WHY IT IS NOT *ONLY* HERE
 * =================================================================
 * There are two separate facts that look like one:
 *
 *   users.college_id  = "this is my campus."  A profile field. Durable,
 *                       server-side, survives a new laptop, and the
 *                       thing a future "items near you" email would
 *                       use. Requires an account.
 *
 *   this localStorage = "this is what I am looking at right now."
 *                       A view preference. Works for someone who has
 *                       not signed up, which is most first visits to a
 *                       site like this, and changes freely while
 *                       browsing without editing anyone's profile.
 *
 * Keeping only the profile field would lock the whole browse flow
 * behind registration. Keeping only local state would mean a logged-in
 * user's own campus is forgotten by their phone. So: the profile
 * seeds the default, and local storage records where they actually
 * went. `saveMyCollege` in locationService.js is what promotes a
 * browsing choice into a profile fact, and only a signed-in user
 * making a deliberate choice triggers it.
 *
 * =================================================================
 * WHY THE SHAPE IS VALIDATED ON THE WAY OUT
 * =================================================================
 * Anything in localStorage is user-editable and outlives the code that
 * wrote it. Three things genuinely happen:
 *
 *   - the JSON is corrupt, or is not JSON at all
 *   - it is valid JSON of an older shape, from a previous version
 *   - the ids are fine but the rows are gone, after a db:reset
 *
 * The first two are handled here by returning null for anything that
 * is not a positive-integer id. The third cannot be detected without
 * asking the server, so it is handled where the answer arrives: the
 * picker clears the selection when the API 404s. Trusting this value
 * blindly would mean one stale id renders an empty grid with a
 * confident heading naming a college that no longer exists.
 */

const KEY = 'reusehub.location'

/** Positive integers only -- ids, or nothing. Rejects 0, "3", -1, null. */
function asId(value) {
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * The saved selection, always as a complete object with null holes.
 *
 * Returning a consistent shape rather than sometimes-null means
 * callers can destructure it without a guard, and a partial selection
 * (a city chosen, no college yet) is representable -- which it must
 * be, because that is the state the user is in halfway through the
 * picker.
 */
export function getSavedLocation() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { cityId: null, areaId: null, collegeId: null }

    const parsed = JSON.parse(raw)
    return {
      cityId: asId(parsed?.cityId),
      areaId: asId(parsed?.areaId),
      collegeId: asId(parsed?.collegeId),
    }
  } catch {
    /* Corrupt JSON, or localStorage itself throwing -- Safari private
       browsing and a blocked-site-data setting both do. Falling back
       to "nothing chosen" costs the user one selection; letting this
       throw during the first render would blank the whole app. */
    return { cityId: null, areaId: null, collegeId: null }
  }
}

export function saveLocation({ cityId, areaId, collegeId }) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        cityId: asId(cityId),
        areaId: asId(areaId),
        collegeId: asId(collegeId),
      }),
    )
  } catch {
    // The choice will not survive a refresh. Not worth breaking the
    // page over: it still holds for this visit, in React state.
  }
}

export function clearSavedLocation() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing useful to do here.
  }
}
