/**
 * validators/reportValidators.js -- the body for filing a report.
 *
 * A report names EXACTLY ONE target: an item OR a user, never both and
 * never neither. That rule is ultimately guaranteed by two triggers in
 * schema.sql and re-checked in reportModel.create, but catching it HERE
 * turns "exactly one target" into a clean 400 at the edge instead of a
 * 500 surfacing from a trigger's SQLSTATE 45000 -- the same reason the
 * admin validators check ENUM membership before the model does.
 *
 * WHY THE REASON LIST COMES FROM THE MODEL
 * `isIn(reportModel.REASONS)` checks against the very array reportModel
 * and schema.sql's ENUM are built from, so a hand-typed copy here could
 * not drift out of step the day a reason is added to the ENUM.
 *
 * Lengths match the columns: reports.details is VARCHAR(1000).
 */

const { body } = require('express-validator')
const reportModel = require('../models/reportModel')

/* "Did the caller send this field with a real, usable value?" -- every
   FALSY value counts as absent: undefined, null, '' AND the number 0. The
   '' case keeps an empty target field (a form filing a USER report may
   send itemId: '') from being mistaken for "present"; the 0 case is the
   subtle one. The id rules above are `.optional({ values: 'falsy' })`, so
   a body of { itemId: 0 } SKIPS isInt({min:1}) entirely -- and if 0 also
   read as "present" here, the one-target rule would be satisfied and a
   zero id would reach the controller, surfacing as a 404 deep inside
   ("no item found with id 0") instead of a clean 400 at the edge, the
   very thing this validator exists to prevent. Matching the optional
   rules' falsy test keeps the two layers in agreement. By the time this
   runs, express-validator has toInt()'d any valid id, so a real target is
   a positive number and 0 can only mean "no usable id was given". */
function present(value) {
  return value !== undefined && value !== null && value !== '' && value !== 0
}

const createRules = [
  body('reason')
    .exists({ values: 'falsy' }).withMessage('A report reason is required')
    .isIn(reportModel.REASONS)
    .withMessage(`Reason must be one of: ${reportModel.REASONS.join(', ')}`),

  body('details')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1000 }).withMessage('Details must be at most 1000 characters'),

  /* Both targets are optional on their own -- a report carries one or
     the other -- but each must be a positive id WHEN present. toInt()
     leaves the body carrying a number, which the controller hands
     straight to reportModel.create. */
  body('itemId')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('Item id must be a positive whole number')
    .toInt(),

  body('userId')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('User id must be a positive whole number')
    .toInt(),

  /* The "exactly one target" rule. Attached to itemId but reading both,
     with NO .optional() so it runs even when itemId was omitted -- an
     .optional() here would skip the check in exactly the "no target at
     all" case it exists to catch. `hasItem === hasUser` is true both
     when neither was sent and when both were: the two ways to break the
     rule collapse into one condition. */
  body('itemId').custom((_value, { req }) => {
    const hasItem = present(req.body.itemId)
    const hasUser = present(req.body.userId)
    if (hasItem === hasUser) {
      throw new Error('A report must name exactly one target: itemId or userId')
    }
    return true
  }),
]

module.exports = { createRules }
