/**
 * controllers/itemController.js -- turns HTTP requests into responses.
 *
 * WHAT IS A CONTROLLER?
 * The translator between the web and the application. It reads the
 * request, asks the model for data, and chooses the status code and
 * JSON to send back. It contains no SQL, and the model contains no
 * knowledge of HTTP. Each layer can then be understood on its own.
 *
 * PHASE 5 SCOPE: READ ONLY.
 * Two endpoints, both public, both harmless -- listing items and
 * viewing one. Creating, editing and deleting items need a logged-in
 * user and ownership checks, so they wait for Phase 8, after Phase 6
 * builds authentication. Adding a write endpoint now would mean
 * either an unprotected one (anyone on the network could delete your
 * data) or dead code guarding an identity that does not exist yet.
 *
 * WHY IS EVERY HANDLER WRAPPED IN asyncHandler?
 * If MySQL goes down mid-query, the await rejects. Unwrapped, that
 * rejection escapes into nowhere and the browser hangs with no
 * response at all. asyncHandler forwards it to errorHandler, which
 * returns a clean 500. See utils/asyncHandler.js.
 */

const itemModel = require('../models/itemModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/* ---------------------------------------------------------------
   READING THE QUERY STRING
   ---------------------------------------------------------------
   Everything in req.query is a string typed by somebody, and these
   two helpers turn that into either a value the model can trust or a
   400. Nothing reaches itemModel.findAll() unvalidated.

   >>> WHY AN UNKNOWN VALUE IS REJECTED RATHER THAN IGNORED <<<
   The tempting alternative is to drop a filter we do not recognise
   and answer with whatever the remaining filters give. That is worse
   than an error, because the response looks completely normal. A
   typo in ?category=Bookss would return EVERY category while the
   heading still read "Books", and the person reading the screen has
   no way to tell. An explicit 400 naming the allowed values is a
   dead end you can act on.
--------------------------------------------------------------- */

/** A positive integer, or a 400. Absent and empty both mean "no filter". */
function optionalId(value, label) {
  if (value === undefined || value === '') return undefined

  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.badRequest(`${label} must be a positive whole number`)
  }
  return n
}

/** One of `allowed`, or a 400 that lists what was allowed. */
function optionalEnum(value, allowed, label) {
  if (value === undefined || value === '') return undefined

  if (!allowed.includes(value)) {
    throw ApiError.badRequest(
      `${label} must be one of: ${allowed.join(', ')}`,
    )
  }
  return value
}

/**
 * GET /api/items -- list items, optionally filtered.
 *
 * Supported query parameters, all optional:
 *
 *   ?college=4        items at one campus
 *   ?area=1           items at any college in one locality
 *   ?city=1           items at any college in one city
 *   ?search=calc      substring of the name or description
 *   ?category=Books   one category
 *   ?condition=Good   one condition
 *   ?status=Available one status
 *   ?sort=newest      newest | oldest | name
 *   ?limit=6          1..100, clamped by the model
 *
 * >>> CALLING IT WITH NO PARAMETERS BEHAVES EXACTLY AS BEFORE <<<
 * Every filter is undefined, the model builds no WHERE clause, and
 * the response is the full list newest-first -- byte for byte what
 * Phase 5 returned. That is deliberate: this endpoint already has
 * callers, and a filter feature that changes the unfiltered answer
 * is a breaking change wearing a feature's clothes.
 *
 * In particular the default is NOT "available items only". Hiding
 * the unavailable ones would be a defensible product decision and a
 * silent behaviour change, so it is left to the caller, which asks
 * for ?status=Available when it wants it.
 *
 * WHY THE { success, count, data } ENVELOPE INSTEAD OF A BARE ARRAY?
 * Returning `[...]` directly seems simpler, but it leaves no room to
 * add anything later. Paging needs to send its info alongside the
 * rows; with a bare array there is nowhere to put it without
 * breaking every existing caller. The envelope also matches the
 * error shape from errorHandler.js, so the frontend has exactly one
 * rule: read `success`, then read `data` or `message`.
 */
const getItems = asyncHandler(async (req, res) => {
  const { search } = req.query

  const filters = {
    college: optionalId(req.query.college, 'college'),
    area: optionalId(req.query.area, 'area'),
    city: optionalId(req.query.city, 'city'),
    category: optionalEnum(req.query.category, itemModel.CATEGORIES, 'category'),
    condition: optionalEnum(req.query.condition, itemModel.CONDITIONS, 'condition'),
    status: optionalEnum(req.query.status, itemModel.STATUSES, 'status'),
    sort: optionalEnum(req.query.sort, itemModel.SORT_KEYS, 'sort'),
    limit: req.query.limit,

    /* Trimmed, because a search box sends the spaces around what was
       typed and ' laptop ' should find the same rows as 'laptop'.
       A term that is nothing BUT spaces trims to '', which is falsy,
       so the model skips the clause entirely rather than searching
       for the empty string and matching every row. */
    search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
  }

  const items = await itemModel.findAll(filters)

  res.status(200).json({
    success: true,
    count: items.length,
    data: items,
  })
})

/**
 * GET /api/items/:id -- one item.
 *
 * THE VALIDATION HERE IS NOT BUSY-WORK.
 * URL parameters are always strings, and a user can type anything.
 * /api/items/abc would reach MySQL as the string 'abc'; MySQL coerces
 * it to 0, matches nothing, and we would answer 404 -- which is a
 * misleading answer to a malformed request. Checking first lets us
 * say 400 "that is not a valid id", which is the truth, and it keeps
 * a pointless query off the database.
 *
 * Number.isInteger(Number(x)) rejects 'abc', '1.5' and '' but accepts
 * '7'. The `> 0` matters too: ids are UNSIGNED in the schema, so a
 * negative id is not merely absent, it is impossible.
 */
const getItemById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Item id must be a positive whole number')
  }

  const item = await itemModel.findById(id)

  // The model reports "no such row" as null. Turning that into a 404
  // is the controller's decision, because status codes are HTTP.
  if (!item) {
    throw ApiError.notFound(`No item found with id ${id}`)
  }

  res.status(200).json({
    success: true,
    data: item,
  })
})

/**
 * GET /api/items/mine -- the logged-in user's own items.
 *
 * >>> WHY THERE IS NO :id IN THIS URL <<<
 * The obvious alternative is GET /api/users/:id/items, and it is a
 * trap. The moment the id is in the URL, the server has to decide
 * whether the caller is allowed to read that id -- and forgetting
 * that check means anyone can enumerate /api/users/1/items,
 * /api/users/2/items and read the whole site user by user.
 *
 * "mine" cannot be wrong. There is no id to tamper with: the answer
 * comes from req.user.id, which protect.js set from a verified token
 * signature. A caller cannot ask for someone else's items because
 * the URL gives them nowhere to say whose items they want.
 *
 * This route is registered with `protect`, so req.user is guaranteed
 * to exist by the time this function runs -- there is no need to
 * check for it here.
 *
 * ?limit=N is honoured for the dashboard, which wants only the newest
 * few. The model clamps it; the controller does not need to.
 */
const getMyItems = asyncHandler(async (req, res) => {
  const items = await itemModel.findByUser(req.user.id, {
    limit: req.query.limit,
  })

  res.status(200).json({
    success: true,
    count: items.length,
    data: items,
  })
})

module.exports = { getItems, getItemById, getMyItems }
