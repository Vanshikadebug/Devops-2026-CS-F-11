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
const { clampLimitOffset } = require('../utils/pagination')
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
   nothing in the logs to explain it.

   >>> WHY role AND status ARE IN HERE, NOT IN AN ADMIN-ONLY QUERY <<<
   Because authorize.js has to answer "may this person do this?" on
   every single admin request, and the only user object it has is the
   one protect.js loaded through findById(). If role were fetched
   separately, every authorisation check would need its own query --
   and the day someone forgets one, the check reads
   `req.user.role === 'admin'`, `undefined === 'admin'` is false, and
   it fails CLOSED. That is the safe direction, but a missing status
   fails the other way: protect.js must be able to reject a BLOCKED
   account on every request, and it can only do that if status
   arrives with the user. So both travel with the identity, always.

   Neither is a secret. The frontend needs role to decide whether to
   render the Admin link at all -- which is a convenience, not a
   protection; the backend re-checks it regardless (see authorize.js). */
const SAFE_FIELDS = `
  u.id, u.name, u.email, u.mobile, u.created_at,
  u.role, u.status,
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

/* The users.role and users.status ENUMs, mirrored so the validators
   and the authorisation middleware can check against ONE list instead
   of each restating it. ROLES is ordered by increasing power, which
   is what makes the rank comparison in authorize.js possible. */
const ROLES = ['user', 'moderator', 'admin', 'super_admin']
const STATUSES = ['active', 'blocked']

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

  /* >>> NOTE WHAT IS NOT IN THIS INSERT: role AND status <<<
     There is no `role` parameter, and adding one would be a mistake.
     The column takes its DEFAULT 'user' from the schema, so a
     registration body of {"name":"x","role":"super_admin"} has
     nowhere for that field to land -- not because a validator strips
     it, but because no line of code between the request and the
     database ever reads it. Privilege escalation through registration
     is not filtered here; it is unrepresentable.

     Roles are granted in exactly two places, both deliberate:
     scripts/create-admin.js (bootstrap, needs shell access) and
     setRole() below (needs an authenticated super_admin). */
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

/**
 * Stamps users.last_login_at. Called by authController.login AFTER the
 * password has been verified.
 *
 * >>> WHY THE CALLER MUST NOT AWAIT THIS <<<
 * It is bookkeeping, not authentication. If this UPDATE were awaited
 * and the database hiccuped, a user with the correct password would be
 * told their login failed -- a write nobody asked for breaking the one
 * thing they did ask for. authController fires it and moves on; a
 * missing timestamp costs an admin one column of accuracy, and that is
 * the cheaper failure by a wide margin.
 */
async function touchLastLogin(id) {
  await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id])
}

/* ===================================================================
   ADMIN QUERIES
   ===================================================================
   Everything below is reached only through /api/admin/*, behind
   protect + authorize. None of it is exported to a user-facing route.

   >>> WHY THESE LIVE HERE AND NOT IN AN adminUserModel.js <<<
   Because the rule in this project is that one model owns one table,
   and splitting `users` across two files would mean the SAFE_FIELDS
   guarantee at the top of this file -- the one that keeps the password
   hash out of every response -- was enforced in one of them and merely
   hoped for in the other.
   =================================================================== */

/* The admin table shows two columns an ordinary response has no
   business carrying: when the account last signed in, and how many
   listings it owns.

   >>> WHY item_count IS A SUBQUERY AND NOT A JOIN + GROUP BY <<<
   `LEFT JOIN items ... GROUP BY u.id` looks tidier and is a trap: the
   query already LEFT JOINs colleges, areas and cities, and under
   ONLY_FULL_GROUP_BY (on by default in MySQL 8) every one of those
   selected columns then has to be provably functionally dependent on
   the grouped key. Whether the optimiser accepts that through THREE
   outer joins is a detail nobody should have to be sure about, and it
   fails at runtime, in production, not in review. A correlated
   subquery has no such question hanging over it: it is one index
   lookup on idx_items_user per row, and a page is 20 rows. */
const ADMIN_FIELDS = `
  ${SAFE_FIELDS},
  u.last_login_at,
  (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id) AS item_count
