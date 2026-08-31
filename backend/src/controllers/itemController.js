const itemModel = require('../models/itemModel')
const locationModel = require('../models/locationModel')
const settingsModel = require('../models/settingsModel')
const taxonomyModel = require('../models/taxonomyModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')
const { paginationMeta } = require('../utils/pagination')

function optionalId(value, label) {
  if (value === undefined || value === '') return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.badRequest(`${label} must be a positive whole number`)
  }
  return n
}

function optionalEnum(value, allowed, label) {
  if (value === undefined || value === '') return undefined
  if (!allowed.includes(value)) {
    throw ApiError.badRequest(`${label} must be one of: ${allowed.join(', ')}`)
  }
  return value
}

const getItems = asyncHandler(async (req, res) => {
  const { search } = req.query

  // Categories and conditions are rows now, so the allowed values are read
  // from the (cached) taxonomy rather than a hardcoded array.
  const [categories, conditions] = await Promise.all([
    taxonomyModel.categoryLabels(),
    taxonomyModel.conditionLabels(),
  ])

  const filters = {
    college: optionalId(req.query.college, 'college'),
    area: optionalId(req.query.area, 'area'),
    city: optionalId(req.query.city, 'city'),
    category: optionalEnum(req.query.category, categories, 'category'),
    condition: optionalEnum(req.query.condition, conditions, 'condition'),
    status: optionalEnum(req.query.status, itemModel.STATUSES, 'status'),
    sort: optionalEnum(req.query.sort, itemModel.SORT_KEYS, 'sort'),
    limit: req.query.limit,
    page: req.query.page,
    search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
  }

  const { rows, total, page, limit } = await itemModel.findAll(filters)

  res.status(200).json({
    success: true,
    count: rows.length,
    data: rows,
    pagination: paginationMeta({ page, limit }, total),
  })
})

const getItemById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Item id must be a positive whole number')
  }

  const item = await itemModel.findPublicById(id)
  if (!item) throw ApiError.notFound(`No item found with id ${id}`)

  res.status(200).json({ success: true, data: item })
})

const getMyItems = asyncHandler(async (req, res) => {
  const items = await itemModel.findByUser(req.user.id, { limit: req.query.limit })
  res.status(200).json({ success: true, count: items.length, data: items })
})

async function resolvePlace({ collegeId, location }) {
  if (collegeId) {
    // Checked against the directory before the write. The foreign key would
    // reject an unknown id anyway; this is what makes the failure legible.
    const college = await locationModel.findCollegeById(collegeId)
    if (!college) throw ApiError.notFound(`No college found with id ${collegeId}`)

    return {
      collegeId: college.id,
      location: `${college.area_name}, ${college.city_name}`,
    }
  }

  if (await settingsModel.get('require_college_on_item')) {
    throw ApiError.badRequest('Choose the campus this item is listed at')
  }

  const text = typeof location === 'string' ? location.trim() : ''
  if (!text) {
    throw ApiError.badRequest('Choose a college, or type where the item can be collected')
  }

  return { collegeId: null, location: text }
}

function emptyToNull(value) {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Rejects a category or condition that is not an active row. */
async function assertTaxonomy({ category, condition }) {
  const [categories, conditions] = await Promise.all([
    taxonomyModel.categoryLabels(),
    taxonomyModel.conditionLabels(),
  ])

  if (!categories.includes(category)) {
    throw ApiError.badRequest(`category must be one of: ${categories.join(', ')}`)
  }
  if (!conditions.includes(condition)) {
    throw ApiError.badRequest(`condition must be one of: ${conditions.join(', ')}`)
  }
}

const createItem = asyncHandler(async (req, res) => {
  await assertTaxonomy(req.body)
  const place = await resolvePlace(req.body)

  // max_items_per_user (0 = unlimited), checked before the write so the limit
  // actually holds rather than being reported after the row exists.
  const maxItems = await settingsModel.get('max_items_per_user')
  if (maxItems > 0) {
    const active = await itemModel.countActiveForUser(req.user.id)
    if (active >= maxItems) {
      throw ApiError.forbidden(`You can have at most ${maxItems} active listings`)
    }
  }

  // require_item_approval: when on, a listing starts Pending and stays out of
  // browsing until a moderator approves it.
  const moderationStatus = (await settingsModel.get('require_item_approval'))
    ? 'Pending'
    : 'Approved'

  const allowImages = await settingsModel.get('allow_image_url')

  const item = await itemModel.create({
    userId: req.user.id,
    name: req.body.name,
    description: req.body.description,
    category: req.body.category,
    condition: req.body.condition,
    collegeId: place.collegeId,
    location: place.location,
    imageUrl: allowImages ? emptyToNull(req.body.imageUrl) : null,
    status: req.body.status || 'Available',
    moderationStatus,
  })

  res.status(201).json({
    success: true,
    message: moderationStatus === 'Pending' ? 'Item submitted for review' : 'Item listed',
    data: item,
  })
})

const updateItem = asyncHandler(async (req, res) => {
  await assertTaxonomy(req.body)
  const place = await resolvePlace(req.body)
  const allowImages = await settingsModel.get('allow_image_url')

  const item = await itemModel.update(req.itemId, {
    name: req.body.name,
    description: req.body.description,
    category: req.body.category,
    condition: req.body.condition,
    collegeId: place.collegeId,
    location: place.location,
    imageUrl: allowImages ? emptyToNull(req.body.imageUrl) : null,
    status: req.body.status || 'Available',
  })

  res.status(200).json({ success: true, message: 'Item updated', data: item })
})

/** PATCH /api/items/:id/status -- one field out of eight, hence PATCH. This
    is the write the app performs most: one click on "mark as given away". */
const updateItemStatus = asyncHandler(async (req, res) => {
  const item = await itemModel.updateStatus(req.itemId, req.body.status)
  res.status(200).json({
    success: true,
    message: `Item marked ${req.body.status}`,
    data: item,
  })
})

const deleteItem = asyncHandler(async (req, res) => {
  const deleted = await itemModel.remove(req.itemId)
  if (!deleted) throw ApiError.notFound(`No item found with id ${req.itemId}`)

  res.status(200).json({ success: true, message: 'Item deleted', data: { id: req.itemId } })
})

module.exports = {
  getItems,
  getItemById,
  getMyItems,
  createItem,
  updateItem,
  updateItemStatus,
  deleteItem,
}
