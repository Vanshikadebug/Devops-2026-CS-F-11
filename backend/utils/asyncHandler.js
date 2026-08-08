/**
 * utils/asyncHandler.js -- makes async controllers safe.
 *
 * THE BUG THIS PREVENTS (important, and genuinely surprising)
 *
 * Express 4 does not understand Promises. Given this controller:
 *
 *     router.get('/items', async (req, res) => {
 *       const items = await db.query('SELECT ...')   // throws
 *       res.json(items)
 *     })
 *
 * ...if the query throws, the returned Promise rejects. Express
 * never sees it. The error middleware is never called. The client
 * gets NO response at all and simply hangs until it times out,
 * while the server logs an UnhandledPromiseRejection.
 *
 * The manual fix is a try/catch in every single controller:
 *
 *     try { ... } catch (err) { next(err) }
 *
 * That is ~15 identical blocks in this project, and it only takes
 * forgetting one to reintroduce the hang.
 *
 * THE FIX
 * Wrap the controller. Promise.resolve(...).catch(next) forwards
 * any rejection straight to Express's error handler.
 *
 *     router.get('/items', asyncHandler(async (req, res) => {
 *       const items = await db.query('SELECT ...')
 *       res.json(items)                      // no try/catch needed
 *     }))
 *
 * NOTE: Express 5 (which we use) does forward rejected promises
 * automatically. We keep asyncHandler anyway because it is explicit,
 * it costs nothing, and it keeps the code correct if it is ever run
 * on Express 4 -- which most tutorials and older CI images still use.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = asyncHandler
