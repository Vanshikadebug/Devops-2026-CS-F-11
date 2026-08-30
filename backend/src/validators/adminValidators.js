const { body } = require('express-validator')
const userModel = require('../models/userModel')
const itemModel = require('../models/itemModel')
const reportModel = require('../models/reportModel')

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

const reportRules = [
  body('status')
    .exists({ values: 'falsy' }).withMessage('A review status is required')
    .isIn(reportModel.REVIEWABLE)
    .withMessage(`Review status must be one of: ${reportModel.REVIEWABLE.join(', ')}`),

  body('note')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Resolution note must be at most 500 characters'),
]

module.exports = { statusRules, roleRules, moderationRules, reportRules }
