/**
 * controllers/requestController.js -- create, list, and decide requests.
 *
 * requester_id and owner checks use req.user.id from protect.js, never
 * a body field. Contact columns are stripped unless the request is
 * Accepted -- that is the only point at which two people have agreed
 * to collect something, and the only point the schema's emails belong
 * on the wire.
 */

const itemModel = require('../models/itemModel')
const userModel = require('../models/userModel')
const requestModel = require('../models/requestModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/**
 * Names always travel. Email and mobile only travel after accept.
 * The model still SELECTs them so this function is the one place the
 * rule can be audited.
 */
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

/**
 * POST /api/requests
 *
 * The requester is req.user.id. A body `requesterId` is ignored.
 */
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

  /* --- The re-request policy -------------------------------------
     One person holds at most one request row per item
     (UNIQUE(item_id, requester_id)). If they have asked before, what
     happens next depends on that row's state:

       Rejected  -> re-open it (requestModel.reopen). A decline is not
                    final: they may have been auto-rejected when someone
                    else was accepted, and the item is Available again
                    now, or the status gate above would have turned this
                    request away already.
       Pending   -> a live request already exists: 409.
       Accepted  -> they already hold this item: 409. (Usually caught by
                    the Available check above, but not once an owner
                    frees a previously accepted item.)

     Checking first and then writing carries a harmless race: two
     first-time requests can both try to INSERT, and the UNIQUE key
     turns the loser into the ER_DUP_ENTRY handled below. */
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

/**
 * GET /api/requests/sent
 *
 * Optional ?item=N so ItemDetail can ask about one listing without
 * downloading the whole sent list.
 */
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

/**
 * PATCH /api/requests/:id -- accept or reject.
 *
 * Only the item owner may decide. A requester who PATCHes their own
 * row gets 403 (they know it exists). Anyone else gets 404, so walking
 * ids does not confirm other people's requests.
 */
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
