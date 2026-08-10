/**
 * routes/itemRoutes.js -- the URL map for everything under /api/items.
 *
 * WHAT IS A ROUTER?
 * A mini Express app that handles one group of URLs. app.js mounts it
 * with:
 *
 *     app.use('/api/items', itemRoutes)
 *
 * The mount path is stripped before the router sees the request, so
 * '/' below means '/api/items' and '/:id' means '/api/items/7'. The
 * prefix is written once. If the API were ever versioned to
 * /api/v1/items, that is a one-line change in app.js.
 *
 * WHY A SEPARATE FILE FROM THE CONTROLLER?
 * This file is a table of contents: every URL, its method, and who
 * handles it, readable at a glance. Now that Phase 8 has added the
 * write routes, the value is concrete -- the security rules for the
 * entire resource are visible in one screen:
 *
 *     router.post('/',           protect, ..., createItem)
 *     router.delete('/:id',      protect, checkItemOwnership, deleteItem)
 *
 * A missing `protect` is something you can SEE here. Buried inside a
 * handler body, its absence is invisible during review, which is
 * exactly how unprotected endpoints ship.
 *
 * ROUTE ORDER MATTERS.
 * Express matches top to bottom and stops at the first hit, so
 * specific literal paths must come before dynamic ones. GET /mine is
 * registered above GET /:id for exactly that reason -- see the
 * comment on the route itself.
 */

const express = require('express')
const {
  getItems,
  getItemById,
  getMyItems,
  createItem,
  updateItem,
  updateItemStatus,
  deleteItem,
} = require('../controllers/itemController')
const { createRules, updateRules, statusRules } = require('../validators/itemValidators')
const validate = require('../middleware/validate')
const protect = require('../middleware/protect')
const checkItemOwnership = require('../middleware/checkItemOwnership')

const router = express.Router()

/* --- Protected route, and it MUST come first -------------------
   >>> THIS ORDERING IS A REAL BUG WAITING TO HAPPEN <<<
   Express takes the FIRST route that matches. '/:id' is a wildcard,
   so it happily matches the literal text "mine" -- meaning if these
   two lines were swapped, a request to /api/items/mine would run
   getItemById with req.params.id === 'mine'.

   The failure is nasty because it is not a crash. getItemById would
   reject 'mine' as a non-numeric id and answer:

       400  "Item id must be a positive whole number"

   ...for a URL that has no id in it at all. You would read that
   message and go looking for the bug in the dashboard's fetch call,
   which is entirely correct. Registered in this order, it cannot
   happen.
--------------------------------------------------------------- */
router.get('/mine', protect, getMyItems)

/* --- Public routes ---------------------------------------------
   Browsing needs no account: someone should be able to see what is
   available before deciding to register. Requesting an item is what
   requires a login, and that is Phase 10.
--------------------------------------------------------------- */
router.get('/', getItems)
router.get('/:id', getItemById)

/* ===============================================================
   WRITES -- every one of them behind `protect`
   ===============================================================
   >>> READ THE MIDDLEWARE CHAINS AS SENTENCES <<<
   Each line below says, left to right, exactly what must be true
   before the handler runs. That is the entire point of putting them
   here rather than inside the controllers:

     protect              you are logged in         (401 otherwise)
     checkItemOwnership   this row is yours         (404 / 403)
     createRules          the body has valid shape
     validate             ...or stop with one 400

   ORDER WITHIN THE CHAIN IS DELIBERATE, not stylistic. Ownership is
   checked BEFORE validation on the update routes, so a stranger
   probing someone else's item gets 403 rather than a 400 that
   quietly confirms which fields the resource has. Cheapest, most
   secure rejection first.

   Creation has no ownership step because there is no existing row to
   own -- the owner is req.user.id, and the body is never asked.
=============================================================== */
router.post('/', protect, createRules, validate, createItem)

router.put('/:id', protect, checkItemOwnership, updateRules, validate, updateItem)

/* PATCH, not PUT: the body is one field out of eight, which is a
   partial modification by definition. See the note on
   updateItemStatus in the controller. */
router.patch('/:id/status', protect, checkItemOwnership, statusRules, validate, updateItemStatus)

router.delete('/:id', protect, checkItemOwnership, deleteItem)

module.exports = router
