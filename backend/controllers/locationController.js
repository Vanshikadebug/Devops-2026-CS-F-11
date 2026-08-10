/**
 * controllers/locationController.js -- HTTP for the location picker.
 *
 * Three endpoints, one per step of the browse flow:
 *
 *     GET /api/locations/cities
 *     GET /api/locations/cities/:id/areas
 *     GET /api/locations/colleges?area=7   (or ?city=1)
 *
 * ALL THREE ARE PUBLIC, deliberately. Choosing a city and seeing
 * which colleges exist is the step BEFORE deciding whether this site
 * is worth registering for. Putting a login in front of it would
 * mean creating an account to find out whether anything near you is
 * being given away.
 *
 * WHY NOT ONE ENDPOINT RETURNING THE WHOLE TREE?
 * A single /api/locations returning every city with its areas and
 * colleges nested inside would work today, with 9 colleges. It stops
 * working at the size where this feature matters: a national list is
 * hundreds of kilobytes shipped to draw one dropdown with three
 * entries in it. Fetching each level as it is chosen keeps every
 * response proportional to what is actually on screen.
 *
 * WHY :id AND NOT :slug?
 * Both are unique. Ids are what the items table stores, so filtering
 * by id is a direct integer comparison, while a slug would need a
 * lookup first. The slug is still returned in every payload, ready
 * for a future /browse/jaipur/jagatpura route.
 */

const locationModel = require('../models/locationModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/* ---------------------------------------------------------------
   Shared id parsing.
   ---------------------------------------------------------------
   A URL parameter or query string is ALWAYS a string, and a person
   can type anything into it. Left unchecked, '/cities/abc/areas'
   reaches MySQL as 'abc', which MySQL coerces to 0, matches nothing,
   and returns an empty list -- so a malformed request would look
   exactly like a real city that happens to have no areas.

   Answering 400 instead is both more truthful and more useful: the
   caller learns their request was wrong rather than concluding the
   database is empty.

   Returns null for anything that is not a positive whole number, so
   callers can decide between "reject" and "ignore this filter".
--------------------------------------------------------------- */
function parseId(value) {
  if (value === undefined || value === null || value === '') return null

  const n = Number(value)
  // Number('') is 0 and Number(' 3 ') is 3, so the empty case is
  // handled above. isInteger rejects '1.5' and 'abc' (NaN).
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * GET /api/locations/cities -- step 1 of the picker.
 */
const getCities = asyncHandler(async (req, res) => {
  const cities = await locationModel.findCities()

  res.status(200).json({
    success: true,
    count: cities.length,
    data: cities,
  })
})

/**
 * GET /api/locations/cities/:id/areas -- step 2.
 *
 * >>> WHY THIS CHECKS THE CITY EXISTS FIRST <<<
 * Without the check, an unknown city id returns `[]` with a 200 --
 * "this city has no areas". That is a lie, and it is the kind of lie
 * that costs an afternoon: the dropdown renders empty, the frontend
 * looks broken, and the actual cause (a stale bookmark pointing at a
 * city id that no longer exists after a reseed) is invisible.
 *
 * One extra indexed primary-key lookup buys an honest 404.
 */
const getAreas = asyncHandler(async (req, res) => {
  const cityId = parseId(req.params.id)

  if (!cityId) {
    throw ApiError.badRequest('City id must be a positive whole number')
  }

  const city = await locationModel.findCityById(cityId)

  if (!city) {
    throw ApiError.notFound(`No city found with id ${cityId}`)
  }

  const areas = await locationModel.findAreas(cityId)

  // The city is echoed back so the page can title itself
  // "Areas in Jaipur" without a second request.
  res.status(200).json({
    success: true,
    count: areas.length,
    city,
    data: areas,
  })
})

/**
 * GET /api/locations/colleges?area=7  |  ?city=1  |  (neither)
 *
 * With `area`   -> the colleges in that locality (the normal step 3).
 * With `city`   -> every college in the city, for skipping the area.
 * With neither  -> the whole directory. Small today, and honest: the
 *                  alternative is a 400 that would force the UI to
 *                  special-case a state it can legitimately be in on
 *                  first render.
 *
 * A filter that is present but unparseable is REJECTED, not ignored.
 * Silently dropping `?area=abc` would answer with every college in
 * the country while the heading still said "Colleges in Jagatpura" --
 * wrong data under a correct-looking label, which is the worst
 * failure mode available.
 */
const getColleges = asyncHandler(async (req, res) => {
  const filters = {}

  for (const [key, param] of [['areaId', 'area'], ['cityId', 'city']]) {
    if (req.query[param] !== undefined && req.query[param] !== '') {
      const id = parseId(req.query[param])
      if (!id) {
        throw ApiError.badRequest(`${param} must be a positive whole number`)
      }
      filters[key] = id
    }
  }

  const colleges = await locationModel.findColleges(filters)

  res.status(200).json({
    success: true,
    count: colleges.length,
    data: colleges,
  })
})

/**
 * GET /api/locations/colleges/:id -- one college, fully resolved.
 *
 * Exists for the shared-link case: someone opens
 * /?college=4 with no picker state, and the page needs to print
 * "SKIT Jaipur — Jagatpura, Jaipur" rather than "college 4".
 */
const getCollegeById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)

  if (!id) {
    throw ApiError.badRequest('College id must be a positive whole number')
  }

  const college = await locationModel.findCollegeById(id)

  if (!college) {
    throw ApiError.notFound(`No college found with id ${id}`)
  }

  res.status(200).json({ success: true, data: college })
})

module.exports = { getCities, getAreas, getColleges, getCollegeById, parseId }
