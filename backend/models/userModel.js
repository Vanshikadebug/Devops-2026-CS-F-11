/**
 * models/userModel.js -- everything that touches `users`.
 *
 * >>> THE MOST IMPORTANT RULE IN THIS FILE <<<
 * The `password` column is NEVER selected, except by exactly one
 * function -- findByEmailWithPassword -- which exists solely so login can
 * run bcrypt.compare.
 *
 * WHY BE THIS STRICT?
 * A hash that is never loaded into memory cannot be leaked. The
 * realistic accident is not someone writing `res.json(user.password)`.
 * It is:
 *
 *     const user = await userModel.findById(id)
 *     res.json({ success: true, data: user })     // ships the hash
 *
 * ...which looks completely reasonable. If findById never selects the
 * column, that line is harmless no matter who writes it. This is the
 * difference between a rule people must remember and one the code
 * enforces; only the second kind survives.
 *
 * A bcrypt hash is not plain text, but leaking it is still serious: an
 * attacker can take it away and brute-force it offline, with unlimited
 * attempts and no rate limiting. Treat it as the password.
 *
 * Note that Prisma makes this stronger rather than weaker: every read
 * below names its columns in a `select`, and there is no equivalent of
 * `SELECT *` to reach for. A column added to the schema later cannot
 * appear in an API response by default.
 */

const bcrypt = require('bcryptjs')
const { prisma } = require('../config/prisma')
const { clampLimitOffset } = require('../utils/pagination')
const { formatDates } = require('../utils/sqlDateTime')
const escapeLike = require('../utils/escapeLike')
const config = require('../config/env')

/* The columns safe to send to a client. Note the absence of `password`.
   Declared once so every query returns the same shape.

   >>> WHY THE COLLEGE RELATION IS OPTIONAL, NOT REQUIRED <<<
   users.college_id is NULLABLE -- registration never asked for one, so
   every account created before that feature has NULL, and saying so is a
   legitimate answer. Requiring the relation would make those users vanish
   from findById(), which protect.js calls on EVERY authenticated request.
   The result would be a valid token whose owner "does not exist": logged
   in one moment, 401 the next, with nothing in the logs to explain it.

   >>> WHY role AND status ARE IN HERE, NOT IN AN ADMIN-ONLY QUERY <<<
   authorize.js has to answer "may this person do this?" on every admin
   request, and the only user object it has is the one protect.js loaded
   through findById(). If role were fetched separately, every check would
   need its own query -- and the day someone forgets one, the check reads
   `req.user.role === 'admin'`, `undefined === 'admin'` is false, and it
   fails CLOSED. Safe. But a missing status fails the other way:
   protect.js must be able to reject a BLOCKED account on every request,
   and it can only do that if status arrives with the user. So both
   travel with the identity, always.

   Neither is a secret. The frontend needs role to decide whether to
   render the Admin link -- a convenience, not a protection; the backend
   re-checks regardless (see authorize.js). */
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  mobile: true,
  created_at: true,
  role: true,
  status: true,
  college_id: true,
  college: {
    select: {
      short_name: true,
      area: { select: { name: true, city: { select: { name: true } } } },
    },
  },
}

const ADMIN_SELECT = {
  ...SAFE_SELECT,
  last_login_at: true,
  _count: { select: { items: true } },
}

/* The role and status enums, mirrored so the validators and the
   authorisation middleware check against ONE list instead of each
   restating it. ROLES is ordered by increasing power, which is what
   makes the rank comparison in authorize.js possible. */
const ROLES = ['user', 'moderator', 'admin', 'super_admin']
const STATUSES = ['active', 'blocked']

const DATE_FIELDS = ['created_at', 'last_login_at']

/**
 * Flattens the nested college relation into the flat shape callers and
 * the API contract expect, and renders timestamps the way mysql2 did.
 * The optional chaining is what preserves LEFT JOIN semantics: a user
 * with no college gets nulls, not a crash.
 */
function mapUser(row) {
  if (!row) return null
  const { college, _count, ...rest } = row

  const out = {
    ...rest,
    college_name: college?.short_name ?? null,
    area_name: college?.area?.name ?? null,
    city_name: college?.area?.city?.name ?? null,
  }
  if (_count) out.item_count = _count.items

  return formatDates(out, DATE_FIELDS)
}

