const locationModel = require('../models/locationModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

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

  res.status(200).json({
    success: true,
    count: areas.length,
    data: areas,
  })
})

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
