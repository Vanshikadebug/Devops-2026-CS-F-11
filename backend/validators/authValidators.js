/**
 * validators/authValidators.js -- the rules for register and login.
 *
 * WHAT IS THIS FILE?
 * A declarative list of what a valid request body looks like. Each
 * chain reads as a sentence: body('email') must be an email, must be
 * normalised, must not be empty.
 *
 * WHY SEPARATE FROM THE CONTROLLER?
 * The controller then contains only the interesting logic -- hash,
 * compare, sign a token -- and can assume its input is already sane.
 * Mixed together, the validation drowns out what the function
 * actually does.
 *
 * TRUST NOTHING FROM THE CLIENT. Every field below is attacker
 * controlled. The rules exist because MySQL will otherwise happily
 * store a 10,000-character name, or a mobile number containing SQL,
 * or an empty password.
 */

const { body } = require('express-validator')

/* ---------------------------------------------------------------
   REGISTRATION
--------------------------------------------------------------- */
const registerRules = [
  body('name')
    .trim()
    // Whitespace-only input is the classic gap: '   ' passes a naive
    // "is it empty?" check but is not a name. trim() runs first, so
    // the length check sees the real content.
    .notEmpty().withMessage('Name is required')
    // 100 is not arbitrary -- it is VARCHAR(100) in schema.sql. Left
    // unchecked, MySQL in strict mode rejects the insert with a
    // driver error, producing a 500 for what is really a 400.
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address')
    // Lowercases the address. This matters: without it,
    // Aarav@example.com and aarav@example.com are different strings,
    // so the UNIQUE index allows BOTH -- and the user cannot work out
    // why their login fails. Normalising on the way in makes the
    // constraint mean what we intended.
    //
    // THE OPTIONS ARE NOT OPTIONAL. Checked with the real library
    // rather than trusted: by DEFAULT normalizeEmail() also strips
    // dots and +tags from Gmail addresses, so
    //   Vanshika.Meena@Gmail.com  ->  vanshikameena@gmail.com
    // That is true to how Gmail routes mail, but it means the profile
    // shows an address the user never typed. Case-insensitivity is
    // all we actually need, so the rewriting is switched off.
    .normalizeEmail({
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
      outlookdotcom_remove_subaddress: false,
      yahoo_remove_subaddress: false,
      icloud_remove_subaddress: false,
    })
    .isLength({ max: 255 }).withMessage('Email is too long'),

  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required')
    // Indian mobile numbers: 10 digits starting 6-9. Deliberately
    // permissive about an optional +91 prefix, because rejecting a
    // number a user typed correctly is worse than accepting a format
    // variation.
    .matches(/^(\+91[- ]?)?[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number'),

  body('password')
    // NOT trimmed. A space is a legitimate password character, and
    // silently stripping it means the password stored at registration
    // differs from the one typed at login. Only trim fields you will
    // compare loosely -- never a password.
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be at least 8 characters')
    // WHY A 72-CHARACTER MAXIMUM? This is a real bcrypt limitation,
    // not a style choice: bcrypt silently IGNORES everything past 72
    // bytes. A user with a 100-character passphrase would find that
    // only the first 72 mattered -- and, worse, that a different
    // 100-character password sharing those 72 also logged them in.
    // Rejecting is honest; truncating silently is not.
    .matches(/[a-zA-Z]/).withMessage('Password must contain a letter')
    .matches(/\d/).withMessage('Password must contain a number'),
]

/* ---------------------------------------------------------------
   LOGIN
   ---------------------------------------------------------------
   Deliberately looser than registration. We check only that the
   fields are PRESENT -- not that the password is 8+ characters with
   a digit.

   WHY? Two reasons.
   1. Rules change. If we later require 12 characters, every existing
      user with an 8-character password would be locked out by
      validation before bcrypt.compare ever ran.
   2. It leaks information. "Password must contain a number" on a
      LOGIN form tells an attacker their guess was rejected for
      format reasons, quietly confirming what the real password
      cannot be. Login should answer one question only: do these
      credentials match?
--------------------------------------------------------------- */
const loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address')
    // Must match registration's normalisation, or someone who
    // registered as Aarav@... could never log in as aarav@...
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),
]

module.exports = { registerRules, loginRules }
