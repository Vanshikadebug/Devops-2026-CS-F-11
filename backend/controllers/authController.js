/**
 * controllers/authController.js -- register, login, and "who am I?".
 *
 * By the time these functions run, the validators have already
 * guaranteed the fields are present and well formed. So each one
 * contains only the decisions that actually matter.
 */

const userModel = require('../models/userModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')
const { signToken } = require('../utils/token')

/**
 * Builds the response returned by both register and login.
 *
 * Defined once so the two endpoints cannot drift apart -- the
 * frontend stores whatever comes back, and if register returned
 * `{ token, user }` while login returned `{ jwt, profile }`, one of
 * the two flows would break in a way that is tedious to track down.
 */
function authResponse(user, message) {
  return {
    success: true,
    message,
    token: signToken(user.id),
    // `user` here came from the model's SAFE_FIELDS query, so there
    // is no password on the object to leak in the first place.
    user,
  }
}

/**
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, mobile, password } = req.body

  /* --- The duplicate-email check, and why it is not the real one ---
     This lookup exists to produce a friendly message. It is NOT what
     guarantees uniqueness, because it cannot: between this SELECT and
     the INSERT below, another request can insert the same email. Two
     people registering simultaneously would both read "not taken"
     and both proceed. That is a RACE CONDITION, and no amount of
     application code removes it.

     What actually guarantees uniqueness is the database:
         UNIQUE KEY uq_users_email (email)
     in schema.sql. The loser of the race gets ER_DUP_ENTRY, which
     errorHandler.js already maps to a 409. So the guarantee is
     enforced by the database, and this check merely makes the common
     case read nicely. tests/database.test.js proves the constraint
     rejects duplicates. */
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

  /* >>> WHY BOTH FAILURES GIVE THE SAME MESSAGE <<<
     "No account with that email" and "Wrong password" are two
     different facts, and telling them apart is exactly what an
     attacker wants. With distinct messages, an attacker can feed in
     a list of addresses and learn which ones are registered -- that
     is ACCOUNT ENUMERATION. Knowing an address is registered is
     valuable on its own (it can be phished, or credential-stuffed
     with passwords leaked from other sites).

     One message for both, so a failed attempt reveals nothing. */
  const invalid = ApiError.unauthorized('Invalid email or password')

  if (!user) throw invalid

  const matches = await userModel.verifyPassword(password, user.password)

  if (!matches) throw invalid

  /* >>> REFUSE A BLOCKED ACCOUNT AT THE DOOR <<<
     protect.js already rejects a blocked user on every authenticated
     request, so a block is enforced with or without this line. But
     without it, login itself still SUCCEEDS: a blocked person is told
     "Logged in successfully", handed a fresh 7-day token, and only
     discovers the block on their NEXT request, when protect answers
     403. That is a login screen that accepts the password and then
     behaves like a broken site. Refusing here makes the block honest
     at the one moment the user is looking straight at it.

     WHY AFTER THE PASSWORD CHECK, NOT BEFORE?
     The two failures above deliberately share one message so a
     stranger cannot learn which emails are registered (see `invalid`).
     Announcing "blocked" before the password is verified would undo
     that -- anyone who typed the address would learn the account both
     exists and is blocked. Placed here, the only person who ever sees
     this message is one who has already proved they hold the
     credentials: the blocked user themselves. Nothing new leaks to an
     attacker who is only guessing.

     403, not 401, and the SAME wording as protect.js: the credentials
     are genuine, so re-authenticating cannot help, and one message
     means a blocked user reads the same explanation whether they are
     stopped at login or mid-session. */
  if (user.status === 'blocked') {
    throw ApiError.forbidden(
      'This account has been blocked. Contact support if you believe this is a mistake.',
    )
  }

  /* Strip the hash before responding. `user` came from the
     with-password query, so unlike everywhere else in this codebase
     the object genuinely holds a hash right now. Deleting it here is
     the one manual step, and it is the reason that query has such a
     deliberately awkward name. */
  delete user.password

  /* >>> RECORD THE LOGIN, BUT NEVER LET IT FAIL THE LOGIN <<<
     The credentials are good and the account is active, so this is a
     genuine sign-in -- stamp last_login_at, the column the admin user
     list sorts dormant accounts by. Placed HERE, after the blocked
     check, a refused 403 login is never mistaken for a success.

     Deliberately NOT awaited -- touchLastLogin's own docblock explains
     why at length: it is bookkeeping, not authentication, and awaiting
     a write nobody asked for would let a database hiccup turn a correct
     password into "login failed". Fire it and move on. The .catch is
     there only so a failed write is logged rather than surfacing as an
     unhandled promise rejection that could take the process down. */
  userModel.touchLastLogin(user.id).catch((err) => {
    console.error(`[auth] failed to stamp last_login_at for user ${user.id}: ${err.message}`)
  })

  res.status(200).json(authResponse(user, 'Logged in successfully'))
})

/**
 * GET /api/auth/me -- the current user, from their token.
 *
 * WHAT IS THIS FOR?
 * Page refresh. The token survives in localStorage, but React state
 * does not -- so on reload the app knows it has a token and nothing
 * else. It calls this endpoint to turn that token back into a user.
 *
 * It is also how a token is validated cheaply: an expired or forged
 * one is rejected here by `protect`, and the frontend logs out
 * cleanly instead of showing a half-authenticated UI.
 *
 * Note there is no id in the URL. Asking "who am I?" must be
 * answered by the token, never by a parameter -- an endpoint like
 * GET /api/auth/me?id=3 would let anyone read any account.
 */
const me = asyncHandler(async (req, res) => {
  // protect already loaded and verified the user.
  res.status(200).json({ success: true, user: req.user })
})

/**
 * WHY IS THERE NO LOGOUT ENDPOINT?
 *
 * A JWT is stateless: the server keeps no session record, which is
 * exactly what makes it scale. There is nothing on the server to
 * delete. Logging out means the CLIENT discards its token, and the
 * frontend does that in AuthContext.logout().
 *
 * The honest trade-off: a token already stolen stays valid until it
 * expires, because the server has no list to revoke it from. Real
 * systems solve this with short-lived tokens plus refresh tokens, or
 * a revocation list -- both beyond this project's scope. Our 7-day
 * expiry bounds the window.
 */

module.exports = { register, login, me }
