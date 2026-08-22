/**
 * models/auditModel.js -- the append-only administrative trail.
 *
 * Every state-changing admin action writes exactly one row here. The
 * point is not tidiness: it is that three months from now, "who
 * blocked this account and why" has an answer that does not depend on
 * anybody remembering.
 *
 * >>> THIS FILE HAS NO update() AND NO remove() <<<
 * Not an oversight. An audit trail that can be edited is not evidence
 * of anything -- the first thing a misbehaving admin would do is tidy
 * up after themselves. There is no route, no controller and no model
 * function that changes a row here, so removing an entry means opening
 * a MySQL client and doing it by hand, which is a decision somebody
 * has to make deliberately.
 *
 * WHAT MUST NEVER REACH THIS TABLE
 * The `changes` column is a JSON snapshot of what an action altered,
 * and the tempting way to build it is `{ before: user, after: body }`.
 * That would copy a bcrypt hash into a table which is READ far more
 * often than `users` is -- an admin opens /admin/activity casually,
 * and the response goes over the network to a browser. SENSITIVE_KEYS
 * below is stripped on the way in, so a careless caller cannot leak a
 * hash even by passing the whole row.
 */

const { pool } = require('../config/db')
const { clampLimitOffset } = require('../utils/pagination')

/* The ENUM in schema.sql. Duplicated here so a wrong value is caught
   by a readable error instead of MySQL's WARN_DATA_TRUNCATED, and so
   record() can normalise before it writes rather than throwing after
   the action it is supposed to be recording has already happened. */
const TARGET_TYPES = [
  'user', 'item', 'college', 'city', 'area', 'report', 'setting', 'category',
]

/* Anything whose NAME looks like a secret is removed from `changes`,
   at any depth. Matching on the key rather than on the value is what
   makes this robust: a hash is just a string, and no value-based rule
   could tell it from a legitimate one. */
const SENSITIVE_KEYS = [
  'password', 'password_hash', 'passwordhash', 'token', 'secret',
  'authorization', 'jwt', 'refresh_token', 'api_key',
]

/** Recursively drops sensitive keys. Returns a new object. */
function redact(value, depth = 0) {
  // A guard against a caller handing us a cyclic or absurdly nested
  // object -- this runs inside a request, and JSON.stringify on a
  // cycle throws.
  if (depth > 6) return '[too deep]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))

  const out = {}
  for (const [key, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      out[key] = '[redacted]'
      continue
    }
    out[key] = redact(v, depth + 1)
  }
  return out
}

/** Cuts a string to a column's length, adding an ellipsis if it had to. */
function fit(text, max) {
  const s = String(text ?? '')
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

/**
 * Writes one audit row.
 *
 * >>> WHY THIS TRUNCATES INSTEAD OF VALIDATING <<<
 * It is called AFTER the action it records has already committed. If
 * it threw because a description ran to 501 characters, the caller
 * would have to answer 500 for an operation that succeeded -- a lie to
 * the client, and still no audit row. So every value is coerced into
 * something the column accepts: an entry with a clipped description is
 * worth far more than no entry.
 *
 * It does still throw on a genuinely impossible write (the database is
 * down, `action` is missing). That is deliberate: a silent `catch {}`
 * here would produce an audit log with invisible holes, which is
 * strictly worse than an error somebody notices.
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

  const [result] = await pool.execute(
    `INSERT INTO audit_logs
       (admin_id, admin_email, action, target_type, target_id,
        description, changes, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      adminId ?? null,
      // NOT NULL in the schema. If a caller somehow has no email, an
      // explicit marker beats failing the insert and losing the row.
      fit(adminEmail || 'unknown', 255),
      fit(action, 60),
      targetType,
      targetId ?? null,
      fit(description, 500),
      changes === null ? null : JSON.stringify(redact(changes)),
      ip ? fit(ip, 45) : null,
    ],
  )
  return result.insertId
}

/* Sort options as a lookup table, for the same reason itemModel has
   one: ORDER BY cannot be a bound parameter, so the only sort strings
   that may reach the SQL are the ones written here. */
const SORTS = {
  newest: 'l.created_at DESC, l.id DESC',
  oldest: 'l.created_at ASC, l.id ASC',
}

const LOG_FIELDS = `
  l.id, l.admin_id, l.admin_email, l.action,
  l.target_type, l.target_id, l.description, l.changes,
  l.ip_address, l.created_at,
  u.name AS admin_name
`

/**
 * A page of log entries, newest first, optionally filtered.
 *
 * LEFT JOIN, not JOIN: admin_id is SET NULL when the account is
 * deleted, and an inner join would make exactly those entries -- the
 * ones about people who are no longer here -- disappear from the log.
 * The stored admin_email still names them, which is the whole reason
 * it is stored.
 */
async function list({ page, limit, offset }, filters = {}) {
  const where = []
  const params = []

  if (filters.adminId) {
    where.push('l.admin_id = ?')
    params.push(filters.adminId)
  }
  if (filters.action) {
    where.push('l.action = ?')
    params.push(filters.action)
  }
  if (filters.targetType) {
    where.push('l.target_type = ?')
    params.push(filters.targetType)
  }
  if (filters.search) {
    where.push('(l.description LIKE ? OR l.admin_email LIKE ?)')
    const like = `%${filters.search}%`
    params.push(like, like)
  }
  if (filters.from) {
    where.push('l.created_at >= ?')
    params.push(filters.from)
  }
  if (filters.to) {
    // The caller passes a date; a plain `<= '2026-08-16'` would compare
    // against midnight and silently exclude that whole day's entries.
    where.push('l.created_at < DATE_ADD(?, INTERVAL 1 DAY)')
    params.push(filters.to)
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = SORTS[filters.sort] || SORTS.newest

  // LIMIT and OFFSET are interpolated, not bound (the protocol forbids
  // binding them), so they are re-clamped to integers here regardless of
  // what the caller passed -- the last line of defence between this query
  // and an injected LIMIT clause. See utils/pagination.js.
  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)

  const [rows] = await pool.execute(
    `SELECT ${LOG_FIELDS}
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.admin_id
       ${clause}
      ORDER BY ${order}
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params,
  )

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM audit_logs l ${clause}`,
    params,
  )

  return { rows, total: Number(total), page, limit: safeLimit }
}

/**
 * The distinct action verbs present in the log, so the filter dropdown
 * offers what actually exists rather than a hardcoded list that drifts
 * out of date the moment a new action is added.
 */
async function distinctActions() {
  const [rows] = await pool.execute(
    'SELECT DISTINCT action FROM audit_logs ORDER BY action',
  )
  return rows.map((r) => r.action)
}

module.exports = { record, list, distinctActions, TARGET_TYPES }
