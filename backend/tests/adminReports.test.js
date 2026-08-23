/**
 * tests/adminReports.test.js -- the /api/admin/reports surface: the
 * complaint queue, one report in full, and the review decision itself.
 *
 * The shape follows the same risk order as adminItems.test.js: the guard
 * matrix first (who is turned away matters more than what the right
 * person sees), then the reads, then the mutation -- and it ends on the
 * one property that makes reports their own slice rather than a corner of
 * item moderation: reviewing a complaint does NOT touch the thing it
 * complains about. Closing the report and hiding the listing are two
 * separate acts, and the last describe proves the review leaves the item
 * exactly where it was.
 *
 * >>> WHY REPORTS ARE SEEDED WITH DIRECT SQL, NOT AN ENDPOINT <<<
 * The same reason adminItems seeds items directly: a test owns its
 * database. There is no user-facing "file a report" route wired yet
 * (reportModel.create has no caller -- the queue is structurally empty
 * until one exists), so a direct INSERT is the ONLY way to put a report
 * in front of the review endpoint at all. Seeding by hand also lets this
 * suite arrange the states a reviewer actually faces -- an Open item
 * report, an Under Review user report, a Resolved one -- which no single
 * call could produce.
 *
 * >>> THE ONE SEEDING RULE THAT BITES <<<
 * A report names EITHER an item OR a user, never both and never neither
 * -- two triggers in schema.sql enforce it with SIGNAL SQLSTATE '45000'.
 * So insertReport() takes exactly one of itemId/userId, and every seed
 * below passes one and leaves the other null. The two UNIQUE keys (one
 * per target kind, scoped to the reporter) mean the same person cannot
 * report the same thing twice, so the fixtures spread their reports
 * across three different reporters to stay clear of that key.
 *
 * Cleanup: every account carries the `rpttest.` email prefix, the seeded
 * item an `rpttest.` name prefix, and every report an `rpttest.` details
 * prefix, so afterAll removes exactly what this file created. Order is
 * audit -> reports -> items -> users: reports reference items and users
 * (ON DELETE CASCADE would take them anyway, but deleting them first
 * keeps the intent legible), and audit_logs.admin_id references users, so
 * users go last. beforeAll clears the same prefixes first, so a crashed
 * previous run cannot 409 the registrations or skew a count.
 */

const request = require('supertest')
const app = require('../app')
const { pool, closePool } = require('../config/db')

const PREFIX = 'rpttest.'
const LIKE = `${PREFIX}%`

