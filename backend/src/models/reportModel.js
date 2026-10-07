const { prisma } = require('../lib/prisma')
const { clampLimitOffset } = require('../utils/pagination')
const { formatDates } = require('../utils/sqlDateTime')
const textMatch = require('../utils/textMatch')

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

const STATUS_RANK = Object.fromEntries(STATUSES.map((st, i) => [st, i]))

async function list({ page, limit, offset }, filters = {}) {
  const where = {}
  if (filters.status) where.status = filters.status
  if (filters.reason) where.reason = filters.reason
  if (filters.target === 'item') where.reported_item_id = { not: null }
  if (filters.target === 'user') where.reported_user_id = { not: null }

  if (filters.search) {
    const term = textMatch(filters.search)
    where.OR = [
      { details: term },
      { reporter: { is: { email: term } } },
      { item: { is: { name: term } } },
      { reportedUser: { is: { email: term } } },
    ]
  }

  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)
  const SORTS = {
    newest: [{ created_at: 'desc' }, { id: 'desc' }],
    oldest: [{ created_at: 'asc' }, { id: 'asc' }],
  }

  let rows
  let total
  if (SORTS[filters.sort]) {
    ;[rows, total] = await Promise.all([
      prisma.report.findMany({ where, select: REPORT_SELECT, orderBy: SORTS[filters.sort], skip: safeOffset, take: safeLimit }),
      prisma.report.count({ where }),
    ])
  } else {
    // ponytail: "priority" (workflow order, then oldest) has no Mongo sort
    // key, so it sorts in memory. Fine for a moderation queue of hundreds;
    // store a numeric status_rank field if it grows to tens of thousands.
    const all = await prisma.report.findMany({ where, select: REPORT_SELECT, orderBy: { created_at: 'asc' } })
    all.sort((x, y) => STATUS_RANK[x.status] - STATUS_RANK[y.status])
    rows = all.slice(safeOffset, safeOffset + safeLimit)
    total = all.length
  }

  return { rows: rows.map(mapReport), total, page, limit }
}

/** One report in full, or null. */
async function findById(id) {
  return mapReport(await prisma.report.findUnique({ where: { id }, select: REPORT_SELECT }))
}

async function review(id, { status, reviewerId, note = null }) {
  if (!REVIEWABLE.includes(status)) {
    throw new Error(`reportModel.review: "${status}" is not one of ${REVIEWABLE.join(', ')}`)
  }

  const { count } = await prisma.report.updateMany({
    where: { id },
    data: { status, reviewed_by: reviewerId, reviewed_at: new Date(), resolution_note: note },
  })

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
