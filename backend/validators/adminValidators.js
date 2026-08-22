/**
 * validators/adminValidators.js -- the bodies for the two admin
 * mutations that carry one, and nothing else.
 *
 * WHAT IS AND IS NOT HERE
 * Only the WRITES have a body to validate: PATCH /users/:id/status
 * carries a status, PATCH /users/:id/role carries a role. The reads
 * (GET /users, GET /users/:id, GET /overview) have no body -- their
 * inputs are the URL id, checked in the controller with the same
 * Number.isInteger guard the item and request controllers use, and the
 * query filters, which the model treats leniently on purpose (an
 * unknown ?sort= falls back to newest rather than 400ing a stale
 * bookmark -- see userModel.USER_SORTS).
 *
 * WHY THE ALLOWED VALUES COME FROM userModel, NOT A LITERAL HERE
 * `isIn(userModel.STATUSES)` and `isIn(userModel.ROLES)` check against
 * the very arrays the model builds its SQL from, which are themselves
 * mirrors of the ENUMs in schema.sql. A hand-typed ['active','blocked']
 * here would be a fourth copy of that list, and the day someone adds a
 * role to the ENUM and the model, this validator would start rejecting
 * a value the database is perfectly happy to store.
 *
 * These rules only decide that the value is WELL FORMED. Whether this
 * particular admin may apply it to this particular account -- not to
 * themselves, not to a peer or a superior -- is a question the
 * validator cannot answer, because it sees the body alone and not who
 * is asking or who they are asking about. That lives in the controller.
 */

const { body } = require('express-validator')
const userModel = require('../models/userModel')

/* PATCH /api/admin/users/:id/status
   `exists({ values: 'falsy' })` so '' and null are rejected as missing
   rather than falling through to isIn and producing the more confusing
   "must be one of active, blocked" for a field that was simply left
   empty -- the same spelling requestValidators uses for its required
   fields. */
const statusRules = [
  body('status')
    .exists({ values: 'falsy' }).withMessage('Status is required')
    .isIn(userModel.STATUSES)
    .withMessage(`Status must be one of: ${userModel.STATUSES.join(', ')}`),
]

/* PATCH /api/admin/users/:id/role */
const roleRules = [
  body('role')
    .exists({ values: 'falsy' }).withMessage('Role is required')
    .isIn(userModel.ROLES)
    .withMessage(`Role must be one of: ${userModel.ROLES.join(', ')}`),
]

module.exports = { statusRules, roleRules }
