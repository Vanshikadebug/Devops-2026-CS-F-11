/**
 * middleware/protect.js -- the gate in front of routes that need a login.
 *
 * >>> THIS FILE IS WHY FRONTEND CHECKS ARE NOT SECURITY <<<
 *
 * The React app will hide the "Delete" button on items you do not
 * own. That is good design -- it stops honest users from being
 * confused. It is NOT security, because it protects nothing:
 *
 *   - Anyone can open DevTools and delete the `hidden` attribute.
 *   - Anyone can call the API directly with curl or Postman, and
 *     never load your JavaScript at all.
 *   - The API is a public HTTP endpoint. The browser is optional.
 *
 * Frontend checks decide what a user SEES. Backend checks decide
 * what a user CAN DO. Only the second one is enforcement, because
 * only the second one runs on a machine the user does not control.
 *
 * WHAT THIS MIDDLEWARE DOES
 * Runs before a protected controller. It:
 *   1. reads the token from the Authorization header
 *   2. verifies the signature (rejecting forged or expired tokens)
 *   3. loads the user from the database
 *   4. attaches them to req.user, so the controller knows who is asking
 *
 * If any step fails it throws a 401 and the controller never runs.
 *
 * WHY LOOK THE USER UP IN THE DATABASE EVERY TIME?
 * We could trust the id inside the token and skip the query -- it is
 * signed, after all. But a token stays valid for 7 days, and in that
 * window the account may have been deleted. Without this lookup, a
 * deleted user would keep operating normally until their token
 * expired. The query is a single indexed primary-key read.
 */

const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')
const { verifyToken } = require('../utils/token')
const userModel = require('../models/userModel')

const protect = asyncHandler(async (req, _res, next) => {
  /* --- 1. Extract the token ---------------------------------
     The standard format is:
         Authorization: Bearer eyJhbGciOi...
     "Bearer" means "whoever bears this token is the user" -- which
     is precisely why a stolen token is as good as a password, and
     why HTTPS is mandatory in production. Over plain HTTP anyone on
     the same network can read the header in transit. */
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('You must be logged in to do that')
  }

  const token = header.slice(7).trim() // everything after "Bearer "

  if (!token) {
    throw ApiError.unauthorized('You must be logged in to do that')
  }

  /* --- 2. Verify the signature -------------------------------
     Throws JsonWebTokenError (tampered/forged) or TokenExpiredError.
     Both are already mapped to a 401 in errorHandler.js, so we let
     them propagate rather than catching and re-wrapping.

     THIS LINE IS THE ACTUAL SECURITY BOUNDARY. Everything before it
     is parsing; everything after it can be trusted. */
  const payload = verifyToken(token)

  /* --- 3. Load the user --------------------------------------
     findById never selects the password column, so req.user cannot
     carry a hash into a controller that might echo it back. */
  const user = await userModel.findById(payload.id)

  if (!user) {
    // Valid signature, but the account is gone.
    throw ApiError.unauthorized('This account no longer exists')
  }

  /* --- 4. Hand the identity to the controller -----------------
     From here on, req.user.id is the authenticated user. It comes
     from a signed token, NOT from the request body or a query
     parameter -- a client cannot claim to be someone else.

     This is the single most important habit in the whole project.
     In Phase 8, ownership is checked as:
         if (item.user_id !== req.user.id) throw ApiError.forbidden()
     Trusting a `userId` sent in the body instead would mean anyone
     could edit anyone's items just by changing a number. */
  req.user = user
  next()
})

module.exports = protect
