/**
 * controllers/itemController.js -- turns HTTP requests into responses.
 *
 * WHAT IS A CONTROLLER?
 * The translator between the web and the application. It reads the
 * request, asks the model for data, and chooses the status code and
 * JSON to send back. It contains no SQL, and the model contains no
 * knowledge of HTTP. Each layer can then be understood on its own.
 *
 * PHASE 5 SCOPE: READ ONLY.
 * Two endpoints, both public, both harmless -- listing items and
 * viewing one. Creating, editing and deleting items need a logged-in
 * user and ownership checks, so they wait for Phase 8, after Phase 6
 * builds authentication. Adding a write endpoint now would mean
 * either an unprotected one (anyone on the network could delete your
 * data) or dead code guarding an identity that does not exist yet.
 *
 * WHY IS EVERY HANDLER WRAPPED IN asyncHandler?
 * If MySQL goes down mid-query, the await rejects. Unwrapped, that
 * rejection escapes into nowhere and the browser hangs with no
 * response at all. asyncHandler forwards it to errorHandler, which
 * returns a clean 500. See utils/asyncHandler.js.
 */

const itemModel = require('../models/itemModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/**
 * GET /api/items -- list all items.
 *
 * WHY THE { success, count, data } ENVELOPE INSTEAD OF A BARE ARRAY?
 * Returning `[...]` directly seems simpler, but it leaves no room to
 * add anything later. Phase 9 needs to send pagination info
 * alongside the rows; with a bare array there is nowhere to put it
 * without breaking every existing caller. The envelope also matches
 * the error shape from errorHandler.js, so the frontend has exactly
 * one rule: read `success`, then read `data` or `message`.
 */
const getItems = asyncHandler(async (req, res) => {
  const items = await itemModel.findAll()

  res.status(200).json({
    success: true,
    count: items.length,
    data: items,
  })
})

/**
 * GET /api/items/:id -- one item.
 *
 * THE VALIDATION HERE IS NOT BUSY-WORK.
 * URL parameters are always strings, and a user can type anything.
 * /api/items/abc would reach MySQL as the string 'abc'; MySQL coerces
 * it to 0, matches nothing, and we would answer 404 -- which is a
 * misleading answer to a malformed request. Checking first lets us
 * say 400 "that is not a valid id", which is the truth, and it keeps
 * a pointless query off the database.
 *
 * Number.isInteger(Number(x)) rejects 'abc', '1.5' and '' but accepts
 * '7'. The `> 0` matters too: ids are UNSIGNED in the schema, so a
 * negative id is not merely absent, it is impossible.
 */
const getItemById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Item id must be a positive whole number')
  }

  const item = await itemModel.findById(id)

  // The model reports "no such row" as null. Turning that into a 404
  // is the controller's decision, because status codes are HTTP.
  if (!item) {
    throw ApiError.notFound(`No item found with id ${id}`)
  }

  res.status(200).json({
    success: true,
    data: item,
  })
})

module.exports = { getItems, getItemById }
