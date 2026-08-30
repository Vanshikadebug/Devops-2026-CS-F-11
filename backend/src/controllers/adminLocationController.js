const locationModel = require('../models/locationModel')
const auditModel = require('../models/auditModel')
const cache = require('../lib/cache')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')
const { resolvePagination, paginationMeta } = require('../utils/pagination')

function parseId(value, label = 'id') {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.badRequest(`${label} must be a positive whole number`)
  }
  return n
}

function optionalId(value, label) {
  if (value === undefined || value === '') return undefined
  return parseId(value, label)
}

function text(raw, field, { min = 2, max = 100 } = {}) {
  const value = String(raw ?? '').trim()
  if (value.length < min || value.length > max) {
    throw ApiError.badRequest(`${field} must be ${min} to ${max} characters`)
  }
  return value
}

function optionalText(raw, field, max) {
  if (raw === undefined || raw === null) return null
  const value = String(raw).trim()
  if (value === '') return null
  if (value.length > max) throw ApiError.badRequest(`${field} must be at most ${max} characters`)
  return value
}

const confirmed = (req) => req.query.confirm === '1' || req.query.confirm === 'true'

function totalDependants(counts) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

/** 409 naming exactly what a delete would affect, so the admin decides with
    the numbers in front of them. */
function refuseUnconfirmed(kind, name, counts) {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${key}`)
  throw new ApiError(
    409,
    `Deleting ${kind} "${name}" affects ${parts.join(', ')}. ` +
      'Re-send with ?confirm=1 to proceed.',
    { dependants: counts, requiresConfirmation: true },
  )
}

async function audit(req, { action, targetType, targetId, description, changes }) {
  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action,
    targetType,
    targetId,
    description,
    changes,
    ip: req.ip,
  })
  // The public /api/config carries the city list, so any directory write
  // must invalidate it.
  await cache.bustAll()
}

/* --- Cities ------------------------------------------------------------- */

const listCities = asyncHandler(async (req, res) => {
  const cities = await locationModel.listCitiesForAdmin()
  res.status(200).json({ success: true, count: cities.length, data: cities })
})

const createCity = asyncHandler(async (req, res) => {
  const name = text(req.body.name, 'City name')
  const state = text(req.body.state, 'State')

  const city = await locationModel.createCity({ name, state })

  await audit(req, {
    action: 'city.create',
    targetType: 'city',
    targetId: city.id,
    description: `Created city ${city.name}, ${city.state}`,
    changes: { name: city.name, state: city.state },
  })

  res.status(201).json({ success: true, message: 'City created', data: city })
})

const updateCity = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const before = await locationModel.findCityById(id)
  if (!before) throw ApiError.notFound(`No city found with id ${id}`)

  const city = await locationModel.updateCity(id, {
    name: text(req.body.name, 'City name'),
    state: text(req.body.state, 'State'),
  })
  if (!city) throw ApiError.notFound(`No city found with id ${id}`)

  await audit(req, {
    action: 'city.update',
    targetType: 'city',
    targetId: id,
    description: `Updated city ${city.name}`,
    changes: { from: before, to: city },
  })

  res.status(200).json({ success: true, message: 'City updated', data: city })
})

const removeCity = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const city = await locationModel.findCityById(id)
  if (!city) throw ApiError.notFound(`No city found with id ${id}`)

  const counts = await locationModel.cityDependants(id)
  if (totalDependants(counts) > 0 && !confirmed(req)) {
    refuseUnconfirmed('city', city.name, counts)
  }

  await locationModel.removeCity(id)

  await audit(req, {
    action: 'city.delete',
    targetType: 'city',
    targetId: id,
    description: `Deleted city ${city.name} (${JSON.stringify(counts)})`,
    changes: { deleted: city, dependants: counts },
  })

  res.status(200).json({ success: true, message: 'City deleted', data: { id, affected: counts } })
})

/* --- Areas -------------------------------------------------------------- */

const listAreas = asyncHandler(async (req, res) => {
  const areas = await locationModel.listAreasForAdmin({
    cityId: optionalId(req.query.city, 'city'),
  })
  res.status(200).json({ success: true, count: areas.length, data: areas })
})

const createArea = asyncHandler(async (req, res) => {
  const cityId = parseId(req.body.cityId, 'cityId')
  const name = text(req.body.name, 'Area name')

  // Checked before the write so an unknown city is a clear 404 rather than a
  // foreign-key error that names neither the field nor the value.
  if (!(await locationModel.findCityById(cityId))) {
    throw ApiError.notFound(`No city found with id ${cityId}`)
  }

  const area = await locationModel.createArea({ cityId, name })

  await audit(req, {
    action: 'area.create',
    targetType: 'area',
    targetId: area.id,
    description: `Created area ${area.name} in ${area.city_name}`,
    changes: { name: area.name, city_id: cityId },
  })

  res.status(201).json({ success: true, message: 'Area created', data: area })
})

const updateArea = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const before = await locationModel.findAreaById(id)
  if (!before) throw ApiError.notFound(`No area found with id ${id}`)

  const cityId = parseId(req.body.cityId, 'cityId')
  if (!(await locationModel.findCityById(cityId))) {
    throw ApiError.notFound(`No city found with id ${cityId}`)
  }

  const area = await locationModel.updateArea(id, {
    cityId,
    name: text(req.body.name, 'Area name'),
  })
  if (!area) throw ApiError.notFound(`No area found with id ${id}`)

  await audit(req, {
    action: 'area.update',
    targetType: 'area',
    targetId: id,
    description: `Updated area ${area.name}`,
    changes: { from: before, to: area },
  })

  res.status(200).json({ success: true, message: 'Area updated', data: area })
})

const removeArea = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const area = await locationModel.findAreaById(id)
  if (!area) throw ApiError.notFound(`No area found with id ${id}`)

  const counts = await locationModel.areaDependants(id)
  if (totalDependants(counts) > 0 && !confirmed(req)) {
    refuseUnconfirmed('area', area.name, counts)
  }

  await locationModel.removeArea(id)

  await audit(req, {
    action: 'area.delete',
    targetType: 'area',
    targetId: id,
    description: `Deleted area ${area.name} (${JSON.stringify(counts)})`,
    changes: { deleted: area, dependants: counts },
  })

  res.status(200).json({ success: true, message: 'Area deleted', data: { id, affected: counts } })
})

/* --- Colleges ----------------------------------------------------------- */

const listColleges = asyncHandler(async (req, res) => {
  const { page, limit, offset } = await resolvePagination(req.query)

  const result = await locationModel.listCollegesForAdmin(
    { page, limit, offset },
    {
      cityId: optionalId(req.query.city, 'city'),
      areaId: optionalId(req.query.area, 'area'),
      search: typeof req.query.search === 'string' && req.query.search.trim()
        ? req.query.search.trim()
        : undefined,
    },
  )

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
    pagination: paginationMeta({ page: result.page, limit: result.limit }, result.total),
  })
})

const createCollege = asyncHandler(async (req, res) => {
  const areaId = parseId(req.body.areaId, 'areaId')
  if (!(await locationModel.findAreaById(areaId))) {
    throw ApiError.notFound(`No area found with id ${areaId}`)
  }

  const college = await locationModel.createCollege({
    areaId,
    name: text(req.body.name, 'College name', { min: 2, max: 200 }),
    shortName: text(req.body.shortName, 'Short name', { min: 2, max: 60 }),
    description: optionalText(req.body.description, 'Description', 1000),
    imageUrl: optionalText(req.body.imageUrl, 'Image URL', 500),
  })

  await audit(req, {
    action: 'college.create',
    targetType: 'college',
    targetId: college.id,
    description: `Created college ${college.short_name} in ${college.area_name}`,
    changes: { name: college.name, short_name: college.short_name, area_id: areaId },
  })

  res.status(201).json({ success: true, message: 'College created', data: college })
})

const updateCollege = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const before = await locationModel.findCollegeById(id)
  if (!before) throw ApiError.notFound(`No college found with id ${id}`)

  const areaId = parseId(req.body.areaId, 'areaId')
  if (!(await locationModel.findAreaById(areaId))) {
    throw ApiError.notFound(`No area found with id ${areaId}`)
  }

  const college = await locationModel.updateCollege(id, {
    areaId,
    name: text(req.body.name, 'College name', { min: 2, max: 200 }),
    shortName: text(req.body.shortName, 'Short name', { min: 2, max: 60 }),
    description: optionalText(req.body.description, 'Description', 1000),
    imageUrl: optionalText(req.body.imageUrl, 'Image URL', 500),
  })
  if (!college) throw ApiError.notFound(`No college found with id ${id}`)

  await audit(req, {
    action: 'college.update',
    targetType: 'college',
    targetId: id,
    description: `Updated college ${college.short_name}`,
    changes: { from: before, to: college },
  })

  res.status(200).json({ success: true, message: 'College updated', data: college })
})

const removeCollege = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const college = await locationModel.findCollegeById(id)
  if (!college) throw ApiError.notFound(`No college found with id ${id}`)

  const counts = await locationModel.collegeDependants(id)
  if (totalDependants(counts) > 0 && !confirmed(req)) {
    refuseUnconfirmed('college', college.short_name, counts)
  }

  await locationModel.removeCollege(id)

  await audit(req, {
    action: 'college.delete',
    targetType: 'college',
    targetId: id,
    description: `Deleted college ${college.short_name} (${JSON.stringify(counts)})`,
    changes: { deleted: college, dependants: counts },
  })

  res.status(200).json({ success: true, message: 'College deleted', data: { id, affected: counts } })
})

module.exports = {
  listCities,
  createCity,
  updateCity,
  removeCity,
  listAreas,
  createArea,
  updateArea,
  removeArea,
  listColleges,
  createCollege,
  updateCollege,
  removeCollege,
}
