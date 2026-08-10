/**
 * routes/locationRoutes.js -- the URL map for /api/locations.
 *
 * Mounted in app.js as:
 *     app.use('/api/locations', locationRoutes)
 * so '/cities' below means '/api/locations/cities'.
 *
 * THE SHAPE OF THESE URLS MIRRORS THE DATA.
 * Areas are nested under their city -- /cities/1/areas -- because an
 * area cannot exist without one, and the URL says so. Colleges are
 * NOT nested under an area, even though they belong to one, because
 * they are legitimately fetched two different ways (by area during
 * the normal flow, by city when the area step is skipped). A nested
 * /areas/7/colleges could only ever express the first.
 *
 * ROUTE ORDER: '/colleges' is registered before '/colleges/:id' for
 * the same reason itemRoutes puts '/mine' above '/:id' -- a wildcard
 * segment will happily match a literal word. Here the two cannot
 * actually collide (one has a trailing segment and the other does
 * not), but keeping specific-before-dynamic as a habit is what stops
 * the case that does collide from ever being written.
 *
 * ALL PUBLIC. See the note at the top of locationController.js: you
 * should not need an account to find out whether anyone near you is
 * giving anything away.
 */

const express = require('express')
const {
  getCities,
  getAreas,
  getColleges,
  getCollegeById,
} = require('../controllers/locationController')

const router = express.Router()

/* Step 1 -- which cities exist. */
router.get('/cities', getCities)

/* Step 2 -- the localities inside one city. */
router.get('/cities/:id/areas', getAreas)

/* Step 3 -- the colleges, filtered by ?area= or ?city=. */
router.get('/colleges', getColleges)

/* One college, resolved to its area and city. For deep links that
   arrive with an id and no picker state. */
router.get('/colleges/:id', getCollegeById)

module.exports = router
