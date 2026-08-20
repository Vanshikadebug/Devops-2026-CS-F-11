/**
 * models/reportModel.js -- every SQL statement that touches `reports`.
 *
 * WHAT A REPORT IS
 * One user telling us that a listing or an account is a problem. It is
 * the only table in this project written by ordinary users and read
 * almost exclusively by staff, and that asymmetry shapes everything
 * below.
 *
 * >>> THE ONE STRUCTURAL ODDITY, EXPLAINED ONCE <<<
 * A report names EITHER an item OR a user, never both and never
 * neither. Both columns are therefore nullable, and the "exactly one"
 * rule is enforced by two triggers in schema.sql -- not by a CHECK
 * constraint, because MySQL refuses to let a column sit in both a
 * CHECK and a foreign key that carries ON DELETE CASCADE, and the
 * cascade is the more important of the two. (Without it, a reported
 * item could never be deleted, which would hand any user a way to pin
 * any listing in place permanently by reporting it.)
 *
 * The practical consequence for this file: create() validates the rule
 * in JavaScript as well, so a caller gets a readable error instead of
 * SQLSTATE 45000. The trigger stays the real guarantee -- it holds for
 * a query typed into a MySQL client at 3am, which no amount of
 * application code can promise.
 */

const { pool } = require('../config/db')

/* Mirrors of the two ENUMs in schema.sql, exported so the validators
   check against the same list the database enforces. */
const REASONS = ['Spam', 'Inappropriate', 'Fraud', 'Duplicate', 'Wrong Category', 'Other']
const STATUSES = ['Open', 'Under Review', 'Resolved', 'Rejected']

/* The states a report can be moved INTO by a reviewer. 'Open' is
   absent on purpose: it is the state every report starts in, and
   reopening a resolved complaint is a workflow nobody has asked for.
   Leaving it out means one fewer transition to reason about. */
const REVIEWABLE = ['Under Review', 'Resolved', 'Rejected']

/* What a reviewer sees. Three joins, because a report on its own is
   four ids and a reason -- useless without knowing WHAT was reported
   and BY WHOM.

   Every one is a LEFT JOIN, including the reporter's: reporter_id is
   NOT NULL and CASCADEs, so in principle it is always present, but an
   inner join would make the queue silently drop rows the instant that
   assumption stopped holding. A moderation queue that hides items is
   worse than one that shows a blank name. */
const REPORT_FIELDS = `
  r.id,
  r.reporter_id,
  r.reported_item_id,
  r.reported_user_id,
  r.reason,
  r.details,
  r.status,
  r.reviewed_by,
  r.reviewed_at,
  r.resolution_note,
  r.created_at,
  rep.name  AS reporter_name,
  rep.email AS reporter_email,
  it.name   AS item_name,
  it.moderation_status AS item_moderation_status,
  ru.name   AS reported_user_name,
  ru.email  AS reported_user_email,
  ru.status AS reported_user_status,
  rv.name   AS reviewer_name
`

const REPORT_SOURCE = `
  FROM reports r
  LEFT JOIN users rep ON rep.id = r.reporter_id
  LEFT JOIN items it  ON it.id  = r.reported_item_id
  LEFT JOIN users ru  ON ru.id  = r.reported_user_id
  LEFT JOIN users rv  ON rv.id  = r.reviewed_by
`

const SORTS = {
  newest: 'r.created_at DESC, r.id DESC',
  oldest: 'r.created_at ASC, r.id ASC',
  /* The default for the queue. FIELD() gives an explicit ordering to
     an ENUM by name, so Open sorts before Under Review before the two
     closed states -- which is the order a reviewer wants to work in,
     and is not what alphabetical or ENUM-position ordering gives. */
  priority: "FIELD(r.status, 'Open', 'Under Review', 'Resolved', 'Rejected'), r.created_at ASC",
}

/**
 * Files a report.
 *
 * `reporterId` MUST come from req.user.id. A body-supplied reporter
 * would let anyone file complaints in someone else's name, which is
 * both a harassment vector and a way to burn through the UNIQUE key
 * that stops one person reporting the same thing twice.
 *
 * Returns the inserted row's id. A duplicate raises ER_DUP_ENTRY,
 * which errorHandler already maps to 409 -- the honest answer to
 * "report this again": you already did.
 */
