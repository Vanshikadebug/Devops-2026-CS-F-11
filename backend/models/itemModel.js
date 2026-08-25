/**
 * models/itemModel.js -- everything that touches `items`.
 *
 * Controllers call functions here; they never see a query. That keeps
 * every items query in one auditable file, keeps the controller dealing
 * in HTTP rather than joins, and means a storage change touches only this
 * file.
 */

const { prisma } = require('../config/prisma')
const { parsePagination, clampLimitOffset } = require('../utils/pagination')
const { formatDates } = require('../utils/sqlDateTime')
const escapeLike = require('../utils/escapeLike')

/* ---------------------------------------------------------------
   THE PUBLIC SHAPE OF AN ITEM
   ---------------------------------------------------------------
   Defined once so /api/items and /api/items/:id cannot drift apart.

   1. `item_condition` is exposed as `condition`. The column is named the
      long way because `condition` is a MySQL reserved word; the API
      should not leak that workaround, so it is renamed on the way out.

   2. WHAT IS ABSENT: the owner's email and mobile. The relation reaches
      the whole users row, so adding them would be one line -- and contact
      details are only revealed to someone whose request was ACCEPTED.
      Naming every field explicitly is what keeps that true by default.

   3. THE COLLEGE RELATION IS OPTIONAL. items.college_id is nullable (an
      item can be listed off campus). Requiring it would silently drop
      those rows from every response -- no error, they would just stop
      existing. `location` is the free-text fallback that covers them.

   4. moderation_status IS HERE; moderation_reason IS NOT. Which state a
      listing is in is not a secret -- its owner needs it for "Awaiting
      review". The REASON a moderator rejected it is an internal staff
      note about a user, and lives only in the admin shape below. Same for
      moderated_by, which would name the moderator to the person they
      acted against.
--------------------------------------------------------------- */
const ITEM_SELECT = {
  id: true,
  user_id: true,
  name: true,
  description: true,
  category: true,
  item_condition: true,
  location: true,
  college_id: true,
  image_url: true,
  status: true,
  moderation_status: true,
  created_at: true,
  owner: { select: { name: true } },
  college: {
    select: {
      short_name: true,
      area: { select: { name: true, city: { select: { name: true } } } },
    },
  },
}

const ITEM_ADMIN_SELECT = {
  ...ITEM_SELECT,
  updated_at: true,
  moderated_at: true,
  moderated_by: true,
  moderation_reason: true,
  owner: { select: { name: true, email: true, status: true } },
  moderator: { select: { name: true } },
  _count: { select: { requests: true } },
}

const MAX_ROWS = 100
const DATE_FIELDS = ['created_at', 'updated_at', 'moderated_at']

/** Forces any value into an integer LIMIT between 1 and MAX_ROWS. */
function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(limit, 10) || MAX_ROWS, 1), MAX_ROWS)
}

/* Sort keys map to fixed orderings -- the caller supplies a KEY, never a
   column. Every one ends with id: the seed inserts all rows in one
   transaction so they share a created_at second, and without a
   tiebreaker the grid could reshuffle between identical queries. */
