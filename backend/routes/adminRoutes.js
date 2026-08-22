/**
 * routes/adminRoutes.js -- the URL map for /api/admin.
 *
 * Mounted in app.js as:
 *     app.use('/api/admin', adminRoutes)
 *
 * >>> THE WHOLE ROUTER IS BEHIND protect, APPLIED ONCE <<<
 * `router.use(protect)` runs before every handler below, so there is no
 * admin route -- now or added later -- that can forget it. The feature
 * routers elsewhere repeat `protect` on each line because only some of
 * their routes need it; here EVERY route needs a login and then some, so
 * stating it once is both less error-prone and a truer description of
 * the area: nothing in the admin panel is public.
 *
 * The per-route guard is the MINIMUM rank for that action, and it reads
 * as a sentence so the requirement is visible without opening the
 * controller:
 *
 *   overview            requireStaff        moderators and up may look
 *   users list/detail   requireAdmin        managing accounts is admin work
 *   block / unblock     requireAdmin
 *   change role         requireSuperAdmin   the power that grants powers
 *
 * These guards run AFTER protect (they read req.user.role, which protect
 * loads), which is exactly the order `router.use(protect)` then the
 * per-route guard produces.
 */

const express = require('express')
const {
  getOverview,
  listUsers,
  getUser,
  setUserStatus,
  setUserRole,
} = require('../controllers/adminController')
const { statusRules, roleRules } = require('../validators/adminValidators')
const validate = require('../middleware/validate')
const protect = require('../middleware/protect')
const {
  requireStaff,
  requireAdmin,
  requireSuperAdmin,
} = require('../middleware/authorize')

const router = express.Router()

// Everything past this line requires a valid, non-blocked login.
router.use(protect)

/* The dashboard snapshot -- the one place a plain moderator is allowed. */
router.get('/overview', requireStaff, getOverview)

/* Account management. The list and the detail view are read-only but
   still administrative: they surface every account and its activity, so
   they sit at requireAdmin, not requireStaff. */
router.get('/users', requireAdmin, listUsers)
router.get('/users/:id', requireAdmin, getUser)

/* Blocking is reversible and admin-level. Changing a role is neither,
   and is the single super_admin-only power on this router. Both carry a
   body, so both run their validator then `validate` before the
   controller -- the same create-rules-then-validate shape every other
   write route uses. */
router.patch('/users/:id/status', requireAdmin, statusRules, validate, setUserStatus)
router.patch('/users/:id/role', requireSuperAdmin, roleRules, validate, setUserRole)

module.exports = router
