/**
 * middleware/notFound.js -- catches requests that matched no route.
 *
 * HOW EXPRESS ROUTING WORKS (the key idea)
 * Express tries middleware and routes strictly in the order they
 * were registered. If a request matches nothing, it falls off the
 * end and Express sends its own bare HTML error page.
 *
 * That is bad for an API: our frontend expects JSON. Receiving HTML
 * makes `response.json()` throw a confusing parse error in the
 * browser instead of a clean "not found".
 *
 * So we register this LAST, after every real route. Reaching it
 * means nothing else matched. It creates a 404 ApiError and hands it
 * to the error handler, so a typo'd URL returns the same JSON shape
 * as every other error.
 *
 * WHY NOT res.status(404) DIRECTLY?
 * Delegating keeps one response format in one file. If we later add
 * error reporting to errorHandler, 404s are covered automatically.
 */

const ApiError = require('../utils/ApiError')

function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`))
}

module.exports = notFound