/**
 * Creates a user. The password arrives in plain text and is hashed here,
 * so no caller can forget to do it.
 *
 * >>> WHY HASHING HAPPENS IN THIS FUNCTION <<<
 * The alternative is for the controller to hash and pass a hash in. That
 * works until someone writes a second registration path -- an admin
 * tool, a seed script, an import -- and passes plain text, which the
 * database would happily store. Putting the hash here makes storing a
 * plain-text password require actively editing this file.
 *
 * THE SALT IS THE KEY IDEA. bcrypt generates one per password and stores
 * it inside the hash string, so two users with the identical password get
 * completely different hashes. An attacker cannot spot that they match,
 * and cannot precompute a lookup table of common passwords, because they
 * would need a separate table per salt.
 *
 * HASHING IS ONE-WAY -- there is no bcrypt.unhash(). Even we cannot
 * recover the password, which is the point: a database dump does not hand
 * over anyone's password. It is also why "forgot password" resets rather
 * than emails it to you; a site that can email your old password is
 * storing it reversibly, and that is a red flag you can now recognise.
 *
 * WHY IS bcrypt DELIBERATELY SLOW? The cost factor makes each hash take
 * ~100ms. A user logging in never notices; an attacker trying a billion
 * guesses very much does. Each +1 doubles the work. 10 in production, 4
 * in tests (config/env.js), because 341 tests at 100ms is real waiting.
 */
async function create({ name, email, mobile, password }) {
  const hash = await bcrypt.hash(password, config.bcryptSaltRounds)

  /* >>> NOTE WHAT IS NOT IN THIS CREATE: role AND status <<<
     There is no `role` field, and adding one would be a mistake. Both
     columns take their DEFAULT from the schema, so a registration body of
     {"name":"x","role":"super_admin"} has nowhere for that field to land
     -- not because a validator strips it, but because no line of code
     between the request and the database ever reads it. Privilege
     escalation through registration is not filtered here; it is
     unrepresentable.

     Roles are granted in exactly two places, both deliberate:
     scripts/create-admin.js (bootstrap, needs shell access) and setRole()
     below (needs an authenticated super_admin). */
  const created = await prisma.user.create({
    data: { name, email, mobile, password: hash },
    select: { id: true },
  })

  // Re-read through the safe query rather than assembling an object by
  // hand, which is where a stray `password` field would sneak in.
  return findById(created.id)
}

/** One user by id, without the password. Used by protect middleware. */
async function findById(id) {
  return mapUser(await prisma.user.findUnique({ where: { id }, select: SAFE_SELECT }))
}

/** One user by email, without the password. */
async function findByEmail(email) {
  return mapUser(await prisma.user.findUnique({ where: { email }, select: SAFE_SELECT }))
}

/**
 * THE ONLY function that loads the password hash.
 *
 * Its long, awkward name is intentional. `findByEmail` is what you reach
 * for without thinking; you cannot type this one by accident. Used
 * exactly once, in authController.login.
 */
async function findByEmailWithPassword(email) {
  return mapUser(
    await prisma.user.findUnique({
      where: { email },
      select: { ...SAFE_SELECT, password: true },
    }),
  )
}

/**
 * Sets (or clears) which college a user studies at.
 *
 * >>> THE userId ARGUMENT MUST COME FROM A VERIFIED TOKEN <<<
 * This writes to whichever row it is given and has no way to check the
 * caller is entitled to that row. That check belongs one layer up: the
 * controller passes req.user.id, which protect.js derived from a verified
 * signature, and never a value out of the URL, body or query. An endpoint
 * shaped like PUT /api/users/:id/college would let anyone renumber
 * anyone.
 *
 * `collegeId` of null is a real, supported value -- "I would rather not
 * say", or someone undoing a wrong choice. Deliberately not an error.
 *
 * A college id that does not exist is rejected by the FOREIGN KEY, which
 * errorHandler.js already maps to a 400. That is the database enforcing
 * it, not a check we have to remember to write and could forget.
 */
async function updateCollege(userId, collegeId) {
  await prisma.user.updateMany({
    where: { id: userId },
    data: { college_id: collegeId },
  })
  return findById(userId)
}

