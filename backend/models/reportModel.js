/**
 * models/reportModel.js -- everything that touches `reports`.
 *
 * A report names EITHER an item OR a user, never both and never neither.
 * Both columns are nullable, and "exactly one" is enforced by two
 * triggers in schema.sql -- not a CHECK, because MySQL won't let a column
 * sit in both a CHECK and an ON DELETE CASCADE foreign key, and the
 * cascade matters more (without it, reporting a listing would pin it in
 * place permanently). create() re-checks the rule in JS so a caller gets
 * a sentence instead of SQLSTATE 45000; the trigger stays the real
 * guarantee.
 */

const { prisma } = require('../config/prisma')
const { clampLimitOffset } = require('../utils/pagination')
const { normaliseRawRows } = require('../utils/rawRows')
const { formatDates } = require('../utils/sqlDateTime')
const escapeLike = require('../utils/escapeLike')

const REASONS = ['Spam', 'Inappropriate', 'Fraud', 'Duplicate', 'Wrong Category', 'Other']
const STATUSES = ['Open', 'Under Review', 'Resolved', 'Rejected']

/* 'Open' is deliberately not reviewable-into: it is the start state, and
   reopening a closed complaint is a workflow nobody asked for. */
const REVIEWABLE = ['Under Review', 'Resolved', 'Rejected']

const REPORT_SELECT = {
  id: true,
  reporter_id: true,
  reported_item_id: true,
  reported_user_id: true,
  reason: true,
  details: true,
  status: true,
  reviewed_by: true,
  reviewed_at: true,
  resolution_note: true,
  created_at: true,
  reporter: { select: { name: true, email: true } },
  item: { select: { name: true, moderation_status: true } },
  reportedUser: { select: { name: true, email: true, status: true } },
  reviewer: { select: { name: true } },
}

const DATE_FIELDS = ['reviewed_at', 'created_at']

/* Flattens the relations. Optional chaining preserves LEFT JOIN
   semantics: a report names an item OR a user, so one branch is always
   null, and a reviewer is null until someone picks it up. */
function mapReport(row) {
  if (!row) return null
  const { reporter, item, reportedUser, reviewer, ...rest } = row
  return formatDates(
    {
      ...rest,
      reporter_name: reporter?.name ?? null,
      reporter_email: reporter?.email ?? null,
      item_name: item?.name ?? null,
      item_moderation_status: item?.moderation_status ?? null,
      reported_user_name: reportedUser?.name ?? null,
      reported_user_email: reportedUser?.email ?? null,
      reported_user_status: reportedUser?.status ?? null,
      reviewer_name: reviewer?.name ?? null,
    },
    DATE_FIELDS,
  )
}

/**
 * Files a report. `reporterId` MUST come from req.user.id -- a
 * body-supplied reporter would let anyone file in someone else's name.
 * A duplicate pair is P2002, which errorHandler maps to 409.
 */
async function create({ reporterId, itemId = null, userId = null, reason, details = null }) {
  if (!REASONS.includes(reason)) {
    throw new Error(`reportModel.create: "${reason}" is not one of ${REASONS.join(', ')}`)
  }

  const hasItem = itemId !== null && itemId !== undefined
  const hasUser = userId !== null && userId !== undefined
  if (hasItem === hasUser) {
    throw new Error('reportModel.create: a report must name exactly one target -- an item or a user')
  }

  const created = await prisma.report.create({
    data: {
      reporter_id: reporterId,
      reported_item_id: hasItem ? itemId : null,
      reported_user_id: hasUser ? userId : null,
      reason,
      details,
    },
    select: { id: true },
  })
  return created.id
}

/**
 * One page of reports for /admin/reports, with the total.
 *
 * Kept as raw SQL for the `priority` sort: FIELD() gives the status enum
 * an explicit review order (Open, then Under Review, then the closed
 * states) that the query builder can't express, and since the list is
 * paginated, sorting in JS would be wrong across page boundaries.
 */
