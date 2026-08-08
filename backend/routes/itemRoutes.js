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
 * specific literal paths must come before dynamic ones. In Phase 8,
 * GET /mine has to be registered above GET /:id -- otherwise ':id'
 * matches the text "mine" and the wrong handler runs. Noting it here
 * because the bug is subtle and produces a confusing 400 rather than
 * an obvious failure.
 */

const express = require('express')
const { getItems, getItemById } = require('../controllers/itemController')

const router = express.Router()

/* --- Public routes ---------------------------------------------
   Browsing needs no account: someone should be able to see what is
   available before deciding to register. Requesting an item is what
   requires a login, and that is Phase 10.

   Phase 8 adds the protected routes here:
     router.post('/',        protect, createItem)
     router.put('/:id',      protect, updateItem)
     router.delete('/:id',   protect, deleteItem)
--------------------------------------------------------------- */
router.get('/', getItems)
router.get('/:id', getItemById)

module.exports = router
