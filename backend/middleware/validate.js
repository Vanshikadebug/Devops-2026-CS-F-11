/**
 * middleware/validate.js -- turns express-validator results into a
 * single, consistent 400 response.
 *
 * WHY VALIDATE ON THE BACKEND WHEN THE FORM ALREADY VALIDATES?
 * Same reason as protect.js: the browser is optional. `required` and
 * `type="email"` on an <input> are a convenience for honest users,
 * and they vanish the moment someone uses curl. Every rule that
 * matters has to exist here too.
 *
 * The frontend rules make the form pleasant. These rules make it
 * correct. Both are needed, and they are not duplicates -- they have
 * different jobs.
 *
 * HOW express-validator WORKS
 * The rules (see validators/authValidators.js) run first as
 * middleware and record any problems on the request. This function
 * runs after them, collects the results, and either stops with a 400
 * or calls next().
 *
 * WHY RETURN ALL ERRORS AT ONCE, NOT JUST THE FIRST?
 * Because "Password too short" followed, after a resubmit, by
 * "Invalid email" is a miserable experience. One response listing
 * every problem lets the form highlight all the fields at once.
 */

const { validationResult } = require('express-validator')
const ApiError = require('../utils/ApiError')

function validate(req, _res, next) {
  const result = validationResult(req)

  if (result.isEmpty()) return next()

  /* Reshape into { field, message } pairs. express-validator's raw
     format has changed between major versions; converting it here
     means the frontend depends on OUR stable shape, not the
     library's. Upgrading the library then cannot break the UI. */
  const details = result.array().map((err) => ({
    field: err.path || err.param,
    message: err.msg,
  }))

  // errorHandler.js copies `details` into the response body, so the
  // frontend receives:
  //   { success: false, message: '...', details: [{ field, message }] }
  next(ApiError.badRequest('Please correct the highlighted fields', details))
}

module.exports = validate
