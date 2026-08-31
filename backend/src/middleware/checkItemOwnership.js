const itemModel = require('../models/itemModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

const checkItemOwnership = asyncHandler(async (req, _res, next) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Item id must be a positive whole number')
  }

  const ownerId = await itemModel.findOwnerId(id)

  if (ownerId === null) {
    throw ApiError.notFound(`No item found with id ${id}`)
  }

  if (ownerId !== req.user.id) {
    throw ApiError.forbidden('You can only change items you listed yourself')
  }

  req.itemId = id
  next()
})

module.exports = checkItemOwnership