async function list({ page, limit, offset }, filters = {}) {
  const where = []
  const params = []

  if (filters.status) { where.push('r.status = ?'); params.push(filters.status) }
  if (filters.reason) { where.push('r.reason = ?'); params.push(filters.reason) }
  if (filters.target === 'item') where.push('r.reported_item_id IS NOT NULL')
  if (filters.target === 'user') where.push('r.reported_user_id IS NOT NULL')

  if (filters.search) {
    where.push('(r.details LIKE ? OR rep.email LIKE ? OR it.name LIKE ? OR ru.email LIKE ?)')
    const like = `%${escapeLike(filters.search)}%`
    params.push(like, like, like, like)
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const SORTS = {
    newest: 'r.created_at DESC, r.id DESC',
    oldest: 'r.created_at ASC, r.id ASC',
    priority: "FIELD(r.status, 'Open', 'Under Review', 'Resolved', 'Rejected'), r.created_at ASC",
  }
  const order = SORTS[filters.sort] || SORTS.priority
  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)

  const FIELDS = `
    r.id, r.reporter_id, r.reported_item_id, r.reported_user_id,
    r.reason, r.details, r.status, r.reviewed_by, r.reviewed_at,
    r.resolution_note, r.created_at,
    rep.name AS reporter_name, rep.email AS reporter_email,
    it.name AS item_name, it.moderation_status AS item_moderation_status,
    ru.name AS reported_user_name, ru.email AS reported_user_email,
    ru.status AS reported_user_status, rv.name AS reviewer_name`
  const SOURCE = `
    FROM reports r
    LEFT JOIN users rep ON rep.id = r.reporter_id
    LEFT JOIN items it  ON it.id  = r.reported_item_id
    LEFT JOIN users ru  ON ru.id  = r.reported_user_id
    LEFT JOIN users rv  ON rv.id  = r.reviewed_by`

  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${FIELDS} ${SOURCE} ${clause} ORDER BY ${order} LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    ...params,
  )
  const totalRows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS total ${SOURCE} ${clause}`,
    ...params,
  )

  return {
    rows: normaliseRawRows(rows, DATE_FIELDS),
    total: Number(totalRows[0].total),
    page,
    limit,
  }
}

/** One report in full, or null. */
async function findById(id) {
  return mapReport(await prisma.report.findUnique({ where: { id }, select: REPORT_SELECT }))
}

/**
 * Records a review decision. reviewed_at is set for 'Under Review' too:
 * it answers "when did a human last touch this?", and picking a report up
 * is touching it. NOW() stays in SQL to keep the column in the session
 * timezone rather than shifting by the server offset.
 */
async function review(id, { status, reviewerId, note = null }) {
  if (!REVIEWABLE.includes(status)) {
    throw new Error(`reportModel.review: "${status}" is not one of ${REVIEWABLE.join(', ')}`)
  }

  const count = await prisma.$executeRaw`
    UPDATE reports
       SET status = ${status}, reviewed_by = ${reviewerId},
           reviewed_at = NOW(), resolution_note = ${note}
     WHERE id = ${id}`

  return count > 0 ? findById(id) : null
}

/** Deletes a report -- for genuine mistakes, not as a way of handling one. */
async function remove(id) {
  const { count } = await prisma.report.deleteMany({ where: { id } })
  return count > 0
}

/** How many reports sit in each state, every key present and zeroed. */
async function statusCounts() {
  const groups = await prisma.report.groupBy({ by: ['status'], _count: { _all: true } })
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const g of groups) counts[g.status] = g._count._all
  return counts
}

/** How many OPEN (or Under Review) reports name this item or user. */
async function openCountFor({ itemId = null, userId = null }) {
  const where = { status: { in: ['Open', 'Under Review'] } }
  if (itemId !== null) where.reported_item_id = itemId
  else where.reported_user_id = userId
  return prisma.report.count({ where })
}

module.exports = {
  create,
  list,
  findById,
  review,
  remove,
  statusCounts,
  openCountFor,
  REASONS,
  STATUSES,
  REVIEWABLE,
  SORT_KEYS: ['newest', 'oldest', 'priority'],
}
