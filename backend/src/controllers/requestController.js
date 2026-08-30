const itemModel = require('../models/itemModel')
const userModel = require('../models/userModel')
const requestModel = require('../models/requestModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

function shapeRequest(row) {
  if (!row) return row

  const shaped = {
    id: row.id,
    item_id: row.item_id,
    requester_id: row.requester_id,
    owner_id: row.owner_id,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    item_name: row.item_name,
    item_status: row.item_status,
    item_image_url: row.item_image_url,
    item_category: row.item_category,
    item_location: row.item_location,
    owner_name: row.owner_name,
    requester_name: row.requester_name,
  }

  if (row.status === 'Accepted') {
    shaped.owner_email = row.owner_email
    shaped.owner_mobile = row.owner_mobile
    shaped.requester_email = row.requester_email
    shaped.requester_mobile = row.requester_mobile
  }

  return shaped
}

function emptyToNull(value) {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function mapDecision(result) {
  if (result.ok) return result.data

  switch (result.reason) {
    case 'not_found':
      throw ApiError.notFound('No request found with that id')
    case 'not_owner':
      throw ApiError.notFound('No request found with that id')
    case 'not_pending':
      throw ApiError.unprocessable('Only a pending request can be accepted or rejected')
    case 'not_available':
      throw ApiError.unprocessable('This item is no longer available')
    default:
      throw ApiError.internal('Could not update that request')
  }
}

const createRequest = asyncHandler(async (req, res) => {
  const itemId = req.body.itemId
  const item = await itemModel.findById(itemId)

  if (!item) {
    throw ApiError.notFound(`No item found with id ${itemId}`)
  }

  if (item.user_id === req.user.id) {
    throw ApiError.forbidden('You cannot request an item you listed yourself')
  }

  if (item.moderation_status !== 'Approved') {
    throw ApiError.unprocessable('This item is not available to request')
  }

  if (item.status !== 'Available') {
    throw ApiError.unprocessable('This item is not available to request')
  }

  const owner = await userModel.findById(item.user_id)
  if (!owner || owner.status !== 'active') {
    throw ApiError.unprocessable('This item is not available to request')
  }

  const message = emptyToNull(req.body.message)

  const previous = await requestModel.findByItemAndRequester(itemId, req.user.id)

  if (previous) {
    if (previous.status === 'Rejected') {
      const reopened = await requestModel.reopen(previous.id, message)
      if (!reopened) {
        // It stopped being Rejected between the read and the write.
        throw ApiError.conflict('You have already requested this item')
      }
      return res.status(201).json({
        success: true,
        message: 'Request sent',
        data: shapeRequest(reopened),
      })
    }
    // Pending or Accepted -- a live request is already on file.
    throw ApiError.conflict('You have already requested this item')
  }

  try {
    const created = await requestModel.create({
      itemId,
      requesterId: req.user.id,
      message,
    })

    res.status(201).json({
      success: true,
      message: 'Request sent',
      data: shapeRequest(created),
    })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('You have already requested this item')
    }
    throw err
  }
})

const getSent = asyncHandler(async (req, res) => {
  let itemId
  if (req.query.item !== undefined && req.query.item !== '') {
    const n = Number(req.query.item)
    if (!Number.isInteger(n) || n <= 0) {
      throw ApiError.badRequest('item must be a positive whole number')
    }
    itemId = n
  }

  const rows = await requestModel.findSent(req.user.id, { itemId })

  res.status(200).json({
    success: true,
    count: rows.length,
    data: rows.map(shapeRequest),
  })
})

/** GET /api/requests/received -- requests on the caller's own items. */
const getReceived = asyncHandler(async (req, res) => {
  const rows = await requestModel.findReceived(req.user.id)

  res.status(200).json({
    success: true,
    count: rows.length,
    data: rows.map(shapeRequest),
  })
})

const updateRequestStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Request id must be a positive whole number')
  }

  const existing = await requestModel.findById(id)

  if (!existing) {
    throw ApiError.notFound(`No request found with id ${id}`)
  }

  if (existing.owner_id !== req.user.id) {
    if (existing.requester_id === req.user.id) {
      throw ApiError.forbidden('Only the person who listed this item can accept or reject requests')
    }
    throw ApiError.notFound(`No request found with id ${id}`)
  }

  const result = req.body.status === 'Accepted'
    ? await requestModel.accept(id, req.user.id)
    : await requestModel.reject(id, req.user.id)

  const updated = mapDecision(result)
  const verb = req.body.status === 'Accepted' ? 'accepted' : 'rejected'

  res.status(200).json({
    success: true,
    message: `Request ${verb}`,
    data: shapeRequest(updated),
  })
})

module.exports = {
  createRequest,
  getSent,
  getReceived,
  updateRequestStatus,
  shapeRequest,
}
