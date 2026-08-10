/**
 * controllers/itemController.js -- turns HTTP requests into responses.
 *
 * WHAT IS A CONTROLLER?
 * The translator between the web and the application. It reads the
 * request, asks the model for data, and chooses the status code and
 * JSON to send back. It contains no SQL, and the model contains no
 * knowledge of HTTP. Each layer can then be understood on its own.
 *
 * PHASE 5 BUILT THE READ HALF. PHASE 8 ADDED THE WRITE HALF.
 * The two public GETs came first, deliberately: creating, editing
 * and deleting need a logged-in user and an ownership check, so they
 * had to wait for Phase 6 to build authentication. Adding a write
 * endpoint before that would have meant either an unprotected one --
 * anyone on the network could delete your data -- or dead code
 * guarding an identity that did not exist yet.
 *
 * The write handlers begin at "THE WRITE ENDPOINTS" below. None of
 * them contains an authorisation check, because authorisation is
 * decided in middleware before they run; see routes/itemRoutes.js.
 *
 * WHY IS EVERY HANDLER WRAPPED IN asyncHandler?
 * If MySQL goes down mid-query, the await rejects. Unwrapped, that
 * rejection escapes into nowhere and the browser hangs with no
 * response at all. asyncHandler forwards it to errorHandler, which
 * returns a clean 500. See utils/asyncHandler.js.
 */

const itemModel = require('../models/itemModel')
const locationModel = require('../models/locationModel')
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

/* ===============================================================
   THE WRITE ENDPOINTS
   ===============================================================
   Four handlers, all reached only through `protect`, and three of
   them only through `checkItemOwnership` as well. See routes/
   itemRoutes.js -- the guards are visible there rather than buried
   in these function bodies.

   >>> WHERE `location` COMES FROM, AND WHY NOT FROM THE CLIENT <<<

   This is the one genuinely interesting decision in the phase, and
   it comes straight out of the schema: items.college_id is NULLABLE
   but items.location is NOT NULL. So every item must produce a human
   sentence about where it is, whether or not it has a campus.

   The obvious implementation accepts both fields from the form and
   stores what it is given. It is wrong, and the reason is worth
   understanding, because the same shape of bug recurs everywhere:

       { collegeId: 4, location: "Kota" }

   Item 4 is SKIT Jaipur. Nothing rejects this -- both fields are
   individually valid -- so the row is stored with a college_id that
   filters it into Jagatpura and a location that PRINTS as Kota. The
   filter and the label now disagree, permanently, and no error was
   ever raised. Someone browsing Kota never sees it; someone who
   finds it at SKIT is told to travel 250km.

   THE RULE: a value that can be DERIVED from another stored value
   must be derived, not accepted. When collegeId is present the
   location text is built from the college's own area and city, and
   whatever the client sent in `location` is discarded. The free-text
   field is only consulted when there is no college -- which is
   exactly the case the column exists to cover.

   This also means the two fields can never contradict each other,
   rather than merely being unlikely to.
=============================================================== */

/**
 * Works out what to store in college_id and location, together.
 *
 * Returns { collegeId, location } or throws a 400/404. Shared by
 * create and update so the two cannot diverge -- if only create
 * derived the text, editing an item would be a way to reintroduce
 * exactly the mismatch described above.
 *
 * `collegeId` has already been through the validator, so it is
 * either a positive integer, null, or undefined by the time it
 * arrives here.
 */
async function resolvePlace({ collegeId, location }) {
  /* --- On campus ------------------------------------------------
     The id is checked against the directory BEFORE the write. The
     foreign key would reject an unknown id anyway, so this lookup is
     not what makes it safe -- the database is. It is what makes the
     failure legible: without it the caller gets errorHandler's
     generic mapping of ER_NO_REFERENCED_ROW_2, "Referenced record
     does not exist", which names neither the field nor the value.
     One indexed read buys a message that says which college. */
  if (collegeId !== undefined && collegeId !== null) {
    const college = await locationModel.findCollegeById(collegeId)

    if (!college) {
      throw ApiError.notFound(`No college found with id ${collegeId}`)
    }

    return {
      collegeId: college.id,
      /* Built the same way seed-db.js builds it, so a seeded row and
         a user-created row are indistinguishable in the database.
         Two different formats for the same fact would show up as
         inconsistent card text with no obvious cause. */
      location: `${college.area_name}, ${college.city_name}`,
    }
  }

  /* --- Off campus -----------------------------------------------
     No college, so the text is the only thing this item has to say
     about where it is, and the column is NOT NULL. An item with
     neither is not a row the database will accept, and it is not
     information anyone could act on either -- "someone somewhere is
     giving away a chair" helps nobody. */
  const text = typeof location === 'string' ? location.trim() : ''

  if (!text) {
    throw ApiError.badRequest(
      'Choose a college, or type where the item can be collected',
    )
  }

  return { collegeId: null, location: text }
}

