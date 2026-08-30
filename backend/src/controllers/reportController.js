const itemModel = require('../models/itemModel')
const userModel = require('../models/userModel')
const reportModel = require('../models/reportModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

function shapeReport(row) {
  if (!row) return row
  return {
    id: row.id,
    reporter_id: row.reporter_id,
    reported_item_id: row.reported_item_id,
    reported_user_id: row.reported_user_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    created_at: row.created_at,
    item_name: row.item_name ?? null,
    reported_user_name: row.reported_user_name ?? null,
  }
}

/** '' / whitespace -> null, so the column stores NULL, not an empty string. */
function emptyToNull(value) {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const createReport = asyncHandler(async (req, res) => {
  const reporterId = req.user.id
  const { reason } = req.body
  const details = emptyToNull(req.body.details)
  const itemId = req.body.itemId || null
  const userId = req.body.userId || null

  /* Confirm the target exists and is not the caller themselves. The
     validator guarantees exactly one of itemId / userId is set, so this
     if / else is exhaustive. */
  if (itemId !== null) {
    const item = await itemModel.findById(itemId)
    if (!item) {
      throw ApiError.notFound(`No item found with id ${itemId}`)
    }
    if (item.user_id === reporterId) {
      throw ApiError.forbidden('You cannot report your own listing')
    }
  } else {
    // Cheap identity check before the lookup: reporting yourself is
    // refused whether or not the row is fetched.
    if (userId === reporterId) {
      throw ApiError.forbidden('You cannot report yourself')
    }
    const target = await userModel.findById(userId)
    if (!target) {
      throw ApiError.notFound(`No user found with id ${userId}`)
    }
  }

  try {
    const id = await reportModel.create({ reporterId, itemId, userId, reason, details })
    const created = await reportModel.findById(id)

    res.status(201).json({
      success: true,
      message: 'Report submitted',
      data: shapeReport(created),
    })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('You have already reported this')
    }
    throw err
  }
})

module.exports = { createReport, shapeReport }
