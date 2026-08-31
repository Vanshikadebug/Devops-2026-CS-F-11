const ApiError = require('../utils/ApiError')
const config = require('../config/env')

/* MySQL driver error codes we can safely translate into friendly
   messages. Mapping them here means a controller does not have to
   know about driver internals. */
const MYSQL_MESSAGES = {
  // Inserting a value that violates a UNIQUE constraint --
  // in this app, almost always a duplicate email.
  ER_DUP_ENTRY: { status: 409, message: 'That value is already taken' },

  // A foreign key points at a row that does not exist, e.g.
  // requesting an item_id that was deleted.
  ER_NO_REFERENCED_ROW_2: { status: 400, message: 'Referenced record does not exist' },

  // Cannot delete a row because other rows still reference it.
  ER_ROW_IS_REFERENCED_2: { status: 409, message: 'Cannot delete: other records depend on this' },
}

function errorHandler(err, req, res, _next) {
  let statusCode = 500
  let message = 'Internal server error'
  let details
  let shouldLogFullError = true

  if (err instanceof ApiError) {
    // Deliberate, safe to expose.
    statusCode = err.statusCode
    message = err.message
    details = err.details
    // 4xx errors are normal traffic (bad password, missing page),
    // not incidents. Logging every one buries the real problems.
    shouldLogFullError = statusCode >= 500
  } else if (err.code && MYSQL_MESSAGES[err.code]) {
    const mapped = MYSQL_MESSAGES[err.code]
    statusCode = mapped.status
    message = mapped.message
    shouldLogFullError = false
  } else if (err.name === 'JsonWebTokenError') {
    // Token was tampered with, or signed by a different secret.
    statusCode = 401
    message = 'Invalid authentication token'
    shouldLogFullError = false
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401
    message = 'Your session has expired. Please log in again.'
    shouldLogFullError = false
  } else if (err.type === 'entity.parse.failed') {
    // express.json() could not parse the body as JSON.
    statusCode = 400
    message = 'Request body is not valid JSON'
    shouldLogFullError = false
  }

  if (shouldLogFullError) {
    // Server-side log: full detail. This is safe -- it goes to the
    // terminal and to Jenkins logs, not to the user.
    console.error(`\n[error] ${req.method} ${req.originalUrl}`)
    console.error(`[error] ${err.name}: ${err.message}`)
    if (err.code) console.error(`[error] code: ${err.code}`)
    console.error(err.stack)
  } else if (!config.isTest) {
    // Expected errors: one tidy line. Suppressed during tests,
    // where deliberate 4xx checks would otherwise flood the output.
    console.warn(`[warn] ${req.method} ${req.originalUrl} -> ${statusCode} ${message}`)
  }

  const body = {
    success: false,
    message,
  }

  if (details) body.details = details

  // Stack traces are a debugging aid, never a production feature.
  if (!config.isProduction && err.stack) {
    body.stack = err.stack.split('\n').slice(0, 5)
  }

  res.status(statusCode).json(body)
}

module.exports = errorHandler
