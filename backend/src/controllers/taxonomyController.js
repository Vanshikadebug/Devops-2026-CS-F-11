const taxonomyModel = require('../models/taxonomyModel')
const auditModel = require('../models/auditModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

function parseId(value, label = 'id') {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.badRequest(`${label} must be a positive whole number`)
  }
  return n
}

function requireLabel(raw, field = 'label') {
  const label = String(raw ?? '').trim()
  if (label.length < 2 || label.length > 60) {
    throw ApiError.badRequest(`${field} must be 2 to 60 characters`)
  }
  return label
}

function optionalInt(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isInteger(n)) throw ApiError.badRequest('sortOrder must be a whole number')
  return n
}

function optionalBool(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined
  return raw === true || raw === 'true' || raw === 1 || raw === '1'
}

/** Turns the model's DUPLICATE_LABEL into a 409 rather than a 500. */
function rethrowDuplicate(err) {
  if (err.code === 'DUPLICATE_LABEL') throw ApiError.conflict(err.message)
  throw err
}

/* --- Public ------------------------------------------------------------- */

/* Active rows only, and without the usage counts the admin tables need. The
   same data rides along in GET /api/config; these exist so an API consumer can
   ask for just the taxonomy. */

const publicCategories = asyncHandler(async (req, res) => {
  const categories = await taxonomyModel.activeCategories()
  res.status(200).json({ success: true, count: categories.length, data: categories })
})

const publicConditions = asyncHandler(async (req, res) => {
  const conditions = await taxonomyModel.activeConditions()
  res.status(200).json({ success: true, count: conditions.length, data: conditions })
})

/* --- Categories --------------------------------------------------------- */

const listCategories = asyncHandler(async (req, res) => {
  const categories = await taxonomyModel.listCategoriesForAdmin()
  res.status(200).json({ success: true, count: categories.length, data: categories })
})

const createCategory = asyncHandler(async (req, res) => {
  const label = requireLabel(req.body.label)

  const category = await taxonomyModel
    .createCategory({
      label,
      glyph: req.body.glyph,
      tint: req.body.tint,
      sortOrder: optionalInt(req.body.sortOrder),
    })
    .catch(rethrowDuplicate)

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'category.create',
    targetType: 'category',
    targetId: category.id,
    description: `Created category ${category.label}`,
    changes: { label: category.label, glyph: category.glyph, tint: category.tint },
    ip: req.ip,
  })

  res.status(201).json({ success: true, message: 'Category created', data: category })
})

const updateCategory = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await taxonomyModel.findCategoryById(id)
  if (!existing) throw ApiError.notFound(`No category found with id ${id}`)

  const patch = {
    glyph: req.body.glyph,
    tint: req.body.tint,
    sortOrder: optionalInt(req.body.sortOrder),
    isActive: optionalBool(req.body.isActive),
  }
  if (req.body.label !== undefined) patch.label = requireLabel(req.body.label)

  const category = await taxonomyModel.updateCategory(id, patch).catch(rethrowDuplicate)
  if (!category) throw ApiError.notFound(`No category found with id ${id}`)

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'category.update',
    targetType: 'category',
    targetId: id,
    description: `Updated category ${category.label}`,
    changes: { from: existing, to: category },
    ip: req.ip,
  })

  res.status(200).json({ success: true, message: 'Category updated', data: category })
})

const removeCategory = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await taxonomyModel.findCategoryById(id)
  if (!existing) throw ApiError.notFound(`No category found with id ${id}`)

  const inUse = await taxonomyModel.categoryUsage(id)
  if (inUse > 0) {
    throw ApiError.conflict(
      `${inUse} listing${inUse === 1 ? '' : 's'} still use "${existing.label}". ` +
        'Deactivate it instead to hide it from new listings.',
    )
  }

  await taxonomyModel.removeCategory(id)

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'category.delete',
    targetType: 'category',
    targetId: id,
    description: `Deleted category ${existing.label}`,
    changes: { deleted: existing },
    ip: req.ip,
  })

  res.status(200).json({ success: true, message: 'Category deleted', data: { id } })
})

/* --- Conditions --------------------------------------------------------- */

const listConditions = asyncHandler(async (req, res) => {
  const conditions = await taxonomyModel.listConditionsForAdmin()
  res.status(200).json({ success: true, count: conditions.length, data: conditions })
})

const createCondition = asyncHandler(async (req, res) => {
  const label = requireLabel(req.body.label)

  const condition = await taxonomyModel
    .createCondition({ label, sortOrder: optionalInt(req.body.sortOrder) })
    .catch(rethrowDuplicate)

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'condition.create',
    targetType: 'condition',
    targetId: condition.id,
    description: `Created condition ${condition.label}`,
    changes: { label: condition.label },
    ip: req.ip,
  })

  res.status(201).json({ success: true, message: 'Condition created', data: condition })
})

const updateCondition = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await taxonomyModel.findConditionById(id)
  if (!existing) throw ApiError.notFound(`No condition found with id ${id}`)

  const patch = {
    sortOrder: optionalInt(req.body.sortOrder),
    isActive: optionalBool(req.body.isActive),
  }
  if (req.body.label !== undefined) patch.label = requireLabel(req.body.label)

  const condition = await taxonomyModel.updateCondition(id, patch).catch(rethrowDuplicate)
  if (!condition) throw ApiError.notFound(`No condition found with id ${id}`)

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'condition.update',
    targetType: 'condition',
    targetId: id,
    description: `Updated condition ${condition.label}`,
    changes: { from: existing, to: condition },
    ip: req.ip,
  })

  res.status(200).json({ success: true, message: 'Condition updated', data: condition })
})

const removeCondition = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await taxonomyModel.findConditionById(id)
  if (!existing) throw ApiError.notFound(`No condition found with id ${id}`)

  const inUse = await taxonomyModel.conditionUsage(id)
  if (inUse > 0) {
    throw ApiError.conflict(
      `${inUse} listing${inUse === 1 ? '' : 's'} still use "${existing.label}". ` +
        'Deactivate it instead to hide it from new listings.',
    )
  }

  await taxonomyModel.removeCondition(id)

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'condition.delete',
    targetType: 'condition',
    targetId: id,
    description: `Deleted condition ${existing.label}`,
    changes: { deleted: existing },
    ip: req.ip,
  })

  res.status(200).json({ success: true, message: 'Condition deleted', data: { id } })
})

module.exports = {
  publicCategories,
  publicConditions,
  listCategories,
  createCategory,
  updateCategory,
  removeCategory,
  listConditions,
  createCondition,
  updateCondition,
  removeCondition,
}
