/**
 * routes/dashboardRoutes.js -- the URL map for /api/dashboard.
 *
 * One route, and the whole file exists so that this line can be read
 * on its own:
 *
 *     router.get('/', protect, getDashboard)
 *
 * `protect` is not optional decoration here. Every number this
 * endpoint returns is private to one account, so without that
 * middleware the handler would run with req.user undefined and crash
 * on req.user.id -- a 500 rather than a leak, but only by luck.
 *
 * NO :id IN THE URL, ON PURPOSE.
 * The obvious design is GET /api/users/:id/dashboard, and it is a
 * trap: the id is then caller-supplied, and the server has to
 * remember to check it against the token on every single request.
 * Forget once and anyone can walk /1, /2, /3 through the whole user
 * table. With no id in the URL there is nothing to check and nothing
 * to forget -- the answer can only come from req.user.id. Secure
 * because of the shape of the URL, not because of a guard clause.
 */

const express = require('express')
const { getDashboard } = require('../controllers/dashboardController')
const protect = require('../middleware/protect')

const router = express.Router()

router.get('/', protect, getDashboard)

module.exports = router
