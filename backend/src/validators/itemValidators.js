const { body } = require('express-validator')
const itemModel = require('../models/itemModel')
const settingsModel = require('../models/settingsModel')
const taxonomyModel = require('../models/taxonomyModel')

function isSafeImageUrl(value) {
  // Root-relative, inside a folder we own: /images (bundled demo art) or
  // /uploads (what uploadController writes). '..' cannot pass either.
  if (/^\/(images|uploads)\/[A-Za-z0-9._/-]+$/.test(value)) {
    return !value.includes('..')
  }
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const nameRule = () =>
  body('name')
    .trim()
    // trim() first so the length check sees real content: a whitespace-only
    // title passes a naive emptiness check and is not a title.
    .notEmpty().withMessage('Item name is required')
    .isLength({ min: 3 }).withMessage('Item name must be at least 3 characters')
    .custom(async (value) => {
      const max = await settingsModel.get('item_name_max')
      if (value.length > max) throw new Error(`Item name must be at most ${max} characters`)
      return true
    })

const descriptionRule = () =>
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10 }).withMessage('Description must be at least 10 characters')
    .custom(async (value) => {
      const max = await settingsModel.get('item_description_max')
      if (value.length > max) throw new Error(`Description must be at most ${max} characters`)
      return true
    })

const categoryRule = () =>
  body('category')
    .notEmpty().withMessage('Category is required')
    .bail()
    .custom(async (value) => {
      const allowed = await taxonomyModel.categoryLabels()
      if (!allowed.includes(value)) {
        throw new Error(`Category must be one of: ${allowed.join(', ')}`)
      }
      return true
    })

const conditionRule = () =>
  body('condition')
    .notEmpty().withMessage('Condition is required')
    .bail()
    .custom(async (value) => {
      const allowed = await taxonomyModel.conditionLabels()
      if (!allowed.includes(value)) {
        throw new Error(`Condition must be one of: ${allowed.join(', ')}`)
      }
      return true
    })

const collegeIdRule = () =>
  body('collegeId')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('collegeId must be a positive whole number, or null')
    // Without toInt the id arrives as the string '4', which is compared with
    // === in the controller where '4' !== 4 silently takes the wrong branch.
    .toInt()

const locationRule = () =>
  body('location')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 3, max: 150 })
    .withMessage('Location must be 3 to 150 characters')

const imageUrlRule = () =>
  body('imageUrl')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Image URL is too long')
    .custom(isSafeImageUrl)
    .withMessage('Photo must be an uploaded file or an https:// address')

const statusRule = () =>
  body('status')
    .optional({ values: 'falsy' })
    .isIn(itemModel.STATUSES)
    .withMessage(`Status must be one of: ${itemModel.STATUSES.join(', ')}`)

/* CREATE. Note what is absent: user_id. It is not accepted from the body at
   all, because the only correct value is req.user.id from a verified token
   signature. A userId field here would be a field to lie in. */
const createRules = [
  nameRule(),
  descriptionRule(),
  categoryRule(),
  conditionRule(),
  collegeIdRule(),
  locationRule(),
  imageUrlRule(),
  statusRule(),
]

const updateRules = createRules

/* STATUS ONLY. Here `status` is the whole body, so it is required rather than
   optional. */
const statusRules = [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(itemModel.STATUSES)
    .withMessage(`Status must be one of: ${itemModel.STATUSES.join(', ')}`),
]

module.exports = { createRules, updateRules, statusRules, isSafeImageUrl }
