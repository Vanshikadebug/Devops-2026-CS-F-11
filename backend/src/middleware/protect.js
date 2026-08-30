const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')
const { verifyToken } = require('../utils/token')
const userModel = require('../models/userModel')

const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('You must be logged in to do that')
  }

  const token = header.slice(7).trim() // everything after "Bearer "

  if (!token) {
    throw ApiError.unauthorized('You must be logged in to do that')
  }

  const payload = verifyToken(token)

  /* --- 3. Load the user --------------------------------------
     findById never selects the password column, so req.user cannot
     carry a hash into a controller that might echo it back. */
  const user = await userModel.findById(payload.id)

  if (!user) {
    // Valid signature, but the account is gone.
    throw ApiError.unauthorized('This account no longer exists')
  }

  if (user.status === 'blocked') {
    throw ApiError.forbidden(
      'This account has been blocked. Contact support if you believe this is a mistake.',
    )
  }

  req.user = user
  next()
})

module.exports = protect