/**
 * Compares a plain-text attempt against a stored hash.
 *
 * bcrypt.compare re-hashes the attempt using the salt embedded in the
 * stored hash, then compares in CONSTANT TIME -- always the same duration
 * whether the first character is wrong or only the last one is.
 *
 * That matters more than it sounds. A naive `hash === attempt` exits at
 * the first differing byte, so a wrong guess sharing a longer prefix
 * takes measurably longer. An attacker who can time thousands of requests
 * can recover a secret one character at a time. Constant time removes the
 * signal entirely.
 */
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

/**
 * Stamps users.last_login_at. Called by authController.login AFTER the
 * password is verified AND the account passes the blocked check, so only
 * a genuine, successful sign-in is recorded.
 *
 * >>> WHY THE CALLER MUST NOT AWAIT THIS <<<
 * It is bookkeeping, not authentication. If this were awaited and the
 * database hiccuped, a user with the correct password would be told their
 * login failed -- a write nobody asked for breaking the one thing they
 * did ask for. authController fires it and moves on; a missing timestamp
 * costs an admin one column of accuracy, the cheaper failure by far.
 *
 * >>> WHY THIS ONE WRITE IS STILL RAW SQL <<<
 * NOW() is evaluated by MySQL in the session timezone, and the column is
 * a TIMESTAMP. Passing a JavaScript Date instead hands over an instant
 * that the driver renders in ITS notion of the zone, and the two differ
 * by the server's offset (+05:30 here). Keeping NOW() means this column
 * carries exactly what it did before the migration, rather than every
 * login time quietly moving five and a half hours.
 */
async function touchLastLogin(id) {
  await prisma.$executeRaw`UPDATE users SET last_login_at = NOW() WHERE id = ${id}`
}

/* ===================================================================
   ADMIN QUERIES
   ===================================================================
   Everything below is reached only through /api/admin/*, behind protect
   + authorize. None of it is exported to a user-facing route.

   >>> WHY THESE LIVE HERE AND NOT IN AN adminUserModel.js <<<
   One model owns one table. Splitting `users` across two files would mean
   the no-password guarantee at the top was enforced in one of them and
   merely hoped for in the other.
   =================================================================== */

/* The permitted sorts, as a lookup table: the caller supplies a KEY,
   never a column or a direction. An unknown key falls back to `newest`
   rather than erroring -- a stale bookmark should show a page, not a 500.

   `items` sorts on a relation count, and `active` puts accounts that have
   never signed in LAST, which is where an admin hunting dormant accounts
   expects them -- not at the top, which is where a plain DESC would put
   NULLs. */
const USER_SORTS = {
  newest: [{ created_at: 'desc' }, { id: 'desc' }],
  oldest: [{ created_at: 'asc' }, { id: 'asc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
  items: [{ items: { _count: 'desc' } }, { id: 'asc' }],
  active: [{ last_login_at: { sort: 'desc', nulls: 'last' } }],
}

/** The shared filter for listForAdmin and its count. */
function buildUserWhere(filters) {
  const where = {}

  if (filters.role) where.role = filters.role
  if (filters.status) where.status = filters.status
  if (filters.collegeId) where.college_id = filters.collegeId
  if (filters.search) {
    /* escapeLike turns any % or _ the user typed into literal text, so a
       search for "a_b" looks for that and not "a<anything>b". The
       surrounding wildcards are ours and belong in the VALUE, never in
       the query text -- `LIKE '%${search}%'` is the classic injection in
       a search box. */
    const term = `%${escapeLike(filters.search)}%`
    where.OR = [
      { name: { contains: term } },
      { email: { contains: term } },
      { mobile: { contains: term } },
    ]
  }

  return where
}

/**
 * One page of users for /admin/users, with the total so the pager can be
 * drawn.
 *
 * The count runs the same filters without limit/offset. That second query
 * is not waste: without it the frontend cannot know whether there is a
 * page 4, and "load more until it returns nothing" makes the last page a
 * wasted round trip and the total unknowable.
 */
async function listForAdmin({ page, limit, offset }, filters = {}) {
  const where = buildUserWhere(filters)
  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: ADMIN_SELECT,
      orderBy: USER_SORTS[filters.sort] || USER_SORTS.newest,
      take: safeLimit,
      skip: safeOffset,
    }),
    prisma.user.count({ where }),
  ])

  return { rows: rows.map(mapUser), total: Number(total), page, limit: safeLimit }
}

