/**
 * validators/itemValidators.js -- the rules for creating and editing
 * an item.
 *
 * WHAT IS THIS FILE?
 * A declarative description of what a valid item body looks like,
 * in the same shape as authValidators.js: express-validator chains
 * that middleware/validate.js turns into a single 400 listing every
 * problem at once.
 *
 * WHY SEPARATE FROM THE CONTROLLER?
 * Same reason as the auth rules. The controller then holds only the
 * decisions that are actually interesting -- who owns this row, what
 * does `location` resolve to -- and can assume its input is already
 * the right type and length.
 *
 * >>> WHERE THESE NUMBERS COME FROM <<<
 * Every length limit below is the column width in database/schema.sql,
 * not a guess:
 *
 *     name       VARCHAR(150)
 *     location   VARCHAR(150)
 *     image_url  VARCHAR(500)
 *     description TEXT          (no practical limit; capped anyway)
 *
 * That matters. Without the check, MySQL in strict mode rejects the
 * INSERT with ER_DATA_TOO_LONG, which errorHandler.js does not
 * recognise and therefore reports as a generic 500 "Internal server
 * error". The user typed a long title and the site claims it broke.
 * Checking here turns the same input into a 400 that names the field
 * and the limit.
 *
 * The description cap of 5000 is OUR choice rather than the column's
 * -- TEXT holds 65,535 bytes. An item description is a paragraph
 * about a second-hand chair; anything past a few thousand characters
 * is either a mistake or someone using the field as free storage.
 */

const { body } = require('express-validator')
const itemModel = require('../models/itemModel')

/* ---------------------------------------------------------------
   THE IMAGE URL
   ---------------------------------------------------------------
   >>> THIS IS THE ONE FIELD ON THIS FORM WITH A SECURITY ANGLE <<<

   `image_url` is written by one user and rendered into an <img src>
   in every other user's browser. That makes it the only place in the
   item form where accepting the wrong string has consequences beyond
   an ugly card.

   React escapes text, so a description containing <script> is
   printed, not executed -- that whole class of problem is already
   handled. But an ATTRIBUTE is different: React will happily set
   src="javascript:alert(1)" because it cannot know the string is a
   URL scheme rather than a filename. On an <img> the modern browsers
   ignore it; on an <a href> the same value runs. Allowing it here
   would mean the safety of the app depends on which element some
   future component happens to render this string into.

   So the rule is a POSITIVE ONE: the value must look like one of the
   two shapes we actually use, and everything else is rejected. That
   is the important habit -- a denylist of bad schemes ('javascript:',
   'data:', 'vbscript:') is a list you have to keep complete forever,
   and the first scheme you forget is the one that gets used.

     /images/items/casio.jpg     a file we serve ourselves
     https://example.com/x.jpg   somewhere else, over TLS

   http:// is deliberately NOT allowed. A plain-HTTP image on an
   HTTPS page is blocked as mixed content by every current browser,
   so it would be stored successfully and then never appear -- a
   "why is my photo missing" bug with no error anywhere to explain it.
--------------------------------------------------------------- */
function isSafeImageUrl(value) {
  // Root-relative, and specifically inside our own images folder.
  // '/images/../../etc/passwd' cannot pass: the '..' fails the
  // character class below.
  if (/^\/images\/[A-Za-z0-9._/-]+$/.test(value)) {
    return !value.includes('..')
  }

  // Absolute, but only over TLS.
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    // Not parseable as a URL at all.
    return false
  }
}

/* Shared by create and update so the two can never drift apart --
   the exact failure the constants file at the top of the frontend
   warns about, one layer down. */
const nameRule = () =>
  body('name')
    .trim()
    // Whitespace-only titles pass a naive emptiness check and are
    // not titles. trim() runs first so the length sees real content.
    .notEmpty().withMessage('Item name is required')
    .isLength({ min: 3, max: 150 })
    .withMessage('Item name must be 3 to 150 characters')

const descriptionRule = () =>
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10, max: 5000 })
    .withMessage('Description must be 10 to 5000 characters')

const categoryRule = () =>
  body('category')
    // Checked against the SAME array the model builds its SQL from,
    // which is itself a copy of the ENUM in schema.sql. Three
    // hand-maintained lists is how the API starts rejecting a value
    // the database would have accepted.
    .isIn(itemModel.CATEGORIES)
    .withMessage(`Category must be one of: ${itemModel.CATEGORIES.join(', ')}`)

const conditionRule = () =>
  body('condition')
    .isIn(itemModel.CONDITIONS)
    .withMessage(`Condition must be one of: ${itemModel.CONDITIONS.join(', ')}`)

