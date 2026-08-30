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
