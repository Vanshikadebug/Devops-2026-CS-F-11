/**
 * models/auditModel.js -- the append-only administrative trail.
 *
 * Every state-changing admin action writes exactly one row here, so that
 * three months from now "who blocked this account and why" has an answer
 * that does not depend on anybody remembering.
 *
 * >>> THIS FILE HAS NO update() AND NO remove() <<<
 * Not an oversight. An audit trail that can be edited is not evidence of
 * anything -- the first thing a misbehaving admin would do is tidy up
 * after themselves. Removing an entry means opening a MySQL client by
 * hand, which is a decision somebody has to make deliberately.
 *
 * WHAT MUST NEVER REACH THIS TABLE
 * `changes` is a JSON snapshot of what an action altered, and the
 * tempting way to build it is `{ before: user, after: body }` -- which
 * copies a bcrypt hash into a table that is READ far more often than
 * `users` is, and sent to a browser. SENSITIVE_KEYS is stripped on the
 * way in, so a careless caller cannot leak a hash even by passing a
 * whole row.
 */

const { Prisma } = require('@prisma/client')
const { prisma } = require('../config/prisma')
const { clampLimitOffset } = require('../utils/pagination')
const { formatDates } = require('../utils/sqlDateTime')
const escapeLike = require('../utils/escapeLike')

/* Mirrors the enum in the schema. Kept here so a wrong value fails with
   a readable error before the write, rather than as MySQL's
   WARN_DATA_TRUNCATED after the action being recorded already happened. */
const TARGET_TYPES = [
  'user', 'item', 'college', 'city', 'area', 'report', 'setting', 'category',
]

/* Matched on the KEY, not the value: a hash is just a string, and no
   value-based rule could tell it from a legitimate one. */
const SENSITIVE_KEYS = [
  'password', 'password_hash', 'passwordhash', 'token', 'secret',
  'authorization', 'jwt', 'refresh_token', 'api_key',
]

/** Recursively drops sensitive keys. Returns a new object. */
function redact(value, depth = 0) {
  // Guards against a cyclic or absurdly nested object -- this runs
  // inside a request, and JSON.stringify on a cycle throws.
  if (depth > 6) return '[too deep]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))

  const out = {}
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.includes(key.toLowerCase())
      ? '[redacted]'
      : redact(v, depth + 1)
  }
  return out
}

/** Cuts a string to a column's length, adding an ellipsis if it had to. */
function fit(text, max) {
  const s = String(text ?? '')
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

const DATE_FIELDS = ['created_at']

/** Flattens the joined admin name into the flat row shape callers expect. */
function mapRow(row) {
  const { admin, ...rest } = row
  return formatDates({ ...rest, admin_name: admin?.name ?? null }, DATE_FIELDS)
}

/**
 * Writes one audit row.
 *
 * >>> WHY THIS TRUNCATES INSTEAD OF VALIDATING <<<
 * It is called AFTER the action it records has committed. Throwing
 * because a description ran to 501 characters would make the caller
 * answer 500 for an operation that succeeded -- a lie to the client, and
 * still no audit row. An entry with a clipped description is worth far
 * more than no entry.
 *
 * It does still throw on a genuinely impossible write (database down,
 * `action` missing): a silent `catch {}` would produce an audit log with
 * invisible holes, which is strictly worse than an error somebody sees.
 */
async function record({
  adminId,
  adminEmail,
  action,
  targetType,
  targetId = null,
  description,
  changes = null,
  ip = null,
}) {
  if (!action) throw new Error('auditModel.record: action is required')
  if (!TARGET_TYPES.includes(targetType)) {
    throw new Error(
      `auditModel.record: targetType "${targetType}" is not one of ${TARGET_TYPES.join(', ')}`,
    )
  }

  const created = await prisma.auditLog.create({
    data: {
      admin_id: adminId ?? null,
      // NOT NULL in the schema. If a caller somehow has no email, an
      // explicit marker beats failing the insert and losing the row.
      admin_email: fit(adminEmail || 'unknown', 255),
      action: fit(action, 60),
      target_type: targetType,
      target_id: targetId ?? null,
      description: fit(description, 500),
      /* Prisma.DbNull, not null. For a nullable Json column plain `null`
         is ambiguous -- it could mean SQL NULL or the JSON value `null`
         -- so Prisma rejects it and makes you say which. This wants a
         genuinely empty column. */
      changes: changes === null ? Prisma.DbNull : redact(changes),
      ip_address: ip ? fit(ip, 45) : null,
    },
    select: { id: true },
  })

  return created.id
}

const SORTS = {
  newest: [{ created_at: 'desc' }, { id: 'desc' }],
  oldest: [{ created_at: 'asc' }, { id: 'asc' }],
}

/**
 * A page of log entries, newest first, optionally filtered.
 *
 * The admin relation is optional, not required: admin_id is SET NULL when
 * an account is deleted, and requiring it would make exactly those
 * entries -- the ones about people who are no longer here -- disappear.
 * The stored admin_email still names them, which is why it is stored.
 */
async function list({ page, limit, offset }, filters = {}) {
  const where = {}

  if (filters.adminId) where.admin_id = filters.adminId
  if (filters.action) where.action = filters.action
  if (filters.targetType) where.target_type = filters.targetType

  if (filters.search) {
    // escapeLike so wildcard characters in the query are matched
    // literally instead of scanning the whole audit log.
    const term = escapeLike(filters.search)
    where.OR = [
      { description: { contains: term } },
      { admin_email: { contains: term } },
    ]
  }

  if (filters.from || filters.to) {
    where.created_at = {}
    if (filters.from) where.created_at.gte = new Date(filters.from)
    if (filters.to) {
      /* Exclusive upper bound one day on. The caller passes a date, and a
         plain `<= '2026-08-16'` compares against midnight and silently
         excludes that whole day's entries. */
      const to = new Date(filters.to)
      to.setUTCDate(to.getUTCDate() + 1)
      where.created_at.lt = to
    }
  }

  /* Still clamped even though Prisma binds take/skip safely: the ceiling
     is what stops one request asking the database to assemble 100,000
     rows. See utils/pagination.js. */
  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: SORTS[filters.sort] || SORTS.newest,
      take: safeLimit,
      skip: safeOffset,
      include: { admin: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ])

  return { rows: rows.map(mapRow), total: Number(total), page, limit: safeLimit }
}

/**
 * The distinct action verbs present in the log, so the filter dropdown
 * offers what actually exists rather than a hardcoded list that drifts
 * out of date the moment a new action is added.
 */
async function distinctActions() {
  const rows = await prisma.auditLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  })
  return rows.map((r) => r.action)
}

module.exports = { record, list, distinctActions, TARGET_TYPES }