/**
 * One user for the admin detail page: the profile, plus the counts that
 * make it useful -- listings owned, requests sent, requests received on
 * their own items.
 *
 * Still no password. The detail page is exactly where someone would be
 * tempted to "just include everything".
 */
async function findByIdForAdmin(id) {
  const row = await prisma.user.findUnique({ where: { id }, select: ADMIN_SELECT })
  if (!row) return null

  /* Four scoped counts rather than one query with correlated subqueries.
     Concurrent, each an index lookup, and each one readable on its own --
     which matters here, because `requests_received` is the one that has
     to travel through items to find whose listing was asked about. */
  const [available_count, pending_count, requests_sent, requests_received] = await Promise.all([
    prisma.item.count({ where: { user_id: id, status: 'Available' } }),
    prisma.item.count({ where: { user_id: id, moderation_status: 'Pending' } }),
    prisma.request.count({ where: { requester_id: id } }),
    prisma.request.count({ where: { item: { user_id: id } } }),
  ])

  return {
    ...mapUser(row),
    available_count,
    pending_count,
    requests_sent,
    requests_received,
  }
}

/**
 * Changes a user's role. Authorisation -- who may call this, and on whom
 * -- is NOT decided here; see authorize.js and the controller. This
 * function's whole responsibility is that the value reaching the column
 * is one of the four we recognise.
 *
 * >>> WHY VALIDATE A VALUE THE ENUM ALREADY CONSTRAINS? <<<
 * Because of how MySQL fails. An unrecognised value against an ENUM does
 * not error in the default mode -- it stores the empty string '' and
 * emits a warning nobody reads. A user whose role is '' matches no case
 * in any check, which sounds safe until you find the account can no
 * longer log in anywhere and nothing in the log says why. Rejecting it
 * here turns silent corruption into a 422.
 */
async function setRole(id, role) {
  if (!ROLES.includes(role)) {
    throw new Error(`userModel.setRole: "${role}" is not one of ${ROLES.join(', ')}`)
  }
  const { count } = await prisma.user.updateMany({ where: { id }, data: { role } })
  return count > 0 ? findByIdForAdmin(id) : null
}

/**
 * Blocks or unblocks an account.
 *
 * >>> WHY BLOCKING EXISTS AT ALL, GIVEN THERE IS A DELETE <<<
 * users -> items is ON DELETE CASCADE, so deleting an abusive account
 * silently destroys every listing it ever posted along with the requests
 * attached to them. That is unrecoverable, and it is the wrong first
 * response to "this person is behaving badly" -- usually a decision
 * someone wants to reconsider, explain, or undo. Blocking is reversible
 * and leaves the evidence intact. remove() stays for the genuine cases (a
 * spam signup, a deletion request), as the exception rather than the
 * default.
 */
async function setStatus(id, status) {
  if (!STATUSES.includes(status)) {
    throw new Error(`userModel.setStatus: "${status}" is not one of ${STATUSES.join(', ')}`)
  }
  const { count } = await prisma.user.updateMany({ where: { id }, data: { status } })
  return count > 0 ? findByIdForAdmin(id) : null
}

/**
 * Deletes a user. Returns true if a row went away.
 *
 * The FOREIGN KEYs decide what follows, and they were chosen with this
 * call in mind: items CASCADE (their owner is gone, so the listing is
 * meaningless), audit_logs.admin_id SET NULL (the log survives its author
 * -- that is the point of storing admin_email alongside it),
 * items.moderated_by SET NULL (a moderated item stays moderated). No
 * cleanup is written here, because a cleanup someone has to remember to
 * call is a cleanup that will eventually be skipped.
 */
async function remove(id) {
  const { count } = await prisma.user.deleteMany({ where: { id } })
  return count > 0
}

/**
 * How many accounts sit in each role and each status, for the dashboard
 * cards. Two groupBys rather than six count queries.
 *
 * Every key is present and zeroed first, because a groupBy only returns
 * rows that exist: with no blocked users there is no 'blocked' row at
 * all, and a card reading `counts.blocked` would render "undefined"
 * instead of "0".
 */
async function roleAndStatusCounts() {
  const [byRole, byStatus] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  const roles = Object.fromEntries(ROLES.map((r) => [r, 0]))
  for (const row of byRole) roles[row.role] = row._count._all

  const statuses = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const row of byStatus) statuses[row.status] = row._count._all

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
