class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message)

    this.name = 'ApiError'
    this.statusCode = statusCode

    // Optional field-level info, used by validation errors:
    //   [{ field: 'email', message: 'Email is already registered' }]
    this.details = details

    this.isOperational = true

    // Removes the ApiError constructor itself from the stack trace,
    // so the trace points at the line that actually threw.
    Error.captureStackTrace(this, this.constructor)
  }

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

  static unprocessable(message = 'That change cannot be applied', details) {
    return new ApiError(422, message, details)
  }

  static tooManyRequests(message = 'Too many requests. Please try again shortly.') {
    return new ApiError(429, message)
  }

  /** 500 -- we broke, not the caller. */
  static internal(message = 'Internal server error') {
    return new ApiError(500, message)
  }
}

module.exports = ApiError
