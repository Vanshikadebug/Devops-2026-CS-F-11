const { body } = require('express-validator')
const reportModel = require('../models/reportModel')

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

  body('itemId')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('Item id must be a positive whole number')
    .toInt(),

  body('userId')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('User id must be a positive whole number')
    .toInt(),

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
