/**
 * validators/adminValidators.js -- the bodies for the admin mutations
 * that carry one, and nothing else.
 *
 * WHAT IS AND IS NOT HERE
 * Only the WRITES have a body to validate: PATCH /users/:id/status
 * carries a status, PATCH /users/:id/role carries a role, and
 * PATCH /items/:id/moderation carries a moderation_status (and,
 * sometimes, a reason). The reads (GET /users, GET /users/:id,
 * GET /items, GET /items/:id, GET /overview) have no body -- their
 * inputs are the URL id, checked in the controller with the same
 * Number.isInteger guard the item and request controllers use, and the
 * query filters, which the model treats leniently on purpose (an
 * unknown ?sort= falls back to newest rather than 400ing a stale
 * bookmark -- see userModel.USER_SORTS and itemModel.ADMIN_SORTS).
 *
 * WHY THE ALLOWED VALUES COME FROM THE MODELS, NOT A LITERAL HERE
 * `isIn(userModel.STATUSES)`, `isIn(userModel.ROLES)` and
 * `isIn(itemModel.MODERATION_STATUSES)` all check against the very
 * arrays the models build their SQL from, which are themselves mirrors
 * of the ENUMs in schema.sql. A hand-typed ['active','blocked'] here
 * would be a fourth copy of that list, and the day someone adds a role
 * to the ENUM and the model, this validator would start rejecting a
 * value the database is perfectly happy to store.
 *
 * These rules only decide that the value is WELL FORMED. Whether this
 * particular admin may apply it to this particular account -- not to
 * themselves, not to a peer or a superior -- is a question the
 * validator cannot answer, because it sees the body alone and not who
 * is asking or who they are asking about. That lives in the controller.
 */

const { body } = require('express-validator')
const userModel = require('../models/userModel')
const itemModel = require('../models/itemModel')

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

/* PATCH /api/admin/items/:id/moderation
   The body key is `moderation_status`, NOT `status`. An item already has
   a `status` -- Available / Reserved / Unavailable, the owner's column --
   and calling this one `status` too would collapse in the request body
   the exact distinction schema.sql and itemModel keep apart at length:
   one column is "can I still get this?", the other is "may the public see
   it?". The name states which one this endpoint touches.

   The reason is TWO rules on the same field, because it plays two roles:

     1. Whenever a reason is present -- for a hide, or an optional note on
        any decision -- it is capped to moderation_reason's column width
        (VARCHAR(500)). Without this a 600-character note reaches MySQL,
        which in strict mode answers ER_DATA_TOO_LONG and errorHandler
        reports a generic 500 for what is really a bad request.

     2. For a REJECTION specifically, a reason is REQUIRED. This is not a
        stylistic choice -- schema.sql spells it out on the column itself:
        "Rejecting without a reason is not a moderation decision, it is a
        disappearance." The owner is shown this text; a rejection with
        nothing to show is a listing that vanishes with no way to fix it.
        The `.if()` fires only when moderation_status is exactly
        'Rejected', so approving, hiding and requeuing stay reason-optional. */
const moderationRules = [
  body('moderation_status')
    .exists({ values: 'falsy' }).withMessage('Moderation status is required')
    .isIn(itemModel.MODERATION_STATUSES)
    .withMessage(`Moderation status must be one of: ${itemModel.MODERATION_STATUSES.join(', ')}`),

  body('reason')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Reason must be at most 500 characters'),

  body('reason')
    .if(body('moderation_status').equals('Rejected'))
    .exists({ values: 'falsy' }).withMessage('A reason is required when rejecting an item'),
]

module.exports = { statusRules, roleRules, moderationRules }
