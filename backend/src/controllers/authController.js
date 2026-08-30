const userModel = require('../models/userModel')
const settingsModel = require('../models/settingsModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')
const { signToken } = require('../utils/token')

function authResponse(user, message) {
  return {
    success: true,
    message,
    data: {
      token: signToken(user.id),
      // `user` here came from the model's SAFE_FIELDS query, so there
      // is no password on the object to leak in the first place.
      user,
    },
  }
}

/**
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, mobile, password } = req.body

  if (!(await settingsModel.get('allow_registration'))) {
    throw ApiError.forbidden('New registrations are currently closed')
  }

  const existing = await userModel.findByEmail(email)

  if (existing) {
    throw ApiError.conflict('An account with that email already exists')
  }

  // The model hashes the password. The plain text never reaches SQL.
  const user = await userModel.create({ name, email, mobile, password })

  // 201 Created, not 200 -- a new resource now exists. It costs
  // nothing to be accurate and it is what a REST API is expected to do.
  res.status(201).json(authResponse(user, 'Account created successfully'))
})

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body

  // The one place the password hash is ever loaded.
  const user = await userModel.findByEmailWithPassword(email)

  const invalid = ApiError.unauthorized('Invalid email or password')

  if (!user) throw invalid

  const matches = await userModel.verifyPassword(password, user.password)

  if (!matches) throw invalid

  if (user.status === 'blocked') {
    throw ApiError.forbidden(
      'This account has been blocked. Contact support if you believe this is a mistake.',
    )
  }

  delete user.password

  userModel.touchLastLogin(user.id).catch((err) => {
    console.error(`[auth] failed to stamp last_login_at for user ${user.id}: ${err.message}`)
  })

  res.status(200).json(authResponse(user, 'Logged in successfully'))
})

const me = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } })
})

module.exports = { register, login, me }
