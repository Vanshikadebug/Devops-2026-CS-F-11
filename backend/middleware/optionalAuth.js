/**
 * middleware/optionalAuth.js -- identifies the caller IF they are
 * logged in, and lets them through either way.
 *
 * >>> WHY THIS EXISTS, AND WHY IT IS NOT JUST A LOOSER protect.js <<<
 * Moderation created a question the old routes never had to answer.
 * GET /api/items/:id is public -- browsing without an account is
 * deliberate, see itemRoutes.js -- but once a listing can be Pending
 * or Hidden, "who is asking?" changes the correct response:
 *
 *   a stranger          must NOT see an unapproved listing (404)
 *   its owner           MUST see their own pending listing, or
 *                       "Awaiting review" in MyItems links to a 404
 *   a moderator         must see it, that is the job
 *
 * The controller cannot make that call without knowing the viewer, and
 * `protect` cannot supply one, because it 401s a visitor who has no
 * token -- which would close the public browse page to the public.
 *
 * SO THE CONTRACT IS: req.user is set when a valid token was sent, and
 * left undefined otherwise. Never an error either way.
 *
 * >>> THE RULE FOR EVERY ROUTE THAT USES THIS <<<
 * The handler MUST treat `req.user` as possibly undefined. Anything
 * that requires an identity keeps using `protect` instead -- this
 * middleware guarantees nothing, and a write route that mounted it by
 * mistake would read `req.user?.id` as undefined and hand SQL a NULL
 * owner. It is mounted ONLY on public reads.
 *
 * A bad token is IGNORED rather than rejected, which is worth being
 * explicit about: an expired token in an old tab should show the same
 * public page a logged-out visitor sees, not an error. The nuance is
 * that nothing is silently granted -- an unverifiable token leaves the
 * request exactly as anonymous as no token at all.
 */

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

  /* >>> THE try/catch WRAPS ONLY THE VERIFY, NOT THE LOOKUP <<<
     A forged, expired or malformed token means "we do not know who this
     is", which is the same state as sending no token -- and on a public
     route that state is fine, so it is swallowed. A DATABASE failure is
     not the same thing at all, and must not be quietly downgraded into
     an anonymous request. Keeping the query outside the catch lets it
     reach errorHandler as the 500 it is. */
  let payload
  try {
    payload = verifyToken(token)
  } catch {
    return next()
  }

  const user = await userModel.findById(payload.id)

  /* A blocked account is treated as anonymous rather than refused. They
     can still browse -- the block is on participating, not on reading a
     public page -- but they get no owner privileges and no moderator
     visibility, because req.user is never set. */
  if (user && user.status !== 'blocked') {
    req.user = user
  }

  return next()
})

module.exports = optionalAuth
