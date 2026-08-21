/**
 * validators/requestValidators.js -- bodies for creating and deciding
 * a request. Lengths match VARCHAR(500) on requests.message.
 */

const { body } = require('express-validator')
const requestModel = require('../models/requestModel')

const createRules = [
  body('itemId')
    .exists({ values: 'falsy' }).withMessage('Item id is required')
    .isInt({ min: 1 }).withMessage('Item id must be a positive whole number')
    .toInt(),

  body('message')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Message must be at most 500 characters'),
]

const statusRules = [
  body('status')
    .exists({ values: 'falsy' }).withMessage('Status is required')
    .isIn(requestModel.DECIDABLE)
    .withMessage(`Status must be one of: ${requestModel.DECIDABLE.join(', ')}`),
]

module.exports = { createRules, statusRules }