const SORTS = {
  newest: [{ created_at: 'desc' }, { id: 'desc' }],
  oldest: [{ created_at: 'asc' }, { id: 'asc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
}

const ADMIN_SORTS = {
  ...SORTS,
  requests: [{ requests: { _count: 'desc' } }, { id: 'asc' }],
  moderated: [{ moderated_at: { sort: 'desc', nulls: 'last' } }],
}

const CATEGORIES = ['Books', 'Electronics', 'Clothing', 'Furniture', 'Stationery', 'Other']
const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor']
const STATUSES = ['Available', 'Reserved', 'Unavailable']
const MODERATION_STATUSES = ['Pending', 'Approved', 'Rejected', 'Hidden']

/** Flattens relations and renames item_condition to condition. */
function mapItem(row) {
  if (!row) return null
  const { owner, college, moderator, _count, item_condition, ...rest } = row

  const out = {
    ...rest,
    condition: item_condition,
    college_name: college?.short_name ?? null,
    area_name: college?.area?.name ?? null,
    city_name: college?.area?.city?.name ?? null,
    owner_name: owner?.name ?? null,
  }

  // Admin-only fields, present only when the admin select was used.
  if (owner && 'email' in owner) {
    out.owner_email = owner.email
    out.owner_status = owner.status
    out.moderator_name = moderator?.name ?? null
    out.request_count = _count?.requests ?? 0
  }

  return formatDates(out, DATE_FIELDS)
}

/** Field order matters: items.test.js asserts the exact public key list. */
function orderPublicKeys(row) {
  if (!row) return null
  const { id, user_id, name, description, category, condition, location,
    college_id, college_name, area_name, city_name, image_url, status,
    moderation_status, created_at, owner_name, ...extra } = row
  return {
    id, user_id, name, description, category, condition, location,
    college_id, college_name, area_name, city_name, image_url, status,
    moderation_status, created_at, owner_name, ...extra,
  }
}

/**
 * Items matching a set of filters. All optional, combining with AND.
 *
 * >>> THE FIRST TWO CONDITIONS ARE NOT FILTERS AND CANNOT BE TURNED OFF <<<
 * This is the function behind the public browse page, so the safe answer
 * must be the one you get when nobody passes anything. A flag like
 * `includeUnapproved` would have been a genuine hazard: `filters` is built
 * from req.query, and the day someone refactors that into a spread,
 * `?includeUnapproved=1` becomes a working bypass of moderation. There is
 * no flag to find -- admin listings come from listForAdmin().
 *
 * The owner-status clause is why blocking works: a blocked spammer's
 * listings leave the browse page. They stay visible to THEM in My Items
 * (findByUser does not filter), so unblocking restores everything.
 */
async function findAll(filters = {}) {
  const where = {
    moderation_status: 'Approved',
    owner: { status: 'active' },
  }

  /* Only ONE location filter applies, most specific first. Combining
     "college 4" with "city 2" is either redundant or contradictory.

     Note there is no filter on i.location -- that column is the human
     sentence on the card, and filtering it would resurrect the problems
     the location tables exist to prevent (a typo forks a campus; a rename
     strands its items). Filtering is ALWAYS on the id. */
  if (filters.college) where.college_id = filters.college
  else if (filters.area) where.college = { area_id: filters.area }
  else if (filters.city) where.college = { area: { city_id: filters.city } }

  /* LIKE, not the fulltext index: in natural-language mode InnoDB ignores
     words under 3 characters and matches whole words only, so typing
     "calc" would find nothing while "Calculator" sits right there. For a
     box typed into character by character, substring matching is what
     people expect. It scans rather than using an index -- irrelevant at
     this size, and the fix when it stops being irrelevant is confined to
     these lines. */
  if (filters.search) {
    const pattern = `%${escapeLike(filters.search)}%`
    where.OR = [{ name: { contains: pattern } }, { description: { contains: pattern } }]
  }

  if (filters.category) where.category = filters.category
  if (filters.condition) where.item_condition = filters.condition
  if (filters.status) where.status = filters.status

  const { page, limit, offset } = parsePagination(filters, MAX_ROWS)

  const [rows, total] = await Promise.all([
    prisma.item.findMany({
      where,
      select: ITEM_SELECT,
      orderBy: SORTS[filters.sort] ?? SORTS.newest,
      take: limit,
      skip: offset,
    }),
    prisma.item.count({ where }),
  ])

  return { rows: rows.map((r) => orderPublicKeys(mapItem(r))), total: Number(total), page, limit }
}

/**
 * One item by id, or null. The raw, ungated lookup -- create/update/
 * updateStatus call it to echo back what they wrote, so it must not be
 * gated: with approval switched on, a freshly posted Pending listing
 * would otherwise come back as null to its own author.
 */
async function findById(id) {
  return orderPublicKeys(
    mapItem(await prisma.item.findUnique({ where: { id }, select: ITEM_SELECT })),
  )
}

/**
 * One item AS THE PUBLIC MAY SEE IT, or null.
 *
 * Applies exactly findAll's rule to the detail route. Without it, that
 * route was a hole through moderation: the grid hides a Hidden item and a
 * blocked user's listings, but anyone who guessed an id could read them
 * one row at a time. Separate function, not a flag, for the same reason.
 */
async function findPublicById(id) {
  const rows = await prisma.item.findMany({
    where: { id, moderation_status: 'Approved', owner: { status: 'active' } },
    select: ITEM_SELECT,
    take: 1,
  })
  return rows.length ? orderPublicKeys(mapItem(rows[0])) : null
}

/**
 * Every item belonging to ONE user, newest first.
 *
 * The user_id filter is the whole point: it is the difference between "my
 * items" and "everyone's items". The caller passes req.user.id, derived
 * from a verified token signature -- never a value from the URL or body.
 */
async function findByUser(userId, { limit } = {}) {
  const rows = await prisma.item.findMany({
    where: { user_id: userId },
    select: ITEM_SELECT,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: clampLimit(limit),
  })
  return rows.map((r) => orderPublicKeys(mapItem(r)))
}

/* ===============================================================
   THE WRITE HALF
   ===============================================================
   1. THESE FUNCTIONS TRUST THEIR ARGUMENTS COMPLETELY. create() writes
      whatever user_id it is handed; remove() deletes whatever id. A model
      has no access to the request and cannot tell an authorised caller
      from an unauthorised one. Authorisation is decided one layer up, in
      middleware/checkItemOwnership.js, so there is exactly ONE place to
      audit "who may edit this?" instead of copies that drift. Never call
      these from a route that has not established ownership.

   2. THEY RE-READ AND RETURN THE ROW rather than echoing the input. An
      insert sets defaults the caller never saw, and the joined college
      and owner names are not in the input at all. Assembling the response
      by hand is how a UI shows a value that was never saved.
=============================================================== */

/**
 * Inserts one item and returns the stored row. `userId` MUST come from
 * req.user.id. Arguments are named rather than positional so a mistake is
 * a wrong key (visible) instead of a wrong order (not).
 */
async function create({
  userId,
  name,
  description,
  category,
  condition,
  location,
  collegeId = null,
  imageUrl = null,
  status = 'Available',
  /* Default 'Approved', not 'Pending': it must match the behaviour the
     site already had, where posting published. This becomes 'Pending' for
     real when require_item_approval is on -- the default only decides
     what happens when nobody has chosen. */
  moderationStatus = 'Approved',
}) {
  const created = await prisma.item.create({
    data: {
      user_id: userId,
      name,
      description,
      category,
      item_condition: condition,
      location,
      college_id: collegeId,
      image_url: imageUrl,
      status,
      moderation_status: moderationStatus,
    },
    select: { id: true },
  })
  return findById(created.id)
}

/**
 * Overwrites one item -- full PUT replacement, so a field left out was
 * already rejected by updateRules rather than quietly kept.
 *
 * user_id and created_at are absent on purpose: an item cannot be
 * reassigned to a different owner or claim a different listing time. The
 * statement has no slot for them, so a crafted request cannot reach them.
 * updated_at needs no mention -- the column carries ON UPDATE
 * CURRENT_TIMESTAMP, and setting it by hand would be a second source of
 * truth for the same fact.
 */
async function update(id, {
  name,
  description,
  category,
  condition,
  location,
  collegeId = null,
  imageUrl = null,
  status,
}) {
  await prisma.item.updateMany({
    where: { id },
    data: {
      name,
      description,
      category,
      item_condition: condition,
      location,
      college_id: collegeId,
      image_url: imageUrl,
      status,
    },
  })
  return findById(id)
}

/** Changes only the status -- one indexed write instead of eight columns. */
async function updateStatus(id, status) {
  await prisma.item.updateMany({ where: { id }, data: { status } })
  return findById(id)
}

/**
 * Deletes one item. Returns true if a row actually went.
 *
 * requests.item_id is ON DELETE CASCADE, so this also removes every
 * request made for the item -- correct (a pending request for something
 * that no longer exists is not actionable), but worth knowing that this
 * statement removes rows from a table it does not name.
 *
 * The count is checked rather than assumed: deleting an already-gone id
 * is not an SQL error, it just changes nothing, and that distinction is
 * the difference between 200 and 404.
 */
async function remove(id) {
  const { count } = await prisma.item.deleteMany({ where: { id } })
  return count > 0
}

/**
 * Just the owner's id, or null. Not findById, because the ownership check
 * runs before every write and findById builds the entire public shape
 * across four tables to answer a question that needs one integer.
 *
 * The null-vs-number distinction is the interface: null means no such
 * item (404), a number that differs from the caller means someone else's
 * (403).
 */
async function findOwnerId(id) {
  const row = await prisma.item.findUnique({ where: { id }, select: { user_id: true } })
  return row?.user_id ?? null
}

/* ===================================================================
   MODERATION AND THE ADMIN LISTING
   ===================================================================
   >>> WHY items HAS TWO STATUS COLUMNS AND NOT ONE BIGGER ENUM <<<
   `status` answers "can I still get this?" and belongs to the OWNER.
   `moderation_status` answers "may the public see this at all?" and
   belongs to STAFF. They are independent: a listing can be Available and
   Hidden at once. Folded into one column, an owner's "mark as reserved"
   could overwrite a moderator's decision to hide it -- through an
   endpoint the owner is legitimately allowed to call.
   =================================================================== */

/**
 * One page of items for /admin/items and the moderation queue.
 * Deliberately separate from findAll -- see the visibility note there.
 */
async function listForAdmin({ page, limit, offset }, filters = {}) {
  const where = {}

  if (filters.moderation) where.moderation_status = filters.moderation
  if (filters.status) where.status = filters.status
  if (filters.category) where.category = filters.category
  if (filters.userId) where.user_id = filters.userId
  if (filters.college) where.college_id = filters.college
  if (filters.search) {
    const pattern = `%${escapeLike(filters.search)}%`
    where.OR = [
      { name: { contains: pattern } },
      { description: { contains: pattern } },
      { owner: { email: { contains: pattern } } },
    ]
  }
  /* No owner-status condition: an admin listing shows everything by
     default, including items belonging to blocked accounts -- usually the
     ones being looked for. The exact opposite of findAll's rule, which is
     why these are two functions. */

  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)

  const [rows, total] = await Promise.all([
    prisma.item.findMany({
      where,
      select: ITEM_ADMIN_SELECT,
      orderBy: ADMIN_SORTS[filters.sort] || ADMIN_SORTS.newest,
      take: safeLimit,
      skip: safeOffset,
    }),
    prisma.item.count({ where }),
  ])

  return { rows: rows.map(mapItem), total: Number(total), page, limit: safeLimit }
}

/** One item with the full admin shape, or null. */
async function findByIdForAdmin(id) {
  return mapItem(await prisma.item.findUnique({ where: { id }, select: ITEM_ADMIN_SELECT }))
}

/**
 * Records a moderation decision. All four columns move in ONE statement:
 * written as separate updates, a failure between them leaves a listing
 * Rejected with no reason and nobody's name against it -- precisely the
 * question the audit trail exists to answer.
 *
 * Requeuing to 'Pending' clears the moderator and reason, because the
 * previous decision no longer holds and keeping the old name would
 * misattribute a judgement about the current version. The decision itself
 * survives in audit_logs; these columns are only ever the CURRENT state.
 */
async function setModeration(id, { status, moderatorId = null, reason = null }) {
  if (!MODERATION_STATUSES.includes(status)) {
    throw new Error(
      `itemModel.setModeration: "${status}" is not one of ${MODERATION_STATUSES.join(', ')}`,
    )
  }

  const requeue = status === 'Pending'

  const { count } = await prisma.item.updateMany({
    where: { id },
    data: {
      moderation_status: status,
      moderated_by: requeue ? null : moderatorId,
      moderated_at: requeue ? null : new Date(),
      moderation_reason: requeue ? null : reason,
    },
  })

  return count > 0 ? findByIdForAdmin(id) : null
}

/** How many items sit in each moderation state. Every key present and zeroed. */
async function moderationCounts() {
  const groups = await prisma.item.groupBy({
    by: ['moderation_status'],
    _count: { _all: true },
  })
  const counts = Object.fromEntries(MODERATION_STATUSES.map((s) => [s, 0]))
  for (const g of groups) counts[g.moderation_status] = g._count._all
  return counts
}

module.exports = {
  findAll,
  findById,
  findPublicById,
  findByUser,
  create,
  update,
  updateStatus,
  remove,
  findOwnerId,
  // admin / moderation
  listForAdmin,
  findByIdForAdmin,
  setModeration,
  moderationCounts,
  MODERATION_STATUSES,
  // Exported so the controller validates against the SAME list the
  // queries rely on -- two copies is how the API starts rejecting a value
  // the database would accept, or vice versa.
  CATEGORIES,
  CONDITIONS,
  STATUSES,
  SORT_KEYS: Object.keys(SORTS),
  ADMIN_SORT_KEYS: Object.keys(ADMIN_SORTS),
}
