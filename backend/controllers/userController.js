/**
 * controllers/userController.js -- the logged-in user's own profile.
 *
 * ONE ENDPOINT SO FAR:
 *     PUT /api/users/me/college
 *
 * WHAT IS IT FOR?
 * The browse page asks city -> area -> college. Doing that on every
 * single visit, forever, to reach the same campus you reached
 * yesterday, is the kind of small friction that makes a site tiring
 * to use. Saving the answer means a returning user lands on their
 * own college's items.
 *
 * WHY STORE IT ON THE SERVER AND NOT JUST IN localStorage?
 * The frontend does keep a copy in localStorage -- that is what
 * makes the picker instant on load, and it is the only thing a
 * logged-out visitor has. But localStorage is per-browser: the same
 * person on their phone would be back to picking from scratch. The
 * account is the thing that follows them between devices, so the
 * account is where the answer belongs. The two are not duplicates;
 * they answer for different scopes.
 *
 * >>> WHY THE URL SAYS "me" AND HAS NO :id <<<
 * This is the same rule as GET /api/items/mine and GET /api/auth/me,
 * and it matters more here because this endpoint WRITES.
 *
 * The obvious shape is PUT /api/users/:id/college, and it hands the
 * caller a field to lie in. The server then has to compare :id
 * against the token's id on every such route, and the day someone
 * forgets, anyone can rewrite anyone else's profile by changing a
 * number in the URL. That class of bug -- Insecure Direct Object
 * Reference -- is one of the most common serious vulnerabilities in
 * real web applications, and it is caused entirely by accepting an
 * id from the client in the first place.
 *
 * "me" cannot be wrong. There is nowhere in the request to say whose
 * profile to change: the answer comes from req.user.id, which
 * protect.js derived from a verified token signature.
 */

const userModel = require('../models/userModel')
const locationModel = require('../models/locationModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/**
 * PUT /api/users/me/college
 * Body: { "collegeId": 4 }  or  { "collegeId": null } to clear it.
 */
const updateMyCollege = asyncHandler(async (req, res) => {
  const raw = req.body.collegeId

  /* --- null means "clear it", and that is a real answer ---------
     Someone who picked the wrong campus must be able to undo it,
     and someone who would rather not say is allowed not to. The
     column is NULLABLE precisely so this state can be expressed.

     Note that `undefined` -- the key missing from the body
     altogether -- is NOT treated as null. Those look similar in
     JavaScript and mean opposite things here: one is "set it to
     nothing" and the other is "you forgot to send the field". A
     malformed request silently wiping the user's saved college
     would be a data-loss bug that never raises an error. */
  if (raw === null) {
    const user = await userModel.updateCollege(req.user.id, null)
    return res.status(200).json({
      success: true,
      message: 'College cleared',
      user,
    })
  }

  const collegeId = Number(raw)

  if (raw === undefined || !Number.isInteger(collegeId) || collegeId <= 0) {
    throw ApiError.badRequest(
      'collegeId must be a positive whole number, or null to clear it',
    )
  }

  /* --- Check the college exists BEFORE writing ------------------
     The foreign key would reject an unknown id anyway, so this
     lookup is not what makes the operation safe -- the database is.
     It is what makes the FAILURE legible: without it the caller
     gets errorHandler's generic mapping of ER_NO_REFERENCED_ROW_2,
     "Referenced record does not exist", which does not say which
     record or which field. One indexed read buys a message that
     names the problem. */
  const college = await locationModel.findCollegeById(collegeId)

  if (!college) {
    throw ApiError.notFound(`No college found with id ${collegeId}`)
  }

  const user = await userModel.updateCollege(req.user.id, collegeId)

  res.status(200).json({
    success: true,
    message: `College set to ${college.short_name}`,
    // The full user, re-read through SAFE_FIELDS, so the frontend can
    // replace its stored copy wholesale instead of patching one field
    // and hoping the rest is still accurate.
    user,
  })
})

module.exports = { updateMyCollege }
