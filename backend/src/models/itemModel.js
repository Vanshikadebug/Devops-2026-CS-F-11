const { prisma } = require('../lib/prisma')
const { parsePagination, clampLimitOffset } = require('../utils/pagination')
const { formatDates } = require('../utils/sqlDateTime')
const escapeLike = require('../utils/escapeLike')

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

function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(limit, 10) || MAX_ROWS, 1), MAX_ROWS)
}

/* Sort keys map to fixed orderings -- the caller supplies a KEY, never a
   column. Every one ends with id: seeded rows share a created_at second, and
   without a tiebreaker the grid reshuffles between identical queries. */
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

const STATUSES = ['Available', 'Reserved', 'Unavailable']
const MODERATION_STATUSES = ['Pending', 'Approved', 'Rejected', 'Hidden']

/** Flattens relations and renames item_condition to condition (the column is
    named the long way because `condition` is a MySQL reserved word). */
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

  if (owner && 'email' in owner) {
    out.owner_email = owner.email
    out.owner_status = owner.status
    out.moderator_name = moderator?.name ?? null
    out.request_count = _count?.requests ?? 0
  }

  return formatDates(out, DATE_FIELDS)
}

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

async function findAll(filters = {}) {
  const where = {
    moderation_status: 'Approved',
    owner: { status: 'active' },
  }

  if (filters.college) where.college_id = filters.college
  else if (filters.area) where.college = { area_id: filters.area }
  else if (filters.city) where.college = { area: { city_id: filters.city } }

  /* LIKE, not the fulltext index: in natural-language mode InnoDB ignores
     words under 3 characters and matches whole words only, so "calc" would
     find nothing while "Calculator" sits right there. */
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

/** One item by id, ungated. create/update/updateStatus call it to echo back
    what they wrote, so it must not be gated: with approval on, a freshly
    posted Pending listing would otherwise come back as null to its author. */
async function findById(id) {
  return orderPublicKeys(
    mapItem(await prisma.item.findUnique({ where: { id }, select: ITEM_SELECT })),
  )
}

/** One item AS THE PUBLIC MAY SEE IT. Applies findAll's rule to the detail
    route -- without it that route is a hole through moderation: the grid
    hides a Hidden item, but anyone guessing an id could read it. */
async function findPublicById(id) {
  const rows = await prisma.item.findMany({
    where: { id, moderation_status: 'Approved', owner: { status: 'active' } },
    select: ITEM_SELECT,
    take: 1,
  })
  return rows.length ? orderPublicKeys(mapItem(rows[0])) : null
}

/** Every item belonging to ONE user. The caller passes req.user.id, derived
    from a verified token signature -- never from a URL or body. */
async function findByUser(userId, { limit } = {}) {
  const rows = await prisma.item.findMany({
    where: { user_id: userId },
    select: ITEM_SELECT,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: clampLimit(limit),
  })
  return rows.map((r) => orderPublicKeys(mapItem(r)))
}

async function countActiveForUser(userId) {
  return prisma.item.count({
    where: { user_id: userId, status: { not: 'Unavailable' } },
  })
}

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

/** Full PUT replacement. user_id and created_at are absent on purpose: an
    item cannot be reassigned to another owner or claim a different listing
    time, and the statement has no slot for them. */
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

async function updateStatus(id, status) {
  await prisma.item.updateMany({ where: { id }, data: { status } })
  return findById(id)
}

async function remove(id) {
  const { count } = await prisma.item.deleteMany({ where: { id } })
  return count > 0
}

/** Just the owner's id, or null. The null-vs-number distinction is the
    interface: null means no such item (404), a number that differs from the
    caller means someone else's (403). */
async function findOwnerId(id) {
  const row = await prisma.item.findUnique({ where: { id }, select: { user_id: true } })
  return row?.user_id ?? null
}

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
  // No owner-status condition: an admin listing shows everything, including
  // items belonging to blocked accounts -- usually the ones being looked for.

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

async function findByIdForAdmin(id) {
  return mapItem(await prisma.item.findUnique({ where: { id }, select: ITEM_ADMIN_SELECT }))
}

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

/** Counts per category label, for the home page and admin overview. */
async function countsByCategory() {
  const groups = await prisma.item.groupBy({
    by: ['category'],
    where: { moderation_status: 'Approved', owner: { status: 'active' } },
    _count: { _all: true },
  })
  return Object.fromEntries(groups.map((g) => [g.category, g._count._all]))
}

module.exports = {
  findAll,
  findById,
  findPublicById,
  findByUser,
  countActiveForUser,
  create,
  update,
  updateStatus,
  remove,
  findOwnerId,
  listForAdmin,
  findByIdForAdmin,
  setModeration,
  moderationCounts,
  countsByCategory,
  MODERATION_STATUSES,
  STATUSES,
  SORT_KEYS: Object.keys(SORTS),
  ADMIN_SORT_KEYS: Object.keys(ADMIN_SORTS),
}
