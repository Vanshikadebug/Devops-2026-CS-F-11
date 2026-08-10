/**
 * models/userModel.js -- every SQL statement that touches `users`.
 *
 * >>> THE MOST IMPORTANT RULE IN THIS FILE <<<
 * The `password` column is NEVER selected, except by exactly one
 * function -- findByEmailWithPassword -- which exists solely so
 * login can run bcrypt.compare.
 *
 * WHY BE THIS STRICT?
 * Because a password hash that is never loaded into memory cannot be
 * leaked. The realistic accident is not someone deliberately writing
 * `res.json(user.password)`. It is someone writing:
 *
 *     const user = await userModel.findById(id)
 *     res.json({ success: true, data: user })     // ships the hash
 *
 * ...which looks completely reasonable. If findById never selected
 * the column, that line is harmless no matter who writes it. This is
 * the difference between a rule people must remember and a rule the
 * code enforces. Only the second kind survives.
 *
 * A bcrypt hash is not plain text, but leaking it is still serious:
 * an attacker can take it away and brute-force it offline, with
 * unlimited attempts and no rate limiting. Treat it as the password.
 *
 * This is also why SELECT * appears nowhere in this project. It
 * returns whatever columns happen to exist -- including any added
 * later, which is how a column nobody meant to expose ends up in an
 * API response months after it was added.
 */

const bcrypt = require('bcryptjs')
const { pool } = require('../config/db')
const config = require('../config/env')

/* The columns that are safe to send to a client. Note the absence
   of `password`. Written once so every query returns the same shape.

   college_id is here, plus the college's display name and its area
   and city, resolved through the LEFT JOINs below. The frontend uses
   them to pre-select the browse filters for someone who has already
   said where they study, and to print "SKIT Jaipur" on the dashboard
   rather than making a second request for it.

   >>> WHY THE JOINS ARE **LEFT** JOINS <<<
   users.college_id is NULLABLE -- registration never asked for one,
   so every account created before this feature has NULL, and saying
   so is a legitimate answer. A plain JOIN would make those users
   vanish from findById(), which protect.js calls on EVERY
   authenticated request. The result would be a valid token whose
   owner "does not exist": logged in one moment, 401 the next, with
   nothing in the logs to explain it. */
const SAFE_FIELDS = `
  u.id, u.name, u.email, u.mobile, u.created_at,
  u.college_id,
  co.short_name AS college_name,
  a.name        AS area_name,
  c.name        AS city_name
`

const USER_SOURCE = `
  FROM users u
  LEFT JOIN colleges co ON co.id = u.college_id
  LEFT JOIN areas    a  ON a.id  = co.area_id
  LEFT JOIN cities   c  ON c.id  = a.city_id
`

/**
 * Creates a user. The password arrives in plain text and is hashed
 * here, so no caller can forget to do it.
 *
 * >>> WHY HASHING HAPPENS IN THIS FUNCTION <<<
 * The alternative is for the controller to hash and pass a hash in.
 * That works until someone writes a second registration path -- an
 * admin tool, a seed script, an import -- and passes plain text.
 * MySQL would happily store it. Putting the hash here makes storing
 * a plain-text password require actively editing this file.
 *
 * WHAT bcrypt ACTUALLY DOES
 *   bcrypt.hash('password123', 10)
 *     -> '$2b$10$N9qo8uLOickgx2ZMRZoMye/Ci0Q7fUL7z8wPjWQ8Kx1234567890abc'
 *        │   │  └ salt (22 chars) ┘└──── the hash itself ────┘
 *        │   └ cost factor: 2^10 = 1024 rounds
 *        └ algorithm version
 *
 * THE SALT IS THE KEY IDEA. It is random per password and stored in
 * the string itself. So two users with the identical password get
 * completely different hashes -- which means an attacker cannot spot
 * that they match, and cannot precompute a lookup table ("rainbow
 * table") of common passwords, because they would need a separate
 * table for every possible salt.
 *
 * HASHING IS ONE-WAY. There is no bcrypt.unhash(). Even we cannot
 * recover the password, which is exactly the point: a database dump
 * does not hand the attacker anyone's password. It is also why
 * "forgot password" resets rather than emails it to you -- a site
 * that can email you your old password is storing it reversibly, and
 * that is a red flag you can now recognise in the wild.
 *
 * WHY IS bcrypt DELIBERATELY SLOW?
 * The cost factor makes each hash take ~100ms. A user logging in
 * never notices. An attacker trying a billion guesses very much
 * does -- it turns minutes of brute forcing into years. Each +1 to
 * the cost doubles the work. We use 10 in production and 4 in tests
 * (see config/env.js), because 15 tests × 100ms is real waiting.
 */
