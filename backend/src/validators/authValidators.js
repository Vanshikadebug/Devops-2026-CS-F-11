const { body } = require('express-validator')

const EMAIL_NORMALISE_OPTIONS = {
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false,
}

/* ---------------------------------------------------------------
   REGISTRATION
--------------------------------------------------------------- */
const registerRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(EMAIL_NORMALISE_OPTIONS)
    .isLength({ max: 255 }).withMessage('Email is too long'),

  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required')
    .matches(/^(\+91[- ]?)?[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number'),

  body('password')
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be 8 to 72 characters')
    .matches(/[a-zA-Z]/).withMessage('Password must contain a letter')
    .matches(/\d/).withMessage('Password must contain a number'),
]

const loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(EMAIL_NORMALISE_OPTIONS),

  body('password')
    .notEmpty().withMessage('Password is required'),
]

module.exports = { registerRules, loginRules }
