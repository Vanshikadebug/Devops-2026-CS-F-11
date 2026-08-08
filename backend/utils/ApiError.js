/**
 * utils/ApiError.js -- an Error that also carries an HTTP status code.
 *
 * THE PROBLEM IT SOLVES
 * A controller discovers something is wrong: the item does not
 * exist, or the caller does not own it. It must communicate BOTH
 * "what went wrong" and "which HTTP status to send".
 *
 * Without this, controllers end up doing:
 *     return res.status(404).json({ success: false, message: '...' })
 * ...at every failure point, and it becomes very easy to forget the
 * `return`, sending two responses and crashing the request.
 *
 * With ApiError, a controller simply throws:
 *     throw ApiError.notFound('Item not found')
 * and the error middleware turns it into the right HTTP response.
 * Throwing also guarantees the rest of the function does not run.
 *
 * WHY `extends Error`?
 * So it keeps a real stack trace, works with `instanceof`, and is
 * caught by normal try/catch and by Express's error pipeline.
 */
class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message)

    this.name = 'ApiError'
    this.statusCode = statusCode

    // Optional field-level info, used by validation errors:
    //   [{ field: 'email', message: 'Email is already registered' }]
    this.details = details

    // Marks this as an error WE created deliberately, as opposed to
    // an unexpected crash (a typo, a null dereference). The error
    // handler uses this to decide whether the message is safe to
    // show the user -- see errorHandler.js.
    this.isOperational = true

    // Removes the ApiError constructor itself from the stack trace,
    // so the trace points at the line that actually threw.
    Error.captureStackTrace(this, this.constructor)
  }

  /* --- Named constructors -------------------------------------
     `ApiError.notFound('Item not found')` reads better than
     `new ApiError(404, 'Item not found')`, and stops people from
     inventing their own status codes for the same situation. */

  /** 400 -- the request itself is malformed or fails validation. */
  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, details)
  }

  /** 401 -- WHO ARE YOU? No valid credentials were supplied. */
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message)
  }

  /** 403 -- I KNOW WHO YOU ARE, and you still may not do this.
   *  Used when a logged-in user tries to edit someone else's item. */
  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, message)
  }

  /** 404 -- the resource does not exist. */
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message)
  }

  /** 409 -- conflicts with existing state, e.g. duplicate email. */
  static conflict(message = 'Conflict with existing data') {
    return new ApiError(409, message)
  }

  /** 500 -- we broke, not the caller. */
  static internal(message = 'Internal server error') {
    return new ApiError(500, message)
  }
}

module.exports = ApiError