async function create({ reporterId, itemId = null, userId = null, reason, details = null }) {
  if (!REASONS.includes(reason)) {
    throw new Error(`reportModel.create: "${reason}" is not one of ${REASONS.join(', ')}`)
  }

  /* The same rule the trigger enforces, checked here so the caller
     gets a sentence instead of SQLSTATE 45000. Note `!=` on two
     coerced booleans: exactly one must be present. */
  const hasItem = itemId !== null && itemId !== undefined
  const hasUser = userId !== null && userId !== undefined
  if (hasItem === hasUser) {
    throw new Error(
      'reportModel.create: a report must name exactly one target -- an item or a user',
    )
  }

  const [result] = await pool.execute(
    `INSERT INTO reports
       (reporter_id, reported_item_id, reported_user_id, reason, details)
     VALUES (?, ?, ?, ?, ?)`,
    [reporterId, hasItem ? itemId : null, hasUser ? userId : null, reason, details],
  )
  return result.insertId
}

/** One page of reports for /admin/reports, with the total. */
async function list({ page, limit, offset }, filters = {}) {
  const where = []
  const params = []

  if (filters.status) {
    where.push('r.status = ?')
    params.push(filters.status)
  }
  if (filters.reason) {
    where.push('r.reason = ?')
    params.push(filters.reason)
  }
  if (filters.target === 'item') where.push('r.reported_item_id IS NOT NULL')
  if (filters.target === 'user') where.push('r.reported_user_id IS NOT NULL')

  if (filters.search) {
    where.push('(r.details LIKE ? OR rep.email LIKE ? OR it.name LIKE ? OR ru.email LIKE ?)')
    const like = `%${filters.search}%`
    params.push(like, like, like, like)
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = SORTS[filters.sort] || SORTS.priority

  const [rows] = await pool.execute(
    `SELECT ${REPORT_FIELDS} ${REPORT_SOURCE} ${clause}
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  )

  /* The COUNT keeps the joins, unlike the item and user listings.
     It has to: `filters.search` matches against the reporter's email
     and the reported item's name, which live in the joined tables. A
     COUNT without them would answer a different question than the page
     it is supposed to be counting -- a pager that says 40 results above
     a list of 3. */
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total ${REPORT_SOURCE} ${clause}`,
    params,
  )

  return { rows, total: Number(total), page, limit }
}

/** One report in full, or null. */
async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${REPORT_FIELDS} ${REPORT_SOURCE} WHERE r.id = ?`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * Records a review decision.
 *
 * >>> WHY reviewed_at IS SET FOR 'Under Review' TOO <<<
 * It reads as a resolution timestamp, but what it actually answers is
 * "when did a human last touch this?" -- and picking something up is
 * touching it. Left NULL until resolution, a report claimed by a
 * moderator three weeks ago would be indistinguishable from one nobody
 * has ever opened, which is exactly the report you most want to find.
 */
async function review(id, { status, reviewerId, note = null }) {
  if (!REVIEWABLE.includes(status)) {
    throw new Error(
      `reportModel.review: "${status}" is not one of ${REVIEWABLE.join(', ')}`,
    )
  }

  const [result] = await pool.execute(
    `UPDATE reports
        SET status = ?, reviewed_by = ?, reviewed_at = NOW(), resolution_note = ?
      WHERE id = ?`,
    [status, reviewerId, note, id],
  )

  return result.affectedRows > 0 ? findById(id) : null
}

/**
 * Deletes a report. Used for the genuine mistakes -- someone reporting
 * their own listing by accident -- not as a way of handling one.
 * Rejecting a report is the workflow; deleting it destroys the record
 * that it was ever made.
 */
async function remove(id) {
  const [result] = await pool.execute('DELETE FROM reports WHERE id = ?', [id])
  return result.affectedRows > 0
}

/**
 * How many reports sit in each state, for the dashboard card and the
 * sidebar badge. Every key present and zeroed -- a GROUP BY over an
 * empty table returns no rows at all, and a badge reading
 * `counts.Open` would render "undefined" instead of nothing.
 */
async function statusCounts() {
  const [rows] = await pool.execute(
    'SELECT status, COUNT(*) AS n FROM reports GROUP BY status',
  )
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const row of rows) counts[row.status] = Number(row.n)
  return counts
}

/**
 * How many OPEN reports name this particular item or user -- shown on
 * the item and user detail pages so a moderator sees "3 open reports"
 * before deciding anything.
 */
async function openCountFor({ itemId = null, userId = null }) {
  const column = itemId !== null ? 'reported_item_id' : 'reported_user_id'
  const value = itemId !== null ? itemId : userId

  /* `column` is one of two string literals chosen by an if, never a
     caller-supplied name. That is the only safe way to vary a column
     in SQL, and it is worth saying out loud: a `column` argument
     accepted from outside and interpolated here would be an injection,
     prepared statement or not. */
  const [[{ n }]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM reports
      WHERE ${column} = ? AND status IN ('Open', 'Under Review')`,
    [value],
  )
  return Number(n)
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
  SORT_KEYS: Object.keys(SORTS),
}
