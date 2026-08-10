/**
 * middleware/checkItemOwnership.js -- "is this yours?"
 *
 * >>> THIS FILE IS THE SECURITY BOUNDARY FOR EVERY ITEM WRITE <<<
 *
 * protect.js answers WHO ARE YOU. This answers MAY YOU TOUCH THIS
 * PARTICULAR ROW. They are different questions, and a logged-in user
 * passing the first one tells you nothing about the second: Priya has
 * a perfectly valid token, and she still may not delete Aarav's
 * calculator.
 *
 * The frontend will hide Edit and Delete on items you do not own.
 * That is good design and it protects nothing -- the buttons are a
 * suggestion in a program running on the attacker's own computer.
 * Anyone can send:
 *
 *     curl -X DELETE http://localhost:5000/api/items/2 \
 *          -H "Authorization: Bearer <their own valid token>"
 *
 * That request never loads a line of our JavaScript. This middleware
 * is the only thing standing between it and someone else's data.
 *
 * =================================================================
 * WHY OWNERSHIP IS MIDDLEWARE AND NOT A LINE IN EACH CONTROLLER
 * =================================================================
 * The check could be three lines at the top of updateItem,
 * deleteItem and updateItemStatus. It would work, and it would be
 * three copies of the most safety-critical logic in the project.
 *
 * The failure mode of copies is not that one is written wrongly --
 * it is that a fourth write endpoint gets added later and nobody
 * remembers there was a check to copy. A missing line inside a
 * function body is invisible; a missing word in the route table
 *
 *     router.delete('/:id', protect, checkItemOwnership, deleteItem)
 *
 * is something you can see at a glance, and see the absence of. The
 * router becomes a readable list of who may do what.
 *
 * =================================================================
 * 404 vs 403 -- WHY BOTH, AND WHY THIS WAY ROUND
 * =================================================================
 * Two different failures, deliberately given different answers:
 *
 *   404  there is no item with that id
 *   403  it exists, and it is not yours
 *
 * There is a real argument for answering 404 in BOTH cases. A 403
 * confirms that item 57 exists, so an attacker can walk the id space
 * and learn how many items the site holds -- a resource enumeration
 * leak. Some APIs (GitHub's private repositories, most notably) hide
 * everything behind 404 for exactly that reason.
 *
 * This project answers 403, on purpose:
 *
 *  - The existence of an item is ALREADY PUBLIC. GET /api/items and
 *    GET /api/items/:id are unauthenticated -- the whole point is a
 *    browsable catalogue. Hiding existence from the delete endpoint
 *    while listing it on the home page protects nothing at all.
 *  - The two messages help the honest user, who is the common case.
 *    "You cannot edit an item you did not list" is actionable; a 404
 *    for an item they are looking at on screen reads as a bug and
 *    generates a support question.
 *
 * The rule worth carrying away: 403-vs-404 is a judgement about what
 * is already public, not a default. If items were private, this
 * would return 404 for both.
 */

const itemModel = require('../models/itemModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

const checkItemOwnership = asyncHandler(async (req, _res, next) => {
  /* --- 1. The id must be an id --------------------------------
     Route parameters are always strings and a user can type
     anything. Without this, 'abc' reaches MySQL, which coerces it to
     0, matches nothing, and we answer "no such item" to a request
     that was never valid in the first place -- a misleading answer,
     and a pointless query. The same check as getItemById, for the
     same reasons. */
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Item id must be a positive whole number')
  }

  /* --- 2. One column, not the whole row -----------------------
     findOwnerId is a primary-key lookup of a single integer, not the
     four-table join findById performs. This runs before every write,
     so it is worth being the cheap query. */
  const ownerId = await itemModel.findOwnerId(id)

  if (ownerId === null) {
    throw ApiError.notFound(`No item found with id ${id}`)
  }

  /* --- 3. THE COMPARISON THAT MATTERS -------------------------
     req.user.id was set by protect.js from a VERIFIED TOKEN
     SIGNATURE. It is not read from the body, the query string, a
     header, or the URL -- there is nowhere in this request for the
     caller to state who they are.

     That is what makes the check meaningful. A version that trusted
     a body field:
         if (item.user_id !== req.body.userId)     // WRONG
     compares the owner against a number the attacker chose, and
     passes for everyone.

     `!==` and not `!=`: both sides are numbers here (mysql2 returns
     INT UNSIGNED as a JS number, and protect loads req.user from the
     database), but strict equality means a future change that makes
     one of them a string fails loudly instead of matching '3' to 3
     and quietly authorising the wrong person. */
  if (ownerId !== req.user.id) {
    throw ApiError.forbidden('You can only change items you listed yourself')
  }

  /* --- 4. Hand the verified id onward -------------------------
     The controller now knows two things without repeating any work:
     the item exists, and it belongs to the caller. Passing the
     PARSED number means the controller never re-parses req.params.id
     -- and cannot accidentally re-parse it differently. */
  req.itemId = id
  next()
})

module.exports = checkItemOwnership
