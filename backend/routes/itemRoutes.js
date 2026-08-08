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
 * handles it, readable at a glance. In Phase 8 the protected routes
 * gain middleware and the value becomes obvious:
 *
 *     router.post('/', protect, createItem)
 *     router.delete('/:id', protect, checkOwnership, deleteItem)
 *
 * The security rules for the whole resource are then visible in one
 * place, instead of buried inside handler bodies where a missing
 * `protect` is invisible during review.
 *
 * ROUTE ORDER MATTERS.
 * Express matches top to bottom and stops at the first hit, so
 * specific literal paths must come before dynamic ones. GET /mine is
 * registered above GET /:id for exactly that reason -- see the
 * comment on the route itself.
 */

const express = require('express')
const { getItems, getItemById, getMyItems } = require('../controllers/itemController')
const protect = require('../middleware/protect')

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

   Phase 8 adds the remaining protected routes:
     router.post('/',      protect, createItem)
     router.put('/:id',    protect, updateItem)
     router.delete('/:id', protect, deleteItem)
--------------------------------------------------------------- */
router.get('/mine', protect, getMyItems)

/* --- Public routes ---------------------------------------------
   Browsing needs no account: someone should be able to see what is
   available before deciding to register. Requesting an item is what
   requires a login, and that is Phase 10.
--------------------------------------------------------------- */
router.get('/', getItems)
router.get('/:id', getItemById)

module.exports = router
