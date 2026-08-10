/**
 * routes/userRoutes.js -- the URL map for /api/users.
 *
 * EVERY ROUTE IN THIS FILE IS PROTECTED, and always will be: the
 * whole resource is "the account of whoever is asking". There is no
 * public view of a user, which is why there is no GET /api/users
 * listing everybody -- an endpoint that hands out the full user
 * table is a gift to anyone building a spam list, and nothing in the
 * app needs it. An item already carries its owner's display name.
 *
 * Note the shape: '/me/college', not '/:id/college'. See the long
 * note at the top of userController.js -- an id in the URL is a
 * field the caller can lie in, and this route writes.
 */

const express = require('express')
const { updateMyCollege } = require('../controllers/userController')
const protect = require('../middleware/protect')

const router = express.Router()

/* PUT, not POST: setting your college is IDEMPOTENT -- sending the
   same body twice leaves the account in exactly the state one send
   would have. POST implies "create another one", and there is only
   ever one college per user. It also means a retry after a dropped
   connection is safe, which POST cannot promise. */
router.put('/me/college', protect, updateMyCollege)

module.exports = router