/* Registers a real account and returns its token + id + email. */
async function register(label, mobile) {
  const email = `${PREFIX}${label}@test.local`
  const res = await request(app).post('/api/auth/register').send({
    name: `Report Test ${label}`,
    email,
    mobile,
    password: 'password123',
  })
  if (!res.body?.data?.token) {
    throw new Error(`setup: could not register ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  }
  // Return the email the SERVER stored, not the one we typed. Registration
  // normalizes to lower case (see the bug #1 fix), so a label with capitals
  // -- reporterA, reportedUser -- comes back lower-cased. Asserting against
  // this value keeps the test truthful regardless of how a label is cased.
  return { token: res.body.data.token, id: res.body.data.user.id, email: email.toLowerCase() }
}

/* Promotes an account by writing the ENUM directly -- the same thing
   adminItems.test.js and adminUsers.test.js do. */
async function elevate(id, role) {
  await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id])
}

/* One item, seeded directly so a report has something real to point at.
   Mirrors insertItem in adminItems.test.js: real ENUM values so a
   strict-mode INSERT does not warn-and-truncate. */
async function insertItem({ ownerId, name, moderation = 'Approved', status = 'Available' }) {
  const [result] = await pool.execute(
    `INSERT INTO items
       (user_id, name, description, category, item_condition,
        location, college_id, image_url, status, moderation_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      name,
      'An item seeded for the reports test suite.',
      'Books',
      'Good',
      'Test Campus, Test City',
      null,
      null,
      status,
      moderation,
    ],
  )
  return result.insertId
}

/* One report, seeded directly -- the only way to get a row in front of
   the review endpoint (no create route is wired yet). Exactly one of
   itemId/userId must be non-null or the schema triggers reject the row;
   the caller is responsible for that, and every seed below honours it.
   `details` is always prefixed so afterAll can find the row. */
async function insertReport({ reporterId, itemId = null, userId = null, reason = 'Spam', status = 'Open', details }) {
  const [result] = await pool.execute(
    `INSERT INTO reports
       (reporter_id, reported_item_id, reported_user_id, reason, details, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reporterId, itemId, userId, reason, details, status],
  )
  return result.insertId
}

function authed(method, url, token) {
  return request(app)[method](url).set('Authorization', `Bearer ${token}`)
}

let moderator
let admin
let plainUser
let reporterA
let reporterB
let reporterC
let reportedUser
let owner

let reportedItem

// Read-only fixtures for the list/detail tests -- never mutated.
let reportOpenItem // reporterA -> item, Spam, Open
let reportUnderReviewUser // reporterA -> user, Inappropriate, Under Review
let reportResolvedItem // reporterB -> item, Fraud, Resolved
// The report the mutation tests act on; reset in their beforeEach.
let workReport // reporterC -> item, Other, Open

async function wipe() {
  // audit -> reports -> items -> users. See the file header for the order.
  await pool.execute('DELETE FROM audit_logs WHERE admin_email LIKE ?', [LIKE])
  await pool.execute('DELETE FROM reports WHERE details LIKE ?', [LIKE])
  await pool.execute('DELETE FROM items WHERE name LIKE ?', [LIKE])
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [LIKE])
}

beforeAll(async () => {
  await wipe()

  moderator = await register('moderator', '9830000001')
  admin = await register('admin', '9830000002')
  plainUser = await register('plain', '9830000003')
  reporterA = await register('reporterA', '9830000004')
  reporterB = await register('reporterB', '9830000005')
  reporterC = await register('reporterC', '9830000006')
  reportedUser = await register('reportedUser', '9830000007')
  owner = await register('owner', '9830000008')

  await elevate(moderator.id, 'moderator')
  await elevate(admin.id, 'admin')
  // everyone else stays 'user'.

  reportedItem = await insertItem({ ownerId: owner.id, name: `${PREFIX}reported-item`, moderation: 'Approved' })

  // Four reports across three reporters so no (target, reporter) UNIQUE
  // key collides. reporterA files two -- but on DIFFERENT targets (the
  // item, then the user), which are two different unique keys.
  reportOpenItem = await insertReport({
    reporterId: reporterA.id,
    itemId: reportedItem,
    reason: 'Spam',
    status: 'Open',
    details: `${PREFIX}open item report`,
  })
  reportUnderReviewUser = await insertReport({
    reporterId: reporterA.id,
    userId: reportedUser.id,
    reason: 'Inappropriate',
    status: 'Under Review',
    details: `${PREFIX}under-review user report`,
  })
  reportResolvedItem = await insertReport({
    reporterId: reporterB.id,
    itemId: reportedItem,
    reason: 'Fraud',
    status: 'Resolved',
    details: `${PREFIX}resolved item report`,
  })
  workReport = await insertReport({
    reporterId: reporterC.id,
    itemId: reportedItem,
    reason: 'Other',
    status: 'Open',
    details: `${PREFIX}work report`,
  })
})

afterAll(async () => {
  await wipe()
  await closePool()
})

/* ================================================================
   GUARDS -- who may reach the report routes at all
   ================================================================ */
describe('admin report route guards', () => {
  it('401s the report list without a token', async () => {
    const res = await request(app).get('/api/admin/reports')
    expect(res.status).toBe(401)
  })

  it('403s the report list for a plain user', async () => {
    const res = await authed('get', '/api/admin/reports', plainUser.token)
    expect(res.status).toBe(403)
  })

  it('lets a moderator list reports (the complaint queue is staff-level work)', async () => {
    const res = await authed('get', '/api/admin/reports', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('lets an admin list reports too (admin outranks moderator)', async () => {
    const res = await authed('get', '/api/admin/reports', admin.token)
    expect(res.status).toBe(200)
  })

  it('401s a review without a token', async () => {
    const res = await request(app)
      .patch(`/api/admin/reports/${workReport}/review`)
      .send({ status: 'Under Review' })
    expect(res.status).toBe(401)
  })

  it('403s a review for a plain user', async () => {
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, plainUser.token)
      .send({ status: 'Under Review' })
    expect(res.status).toBe(403)
  })
})

/* ================================================================
   GET /reports -- list, filters, pagination
   ================================================================ */
describe('GET /api/admin/reports', () => {
  it('returns a page with pagination meta', async () => {
    const res = await authed('get', '/api/admin/reports', moderator.token)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.count).toBe(res.body.data.length)

    const p = res.body.pagination
    expect(p).toMatchObject({ page: 1 })
    expect(typeof p.total).toBe('number')
    expect(p.totalPages).toBeGreaterThanOrEqual(1)
    expect(p).toHaveProperty('hasPrev', false)
    expect(p).toHaveProperty('hasNext')
  })

  it('defaults the page size to the default_page_size setting (20)', async () => {
    // No ?limit, so the size comes from resolvePagination reading the
    // platform setting -- proof the report list is wired to that setting
    // and not a hardcoded default, exactly like the item and user lists.
    const res = await authed('get', '/api/admin/reports', moderator.token)
    expect(res.body.pagination.limit).toBe(20)
  })

  it('honours an explicit ?limit', async () => {
    const res = await authed('get', '/api/admin/reports?limit=1', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.pagination.limit).toBe(1)
    expect(res.body.data.length).toBeLessThanOrEqual(1)
  })

  it('filters by ?status', async () => {
    const res = await authed('get', '/api/admin/reports?status=Open&limit=100', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.data.some((r) => r.id === reportOpenItem)).toBe(true)
    expect(res.body.data.every((r) => r.status === 'Open')).toBe(true)
  })

  it('filters by ?reason', async () => {
    const res = await authed('get', '/api/admin/reports?reason=Fraud&limit=100', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.data.some((r) => r.id === reportResolvedItem)).toBe(true)
    expect(res.body.data.every((r) => r.reason === 'Fraud')).toBe(true)
  })

  it('filters by ?target=item (reports that name a listing)', async () => {
    const res = await authed('get', '/api/admin/reports?target=item&limit=100', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.data.some((r) => r.id === reportOpenItem)).toBe(true)
    // every returned row names an item and no user
    expect(res.body.data.every((r) => r.reported_item_id !== null && r.reported_user_id === null)).toBe(true)
  })

  it('filters by ?target=user (reports that name an account)', async () => {
    const res = await authed('get', '/api/admin/reports?target=user&limit=100', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.data.some((r) => r.id === reportUnderReviewUser)).toBe(true)
    expect(res.body.data.every((r) => r.reported_user_id !== null && r.reported_item_id === null)).toBe(true)
  })

  it('filters by ?search across the reporter email', async () => {
    const res = await authed('get', '/api/admin/reports?search=rpttest.reportera&limit=100', moderator.token)
    expect(res.status).toBe(200)
    // both of reporterA's reports (one on the item, one on the user) surface
    const ids = res.body.data.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining([reportOpenItem, reportUnderReviewUser]))
    expect(res.body.data.every((r) => /rpttest\.reportera/i.test(r.reporter_email))).toBe(true)
  })
})

/* ================================================================
   GET /reports/:id -- detail (the full reviewer shape)
   ================================================================ */
describe('GET /api/admin/reports/:id', () => {
  it('returns the full shape for an item report: reporter, item, review columns', async () => {
    const res = await authed('get', `/api/admin/reports/${reportOpenItem}`, moderator.token)
    expect(res.status).toBe(200)

    const report = res.body.data
    expect(report.id).toBe(reportOpenItem)
    expect(report.status).toBe('Open')
    expect(report.reason).toBe('Spam')
    // the reporter, resolved from the join
    expect(report.reporter_email).toBe(reporterA.email)
    expect(report).toHaveProperty('reporter_name')
    // it names an item, so the item joins in and the user side is null
    expect(report.item_name).toBe(`${PREFIX}reported-item`)
    expect(report).toHaveProperty('item_moderation_status')
    expect(report.reported_user_email).toBeNull()
    // review columns exist, empty on an as-yet-unreviewed report
    expect(report).toHaveProperty('resolution_note')
    expect(report).toHaveProperty('reviewed_by')
    expect(report).toHaveProperty('reviewer_name')
  })

  it('returns the reported account for a user report (not an item)', async () => {
    const res = await authed('get', `/api/admin/reports/${reportUnderReviewUser}`, moderator.token)
    expect(res.status).toBe(200)

    const report = res.body.data
    expect(report.status).toBe('Under Review')
    expect(report.reported_user_email).toBe(reportedUser.email)
    expect(report).toHaveProperty('reported_user_name')
    // a user report names no item, so the item side of the join is null
    expect(report.item_name).toBeNull()
    expect(report.reported_item_id).toBeNull()
  })

  it('404s a missing id', async () => {
    const res = await authed('get', '/api/admin/reports/99999999', moderator.token)
    expect(res.status).toBe(404)
  })

  it('400s a non-numeric id', async () => {
    const res = await authed('get', '/api/admin/reports/not-a-number', moderator.token)
    expect(res.status).toBe(400)
  })
})

/* ================================================================
   PATCH /reports/:id/review -- the decision
   ================================================================ */
describe('PATCH /api/admin/reports/:id/review', () => {
  beforeEach(async () => {
    // Known baseline so test order cannot matter: back to Open, unreviewed,
    // no lingering note. The UPDATE touches neither target column, so the
    // exactly-one-target triggers stay satisfied.
    await pool.execute(
      `UPDATE reports
          SET status = 'Open', reviewed_by = NULL, reviewed_at = NULL, resolution_note = NULL
        WHERE id = ?`,
      [workReport],
    )
  })

  it('moves a report to Under Review and stamps the reviewer', async () => {
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, moderator.token)
      .send({ status: 'Under Review' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('Under Review')
    expect(Number(res.body.data.reviewed_by)).toBe(moderator.id)
    expect(res.body.data.reviewed_at).toBeTruthy()
  })

  it('resolves a report with a note and stores it', async () => {
    const note = 'Listing taken down; complaint upheld.'
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, moderator.token)
      .send({ status: 'Resolved', note })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('Resolved')
    expect(res.body.data.resolution_note).toBe(note)
  })

  it('an admin (above moderator) may also review', async () => {
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, admin.token)
      .send({ status: 'Rejected' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('Rejected')
  })

  it('refuses to reopen a report -- status Open is a 400', async () => {
    // REVIEWABLE omits 'Open', so reportRules rejects it at the edge
    // rather than letting the model defend the rule deeper in.
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, moderator.token)
      .send({ status: 'Open' })
    expect(res.status).toBe(400)
  })

  it('400s an invalid status', async () => {
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, moderator.token)
      .send({ status: 'Archived' })
    expect(res.status).toBe(400)
  })

  it('400s a missing status', async () => {
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, moderator.token)
      .send({})
    expect(res.status).toBe(400)
  })

  it('400s a note longer than the column (500 chars)', async () => {
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, moderator.token)
      .send({ status: 'Resolved', note: 'x'.repeat(501) })
    expect(res.status).toBe(400)
  })

  it('writes an audit row recording the transition', async () => {
    await authed('patch', `/api/admin/reports/${workReport}/review`, moderator.token)
      .send({ status: 'Resolved' })

    const [rows] = await pool.execute(
      `SELECT admin_email, target_type, target_id, changes
         FROM audit_logs
        WHERE target_id = ? AND action = 'report.review'
        ORDER BY id DESC LIMIT 1`,
      [workReport],
    )
    const row = rows[0]
    expect(row).toBeTruthy()
    expect(row.admin_email).toBe(moderator.email)
    expect(row.target_type).toBe('report')
    expect(Number(row.target_id)).toBe(workReport)

    const changes = typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    expect(changes.status).toEqual({ from: 'Open', to: 'Resolved' })
  })

  it('404s reviewing a non-existent report', async () => {
    const res = await authed('patch', '/api/admin/reports/99999999/review', moderator.token)
      .send({ status: 'Resolved' })
    expect(res.status).toBe(404)
  })
})

/* ================================================================
   THE SEPARATION -- a review does not touch the thing it reports
   ================================================================
   The one test that reaches back to the reported object. Everything
   above proves the report row changed; this proves the change is
   CONTAINED -- resolving a complaint about a listing does not, on its
   own, moderate that listing. The two are separate acts, meeting only in
   the audit log; a reviewer who wants both performs both.
   ================================================================ */
describe('reviewing a report does not touch the thing it reports', () => {
  beforeEach(async () => {
    // workReport names reportedItem. Reset both to a known baseline: the
    // report Open, the item Approved and public.
    await pool.execute(
      `UPDATE reports
          SET status = 'Open', reviewed_by = NULL, reviewed_at = NULL, resolution_note = NULL
        WHERE id = ?`,
      [workReport],
    )
    await pool.execute(
      `UPDATE items
          SET moderation_status = 'Approved', status = 'Available',
              moderated_by = NULL, moderated_at = NULL, moderation_reason = NULL
        WHERE id = ?`,
      [reportedItem],
    )
  })

  it('resolving an item report leaves the item moderation_status unchanged', async () => {
    const res = await authed('patch', `/api/admin/reports/${workReport}/review`, moderator.token)
      .send({ status: 'Resolved', note: 'Handled; no action taken on the listing.' })
    expect(res.status).toBe(200)

    const [[item]] = await pool.execute('SELECT moderation_status FROM items WHERE id = ?', [reportedItem])
    expect(item.moderation_status).toBe('Approved') // still public -- the review did not hide it
  })
})
