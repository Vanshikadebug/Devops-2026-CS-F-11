const asyncHandler = require('../utils/asyncHandler')
const { verifyToken } = require('../utils/token')
const userModel = require('../models/userModel')

const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    return next()
  }

  const token = header.slice(7).trim()
  if (!token) return next()

  let payload
  try {
    payload = verifyToken(token)
  } catch {
    return next()
  }

  const user = await userModel.findById(payload.id)

  if (user && user.status !== 'blocked') {
    req.user = user
  }

  return next()
})

module.exports = optionalAuth