`

/* ORDER BY cannot be a bound parameter, so -- exactly as in
   itemModel -- the permitted sorts are a lookup table and the caller
   supplies a KEY, never SQL. An unknown key falls back to `newest`
   rather than erroring: a stale bookmark should show a page, not a
   500. */
const USER_SORTS = {
  newest: 'u.created_at DESC, u.id DESC',
  oldest: 'u.created_at ASC, u.id ASC',
  name: 'u.name ASC, u.id ASC',
  items: 'item_count DESC, u.id ASC',
  // NULLs (never signed in) sort last, which is what an admin looking
  // for dormant accounts expects to see at the bottom, not the top.
  active: 'u.last_login_at IS NULL, u.last_login_at DESC',
}

/** Builds the shared WHERE clause for listForAdmin and its COUNT. */
function buildUserFilters(filters) {
  const where = []
  const params = []

  if (filters.role) {
    where.push('u.role = ?')
    params.push(filters.role)
  }
  if (filters.status) {
    where.push('u.status = ?')
    params.push(filters.status)
  }
  if (filters.collegeId) {
    where.push('u.college_id = ?')
    params.push(filters.collegeId)
  }
  if (filters.search) {
    /* Bound as parameters, wildcards and all. The '%' belongs in the
       VALUE, never in the SQL text -- `LIKE '%${search}%'` is the
       classic injection in a search box. */
    where.push('(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)')
    const like = `%${filters.search}%`
    params.push(like, like, like)
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

/**
 * One page of users for /admin/users, with the total so the pager can
 * be drawn.
 *
 * The COUNT runs the same filters WITHOUT limit/offset. That second
 * query is not waste: without it the frontend cannot know whether
 * there is a page 4, and "load more until it returns nothing" makes
 * the last page a wasted round trip and the total unknowable.
 */
async function listForAdmin({ page, limit, offset }, filters = {}) {
  const { clause, params } = buildUserFilters(filters)
  const order = USER_SORTS[filters.sort] || USER_SORTS.newest

  // LIMIT/OFFSET are interpolated, not bound, so re-clamp them to integers
  // here regardless of the caller -- the one guard against an injected
  // LIMIT clause. See utils/pagination.js.
  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)

  const [rows] = await pool.execute(
    `SELECT ${ADMIN_FIELDS} ${USER_SOURCE} ${clause}
      ORDER BY ${order}
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params,
  )

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total ${USER_SOURCE} ${clause}`,
    params,
  )

  return { rows, total: Number(total), page, limit: safeLimit }
}

/**
 * One user for the admin detail page (§8): the profile, plus the
 * counts that make it useful -- how many listings they own, how many
 * requests they have sent, and how many they have received on their
 * own items.
 *
 * Still no password. The detail page is exactly where someone would
 * be tempted to "just include everything".
 */
async function findByIdForAdmin(id) {
  const [rows] = await pool.execute(
    `SELECT ${ADMIN_FIELDS},
            (SELECT COUNT(*) FROM items i
              WHERE i.user_id = u.id AND i.status = 'Available')   AS available_count,
            (SELECT COUNT(*) FROM items i
              WHERE i.user_id = u.id
                AND i.moderation_status = 'Pending')               AS pending_count,
            (SELECT COUNT(*) FROM requests r
              WHERE r.requester_id = u.id)                         AS requests_sent,
            (SELECT COUNT(*) FROM requests r
               JOIN items i2 ON i2.id = r.item_id
              WHERE i2.user_id = u.id)                             AS requests_received
       ${USER_SOURCE}
      WHERE u.id = ?`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * Changes a user's role. Authorisation -- who may call this, and on
 * whom -- is NOT decided here; see authorize.js and the controller.
 * This function's whole responsibility is that the value reaching the
 * ENUM is one of the four we recognise.
 *
 * >>> WHY VALIDATE A VALUE THE ENUM ALREADY CONSTRAINS? <<<
 * Because of how MySQL fails. An unrecognised value against an ENUM
 * does not raise an error in the default mode -- it stores the empty
 * string '' and emits a warning nobody reads. A user whose role is ''
 * matches no case in any check, which sounds safe until you find the
 * account can no longer log in anywhere and nothing in the log says
 * why. Rejecting it here turns silent corruption into a 422.
 */
async function setRole(id, role) {
  if (!ROLES.includes(role)) {
    throw new Error(`userModel.setRole: "${role}" is not one of ${ROLES.join(', ')}`)
  }
  const [result] = await pool.execute(
    'UPDATE users SET role = ? WHERE id = ?',
    [role, id],
  )
  return result.affectedRows > 0 ? findByIdForAdmin(id) : null
}

/**
 * Blocks or unblocks an account.
 *
 * >>> WHY BLOCKING EXISTS AT ALL, GIVEN THERE IS A DELETE <<<
 * users -> items is ON DELETE CASCADE, so deleting an abusive account
 * silently destroys every listing it ever posted, along with the
 * requests attached to them. That is unrecoverable, and it is the
 * wrong first response to "this person is behaving badly" -- which is
 * usually a decision someone wants to reconsider, or explain, or
 * undo. Blocking is reversible and leaves the evidence intact.
 * remove() stays available for the genuine cases (spam signups, a
 * deletion request), and it is the exception, not the default.
 */
async function setStatus(id, status) {
  if (!STATUSES.includes(status)) {
    throw new Error(`userModel.setStatus: "${status}" is not one of ${STATUSES.join(', ')}`)
  }
  const [result] = await pool.execute(
    'UPDATE users SET status = ? WHERE id = ?',
    [status, id],
  )
  return result.affectedRows > 0 ? findByIdForAdmin(id) : null
}

/**
 * Deletes a user. Returns true if a row went away.
 *
 * The FOREIGN KEYs decide what follows, and they were chosen with
 * this call in mind: items CASCADE (their owner is gone, so the
 * listing is meaningless), audit_logs.admin_id SET NULL (the log
 * survives its author -- that is the point of storing admin_email
 * alongside it), items.moderated_by SET NULL (a moderated item stays
 * moderated). No cleanup is written here, because a cleanup someone
 * has to remember to call is a cleanup that will eventually be
 * skipped.
 */
async function remove(id) {
  const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id])
  return result.affectedRows > 0
}

/**
 * How many accounts sit in each role and each status, for the
 * dashboard cards. Two GROUP BYs rather than six COUNT queries.
 *
 * Returns a plain object with EVERY key present and zeroed, because a
 * GROUP BY only returns rows that exist: with no blocked users there
 * is no 'blocked' row at all, and a dashboard card reading
 * `counts.blocked` would render "undefined" instead of "0".
 */
async function roleAndStatusCounts() {
  const [byRole] = await pool.execute(
    'SELECT role, COUNT(*) AS n FROM users GROUP BY role',
  )
  const [byStatus] = await pool.execute(
    'SELECT status, COUNT(*) AS n FROM users GROUP BY status',
  )

  const roles = Object.fromEntries(ROLES.map((r) => [r, 0]))
  for (const row of byRole) roles[row.role] = Number(row.n)

  const statuses = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const row of byStatus) statuses[row.status] = Number(row.n)

  return { roles, statuses }
}

module.exports = {
  create,
  findById,
  findByEmail,
  findByEmailWithPassword,
  verifyPassword,
  updateCollege,
  touchLastLogin,
  // admin
  listForAdmin,
  findByIdForAdmin,
  setRole,
  setStatus,
  remove,
  roleAndStatusCounts,
  ROLES,
  STATUSES,
}