async function create({ name, email, mobile, password }) {
  const hash = await bcrypt.hash(password, config.bcryptSaltRounds)

  const [result] = await pool.execute(
    'INSERT INTO users (name, email, mobile, password) VALUES (?, ?, ?, ?)',
    [name, email, mobile, hash],
  )

  // Return the created user WITHOUT the password, by re-reading it
  // through the safe query rather than assembling an object by hand
  // (which is where a stray `password` field would sneak in).
  return findById(result.insertId)
}

/** One user by id, without the password. Used by protect middleware. */
async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${SAFE_FIELDS} ${USER_SOURCE} WHERE u.id = ?`,
    [id],
  )
  return rows[0] ?? null
}

/** One user by email, without the password. */
async function findByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT ${SAFE_FIELDS} ${USER_SOURCE} WHERE u.email = ?`,
    [email],
  )
  return rows[0] ?? null
}

/**
 * THE ONLY function that loads the password hash.
 *
 * Its long, awkward name is intentional. `findByEmail` is what you
 * reach for without thinking; you cannot type this one by accident.
 * Used exactly once, in authController.login.
 */
async function findByEmailWithPassword(email) {
  const [rows] = await pool.execute(
    `SELECT ${SAFE_FIELDS}, u.password ${USER_SOURCE} WHERE u.email = ?`,
    [email],
  )
  return rows[0] ?? null
}

/**
 * Sets (or clears) which college a user studies at.
 *
 * >>> THE userId ARGUMENT MUST COME FROM A VERIFIED TOKEN <<<
 * This function writes to whichever row it is given, and it has no
 * way to check that the caller is entitled to that row. That check
 * belongs one layer up: the controller passes req.user.id, which
 * protect.js derived from a verified signature, and never a value
 * out of the URL, body or query string. An endpoint shaped like
 * PUT /api/users/:id/college would let anyone renumber anyone.
 *
 * `collegeId` of null is a real, supported value: "I would rather
 * not say", or someone undoing a wrong choice. Deliberately not an
 * error.
 *
 * A college id that does not exist is rejected by the FOREIGN KEY,
 * which raises ER_NO_REFERENCED_ROW_2 -- already mapped to a 400 by
 * errorHandler.js. That is the database enforcing it, not a check we
 * have to remember to write and could forget.
 *
 * Returns the freshly read user, so the caller sends back the
 * resolved college_name/area_name/city_name rather than assembling
 * a half-updated object by hand.
 */
async function updateCollege(userId, collegeId) {
  await pool.execute(
    'UPDATE users SET college_id = ? WHERE id = ?',
    [collegeId, userId],
  )
  return findById(userId)
}

/**
 * Compares a plain-text attempt against a stored hash.
 *
 * bcrypt.compare re-hashes the attempt using the salt embedded in
 * the stored hash, then compares. It does this in CONSTANT TIME --
 * it always takes the same duration whether the first character is
 * wrong or only the last one is.
 *
 * That matters more than it sounds. A naive `hash === attempt`
 * comparison exits early at the first differing byte, so a wrong
 * guess that shares a longer prefix takes measurably longer. An
 * attacker who can time thousands of requests can use that to
 * recover a secret one character at a time. Constant time removes
 * the signal entirely.
 */
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

module.exports = {
  create,
  findById,
  findByEmail,
  findByEmailWithPassword,
  verifyPassword,
  updateCollege,
}