/**
 * Normalises an optional text field to a string or null.
 *
 * >>> WHY '' MUST BECOME null AND NOT STAY '' <<<
 * An empty <input> submits an empty string, so a form where the user
 * cleared the photo URL sends imageUrl: ''. Stored verbatim, the
 * column then holds '' rather than NULL -- and those are different
 * values that mean the same thing, which is how a column ends up
 * needing two checks forever.
 *
 * It also breaks the frontend in a specific way: ItemImage decides
 * whether to render a photo with `Boolean(item.image_url)`, and ''
 * is falsy, so it happens to work -- until some other component
 * writes `item.image_url !== null` and renders an <img src="">,
 * which browsers resolve to the PAGE's own URL and download the HTML
 * as an image. NULL means absent. One representation, everywhere.
 */
function emptyToNull(value) {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * POST /api/items -- list a new item.
 *
 * >>> THE OWNER IS NOT IN THE REQUEST BODY <<<
 * user_id comes from req.user.id, which protect.js derived from a
 * verified token signature. The validator does not accept a `userId`
 * field and this handler never reads one, so a body containing
 * "userId": 3 is ignored rather than obeyed. There is nowhere in
 * this request for a caller to list an item in someone else's name.
 *
 * 201, not 200: something now exists that did not before, and the
 * status code is how a caller knows that without inspecting the
 * body.
 */
const createItem = asyncHandler(async (req, res) => {
  const place = await resolvePlace(req.body)

  const item = await itemModel.create({
    userId: req.user.id,
    name: req.body.name,
    description: req.body.description,
    category: req.body.category,
    condition: req.body.condition,
    collegeId: place.collegeId,
    location: place.location,
    imageUrl: emptyToNull(req.body.imageUrl),
    // The schema defaults this to 'Available'; passing it explicitly
    // keeps the model's INSERT column list fixed rather than built
    // conditionally.
    status: req.body.status || 'Available',
  })

  res.status(201).json({
    success: true,
    message: 'Item listed',
    data: item,
  })
})

/**
 * PUT /api/items/:id -- replace an item you own.
 *
 * OWNERSHIP IS ALREADY PROVEN by the time this runs --
 * checkItemOwnership threw a 404 or 403 otherwise, and left the
 * parsed id on req.itemId. That is why there is no ownership check
 * in this function: adding one here would suggest the middleware
 * were optional.
 *
 * A FULL REPLACEMENT, not a patch -- see the note on updateRules in
 * validators/itemValidators.js for why "missing means unchanged" is
 * a worse contract than it looks on a form with nullable fields.
 */
const updateItem = asyncHandler(async (req, res) => {
  const place = await resolvePlace(req.body)

  const item = await itemModel.update(req.itemId, {
    name: req.body.name,
    description: req.body.description,
    category: req.body.category,
    condition: req.body.condition,
    collegeId: place.collegeId,
    location: place.location,
    imageUrl: emptyToNull(req.body.imageUrl),
    status: req.body.status || 'Available',
  })

  res.status(200).json({
    success: true,
    message: 'Item updated',
    data: item,
  })
})

/**
 * PATCH /api/items/:id/status -- mark reserved, available or gone.
 *
 * WHY PATCH RATHER THAN PUT?
 * PUT means "here is the complete new state of this resource". This
 * body is one field out of eight, so it is a partial modification,
 * which is precisely what PATCH is for. Using PUT here would also
 * make the two endpoints' contracts contradict each other -- one
 * treating a missing `name` as an error and the other as fine.
 *
 * WHY A SEPARATE ENDPOINT AT ALL?
 * Because this is the write the app performs most: one click on a
 * card that says "mark as given away". Routing it through PUT would
 * force any list page to hold every field of every item just to
 * toggle an enum, and would make an accidental overwrite of the
 * description possible from a button that has nothing to do with it.
 */
const updateItemStatus = asyncHandler(async (req, res) => {
  const item = await itemModel.updateStatus(req.itemId, req.body.status)

  res.status(200).json({
    success: true,
    message: `Item marked ${req.body.status}`,
    data: item,
  })
})

/**
 * DELETE /api/items/:id -- remove an item you own.
 *
 * >>> THIS ALSO DELETES EVERY REQUEST FOR THE ITEM <<<
 * requests.item_id carries ON DELETE CASCADE, so the pending
 * requests go with it. That is the right outcome -- a request to
 * collect something that no longer exists is not actionable -- but
 * it is a real consequence of one statement, and the frontend
 * confirms before calling this for that reason.
 *
 * WHY 200 WITH A BODY RATHER THAN 204 NO CONTENT?
 * 204 is the more orthodox answer to a successful DELETE. This API
 * answers 200 with the standard envelope because every other
 * endpoint does, and the frontend's api.js REQUIRES a JSON body --
 * it throws "the server replied with something that was not JSON"
 * when a 2xx response has none. Consistency across the API is worth
 * more here than strict adherence to the most orthodox status code,
 * and this is a decision, not an oversight.
 *
 * The `deleted` flag can only be false in a genuine race: the
 * ownership middleware found the row a moment ago, so a false here
 * means someone else deleted it in between. 404 is the honest
 * answer.
 */
const deleteItem = asyncHandler(async (req, res) => {
  const deleted = await itemModel.remove(req.itemId)

  if (!deleted) {
    throw ApiError.notFound(`No item found with id ${req.itemId}`)
  }

  res.status(200).json({
    success: true,
    message: 'Item deleted',
    data: { id: req.itemId },
  })
})

module.exports = {
  getItems,
  getItemById,
  getMyItems,
  createItem,
  updateItem,
  updateItemStatus,
  deleteItem,
}
