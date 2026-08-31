const ApiError = require('../utils/ApiError')
const { ROLES } = require('../models/userModel')

const RANK = Object.fromEntries(ROLES.map((role, index) => [role, index]))

/** True if `role` is at least as powerful as `minimum`. */
function atLeast(role, minimum) {
  const have = RANK[role] ?? -1
  return have >= RANK[minimum]
}

function authorize(minimumRole = 'admin') {
  if (!ROLES.includes(minimumRole)) {
    throw new Error(
      `authorize: "${minimumRole}" is not a role. Expected one of ${ROLES.join(', ')}`,
    )
  }

  return function authorizeHandler(req, _res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('You must be logged in to do that'))
    }

    if (!atLeast(req.user.role, minimumRole)) {
      return next(ApiError.forbidden('You do not have permission to do that'))
    }

    return next()
  }
}

const requireStaff = authorize('moderator')
const requireAdmin = authorize('admin')

const requireSuperAdmin = authorize('super_admin')

function isStaff(user) {
  return Boolean(user) && atLeast(user.role, 'moderator')
}

module.exports = {
  authorize,
  requireStaff,
  requireAdmin,
  requireSuperAdmin,
  isStaff,
  atLeast,
  RANK,
}