/* --- The two optional location fields ---------------------------
   Only ONE of these is ever stored as given, and the controller
   decides which -- see the long note in itemController.createItem.
   The validator's job here is only to check the TYPE of each, not
   the relationship between them.

   `optional({ values: 'null' })` is the express-validator 7 spelling
   for "absent or null are both fine, run the rest of the chain on
   anything else". The older `.optional({ nullable: true })` is
   deprecated and, more importantly, treats null and undefined the
   same way -- which is exactly the distinction that matters when the
   value means "clear it". */
const collegeIdRule = () =>
  body('collegeId')
    /* 'falsy' rather than 'null' for the same reason as the two
       fields below: an unselected <select> submits '', and "no
       college" is a legitimate answer that must not be a validation
       error. 0 is swept up by 'falsy' too, which is correct here --
       ids are UNSIGNED AUTO_INCREMENT and start at 1, so 0 is not a
       college anyone could mean. A negative or non-numeric id is
       truthy, so it still reaches isInt and is still rejected. */
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('collegeId must be a positive whole number, or null')
    // Without this, the id arrives as the STRING '4'. It would still
    // work -- MySQL coerces it for the foreign key -- but the value
    // is also compared with === in the controller, where '4' !== 4
    // silently takes the wrong branch.
    .toInt()

/* >>> `values: 'falsy'` HERE, NOT `'null'` -- AND IT IS LOAD-BEARING <<<
   An empty <input> submits an EMPTY STRING, not null. So the browser
   sends location: '' on every create where the user picked a college
   instead of typing an address -- which is the normal path.

   With `values: 'null'` the empty string is not treated as absent, so
   the chain below runs and answers:

       400  "Location must be 3 to 150 characters"

   ...for a field the user was never asked to fill in, on a form where
   they DID say where the item is. The message is unanswerable: there
   is no visible problem to fix.

   'falsy' treats '', null and undefined alike as "not provided", which
   is what an empty text input means. The relationship between this
   field and collegeId is then decided in one place --
   itemController.resolvePlace -- which knows that a missing location
   is only an error when there is also no college. A validator cannot
   make that call, because it sees each field alone. */
const locationRule = () =>
  body('location')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 3, max: 150 })
    .withMessage('Location must be 3 to 150 characters')

/* Same reasoning: clearing the photo field sends '', and "I removed
   the photo" must not be a validation error. All falsy values mean
   the same thing for a URL, and the controller normalises them to
   NULL. */
const imageUrlRule = () =>
  body('imageUrl')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Image URL is too long')
    .custom(isSafeImageUrl)
    .withMessage('Image URL must be an https:// address or a /images/ path')

const statusRule = () =>
  body('status')
    .optional()
    .isIn(itemModel.STATUSES)
    .withMessage(`Status must be one of: ${itemModel.STATUSES.join(', ')}`)

/* ---------------------------------------------------------------
   CREATE
   ---------------------------------------------------------------
   Everything the database needs and cannot invent. Note what is
   ABSENT: user_id. It is not accepted from the body at all, because
   the only correct value is req.user.id, taken from a verified token
   signature. A `userId` field here would be a field to lie in -- see
   the note at the end of protect.js.

   `status` is optional and defaults to 'Available' in the schema.
   Someone listing an item that is already promised to a friend is a
   real case, so it is accepted, but the common path does not have to
   send it.
--------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
   UPDATE
   ---------------------------------------------------------------
   >>> WHY THIS IS A FULL REPLACEMENT AND NOT A PATCH <<<
   Every required field is required again. The form the user is
   editing is already populated with the current values, so it sends
   all of them back; there is no case where the browser knows the
   name and deliberately omits it.

   The alternative -- treat a missing field as "leave it alone" --
   sounds friendlier and creates a genuinely nasty ambiguity on
   nullable fields. Does a missing `imageUrl` mean "keep the photo" or
   "remove the photo"? Both readings are defensible, which means
   whichever one is implemented will surprise somebody. PUT means the
   body IS the new state, so removing the photo is sending null and
   keeping it is sending the same URL back. Nothing is implied.
--------------------------------------------------------------- */
const updateRules = createRules

/* ---------------------------------------------------------------
   STATUS ONLY
   ---------------------------------------------------------------
   Marking something reserved is one click on a card, and forcing
   that click to resend the name, description, category and condition
   would mean the list page has to hold the entire item just to
   toggle one enum. Here `status` is the whole body, so it is
   required rather than optional.
--------------------------------------------------------------- */
const statusRules = [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(itemModel.STATUSES)
    .withMessage(`Status must be one of: ${itemModel.STATUSES.join(', ')}`),
]

module.exports = { createRules, updateRules, statusRules, isSafeImageUrl }
