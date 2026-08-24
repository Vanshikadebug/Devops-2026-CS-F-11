/**
 * middleware/authorize.js -- who is allowed to do what.
 *
 * protect.js answers "are you logged in?". This file answers the next
 * question: "and may you do THIS?". Keeping them separate matters,
 * because they fail differently -- 401 means come back with
 * credentials, 403 means your credentials are fine and the answer is
 * still no.
 *
 * >>> THIS IS THE FILE THAT MAKES THE ADMIN PANEL SECURE <<<
 * The React app has an AdminProtectedRoute that redirects a
 * non-admin away from /admin. That is a courtesy, not a defence. It
 * runs on the user's own machine, in JavaScript they can edit, against
 * a `user.role` value they can rewrite in localStorage. Someone who
 * wants in does not use the React app at all:
 *
 *     curl -H "Authorization: Bearer <a real user token>" \
 *          -X DELETE http://localhost:5000/api/admin/users/1
 *
 * No route guard, no hidden menu item and no disabled button has any
 * effect on that request. This middleware does, because it runs on the
 * server, and the role it reads comes from a database row keyed by an
 * id inside a signature the client cannot forge.
 *
 * THE ROLES, in increasing power (see users.role in schema.sql):
 *
 *   user         the ordinary account. No admin access whatsoever.
 *   moderator    may review and hide listings, and handle reports.
 *                May NOT touch accounts, locations or settings.
 *   admin        the working administrator: accounts, listings,
 *                locations, colleges, reports, settings.
 *   super_admin  additionally may GRANT AND REVOKE ROLES.
 *
 * >>> WHY FOUR, WHEN THE BRIEF SAID NOT TO OVERCOMPLICATE? <<<
 * Because the alternative is worse, not simpler. With one admin role,
 * the person you trust to hide a spam listing is the same person who
 * can delete every account on the site, and "let a helper moderate"
 * means handing over total control. The complexity here is ONE ordered
 * array and one comparison; the complexity avoided is an
 * authorisation model that cannot express the thing you actually want.
 */

const ApiError = require('../utils/ApiError')
const { ROLES } = require('../models/userModel')

/* Rank by position in the ROLES array, which is ordered weakest to
   strongest. Reading the order from ONE list means "is at least an
   admin" is a comparison rather than a hand-maintained set of
   equality checks -- the kind that gets a new role added to two of
   its three copies. */
const RANK = Object.fromEntries(ROLES.map((role, index) => [role, index]))

/** True if `role` is at least as powerful as `minimum`. */
function atLeast(role, minimum) {
  /* An unrecognised role -- '' from a truncated ENUM write, or
     undefined because a caller forgot protect -- has rank -1, which is
     below everything. The check FAILS CLOSED. That direction is not an
     accident: the opposite convention, treating unknown as trusted,
     turns every bug in this area into a privilege escalation. */
  const have = RANK[role] ?? -1
  return have >= RANK[minimum]
}

/**
 * Route guard factory: `authorize('admin')` returns middleware that
 * lets through admin and super_admin, and refuses everyone else.
 *
 * Used as a sentence in the route table, which is the whole point:
 *
 *     router.delete('/users/:id', protect, authorize('admin'), remove)
 *
 * A reviewer can see the requirement without opening the controller.
 */
function authorize(minimumRole = 'admin') {
  /* A typo in a route file -- authorize('adnim') -- would otherwise
     produce middleware that lets NOBODY through, on a route that looks
     guarded and silently 403s for the actual admin. Crashing at startup
     is far kinder than debugging that at 2am. Note this cannot be
     `!RANK[minimumRole]`: RANK.user is 0, which is falsy. */
  if (!ROLES.includes(minimumRole)) {
    throw new Error(
      `authorize: "${minimumRole}" is not a role. Expected one of ${ROLES.join(', ')}`,
    )
  }

  return function authorizeHandler(req, _res, next) {
    /* protect must have run first. If it has not, req.user is
       undefined and this refuses -- but a silent 403 on a route the
       developer believes is protected is a confusing bug, so say what
       is actually wrong. This branch is a programming error, never a
       user's fault, which is why the message is aimed at us. */
    if (!req.user) {
      return next(ApiError.unauthorized('You must be logged in to do that'))
    }

    if (!atLeast(req.user.role, minimumRole)) {
      /* >>> WHAT THIS MESSAGE DELIBERATELY DOES NOT SAY <<<
         It does not name the required role, and it does not confirm
         that the endpoint exists or what it manages. A probing user
         learns only that they may not have it. Compare "You need the
         super_admin role to change roles" -- helpful to the one
         legitimate admin who already knows, and a free map of the
         privilege model to everyone else. */
      return next(ApiError.forbidden('You do not have permission to do that'))
    }

    return next()
  }
}

/**
 * The three guards the route files actually use, named so the
 * intention reads out loud and so the minimum for a given area of the
 * panel is decided HERE rather than restated at forty call sites.
 *
 * `requireStaff` is the moderation floor -- anyone with a job to do in
 * the panel. `requireAdmin` is the administrative floor.
 * `requireSuperAdmin` guards precisely one thing, below.
 */
const requireStaff = authorize('moderator')
const requireAdmin = authorize('admin')

/* >>> WHY CHANGING ROLES IS THE ONE super_admin-ONLY POWER <<<
   Because it is the power that grants every other power, including
   itself. An `admin` who could promote would be able to make
   themselves super_admin, at which point the distinction between the
   two roles is decorative and the whole ladder collapses into "anyone
   with any admin access has all access". Granting authority has to sit
   strictly above using it. */
const requireSuperAdmin = authorize('super_admin')

/**
 * True if this user has any business in the admin panel at all.
 * Exported for the places that need the ANSWER rather than a gate --
 * the login response telling the frontend whether to render the Admin
 * link, and the item controller deciding whether a hidden listing is
 * visible to whoever is asking.
 */
function isStaff(user) {
  return Boolean(user) && atLeast(user.role, 'moderator')
}

module.exports = {
  authorize,
  requireStaff,
  requireAdmin,
  requireSuperAdmin,
  isStaff,
  atLeast,
  RANK,
}
