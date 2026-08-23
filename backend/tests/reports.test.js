/**
 * tests/reports.test.js -- POST /api/reports, the one route that WRITES
 * the reports table. Every other test that touches reports (adminReports)
 * had to INSERT rows by hand because nothing filled the queue; this suite
 * exercises the endpoint that finally does, and closes the loop by reading
 * one of its rows back out through the admin detail endpoint.
 *
 * The shape follows the same risk order as the rest of the suite: the
 * guard first (an anonymous report is refused), then the validation matrix
 * (a malformed body is a 400 at the edge, never a 500 from a schema
 * trigger), then the target checks the controller adds on top of the
 * validator (the thing you name must exist and must not be you), then the
 * duplicate keys, and finally the end-to-end proof that a filed report
 * reaches the moderation queue a moderator actually works.
 *
 * >>> WHAT THE VALIDATOR OWNS vs WHAT THE CONTROLLER OWNS <<<
 * Two different layers produce the 4xx here, and the tests are grouped to
 * keep that legible:
 *   - reportValidators turns a shapeless body into a 400: missing/invalid
 *     reason, an over-long details, and above all the "exactly one target"
 *     rule (neither or both -> 400). No database is consulted.
 *   - reportController then asks the questions only the database can
 *     answer: does that item/user exist (404), and is it the caller
 *     themselves (403)? Only past both does reportModel.create run, where
 *     the per-reporter UNIQUE keys turn a repeat into ER_DUP_ENTRY -> 409.
 *
 * >>> WHY ONLY ONE ACCOUNT FILES REPORTS <<<
 * The two UNIQUE keys are (reported_item_id, reporter_id) and
 * (reported_user_id, reporter_id): one person may report a given target
 * exactly once. Rather than spread fixtures across reporters like
 * adminReports does, this suite lets a SINGLE reporter file everything and
 * wipes that reporter's rows in afterEach -- so each test starts from an
 * empty slate and the duplicate tests can deliberately collide the key
 * inside one test without leaking into the next.
 *
 * Cleanup: accounts carry the `ureptest.` email prefix and the seeded
 * items an `ureptest.` name prefix, so afterAll removes exactly what this
 * file created. Order is reports -> items -> users: deleting the users
 * would cascade their reports anyway (reporter_id is ON DELETE CASCADE),
 * but clearing reports first keeps the intent legible. A distinct mobile
 * range (9061000000+) keeps registrations clear of the other suites' rows
 * if they ever overlap in the same database.
 */

const request = require('supertest')
const app = require('../app')
const { pool, closePool } = require('../config/db')

const PREFIX = 'ureptest.'
const LIKE = `${PREFIX}%`

/* Registers a real account and returns its token + id + email. Mirrors the
   helper in adminReports.test.js, including returning the LOWER-CASED email
   the server actually stored (registration normalizes case -- bug #1). */
async function register(label, mobile) {
  const email = `${PREFIX}${label}@test.local`
  const res = await request(app).post('/api/auth/register').send({
    name: `Report Filer ${label}`,
    email,
    mobile,
    password: 'password123',
  })
  if (!res.body?.data?.token) {
    throw new Error(`setup: could not register ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return { token: res.body.data.token, id: res.body.data.user.id, email: email.toLowerCase() }
}

/* Promotes an account by writing the ENUM directly -- same as the other
   admin suites. Used only for the account that reads the queue back. */
async function elevate(id, role) {
  await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id])
}

/* One item, seeded directly so a report has a real target to point at.
   Copied from adminReports/adminItems: real ENUM values so a strict-mode
   INSERT does not warn-and-truncate. Approved + Available by default,
   because reporting is a thing you do to a listing you can actually see. */
async function insertItem({ ownerId, name, moderation = 'Approved', status = 'Available' }) {
  const [result] = await pool.execute(
    `INSERT INTO items
       (user_id, name, description, category, item_condition,
        location, college_id, image_url, status, moderation_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      name,
      'An item seeded for the POST /api/reports suite.',
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

/* POST /api/reports with a bearer token and a JSON body, in one line. */
function fileReport(token, body) {
  return request(app).post('/api/reports').set('Authorization', `Bearer ${token}`).send(body)
}

let reporter // files every report in this suite (role: user)
let owner // owns the item/account that gets reported (role: user)
let admin // reads the queue back at the end (role: admin)

let ownerItem // owned by owner -- the legitimate target of a report
let reporterItem // owned by reporter -- used to prove self-reporting is refused

async function wipe() {
  // reports -> items -> users. See the file header for the order.
  await pool.execute('DELETE FROM reports WHERE details LIKE ?', [LIKE])
  await pool.execute('DELETE FROM items WHERE name LIKE ?', [LIKE])
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [LIKE])
}

beforeAll(async () => {
  await wipe()

  reporter = await register('reporter', '9061000001')
  owner = await register('owner', '9061000002')
  admin = await register('admin', '9061000003')

  await elevate(admin.id, 'admin')
  // reporter and owner stay plain 'user'.

  ownerItem = await insertItem({ ownerId: owner.id, name: `${PREFIX}owner-item` })
  reporterItem = await insertItem({ ownerId: reporter.id, name: `${PREFIX}reporter-item` })
})

afterEach(async () => {
  // Clear every report this reporter filed during the test, by reporter_id
  // rather than by details so a report filed WITHOUT details is caught too.
  // This is what lets one reporter file across many tests without tripping
  // the per-reporter UNIQUE key -- each test begins with none of its own.
  await pool.execute('DELETE FROM reports WHERE reporter_id = ?', [reporter.id])
})

afterAll(async () => {
  await wipe()
  await closePool()
})

/* ================================================================
   GUARD -- filing a report requires an account
   ================================================================ */
describe('POST /api/reports guard', () => {
  it('401s without a token (anonymous reports are not accepted)', async () => {
    const res = await request(app).post('/api/reports').send({ reason: 'Spam', itemId: ownerItem })
    expect(res.status).toBe(401)
  })
})

/* ================================================================
   VALIDATION -- the body reportValidators turns away (400)
   ================================================================ */
describe('POST /api/reports validation', () => {
  it('400s a missing reason', async () => {
    const res = await fileReport(reporter.token, { itemId: ownerItem })
    expect(res.status).toBe(400)
  })

  it('400s a reason outside the ENUM', async () => {
    const res = await fileReport(reporter.token, { reason: 'Nonsense', itemId: ownerItem })
    expect(res.status).toBe(400)
  })

  it('400s naming NEITHER target (the exactly-one rule, empty side)', async () => {
    const res = await fileReport(reporter.token, { reason: 'Spam' })
    expect(res.status).toBe(400)
  })

  it('400s naming BOTH targets (the exactly-one rule, full side)', async () => {
    const res = await fileReport(reporter.token, { reason: 'Spam', itemId: ownerItem, userId: owner.id })
    expect(res.status).toBe(400)
  })

  it('400s details longer than the column (1000 chars)', async () => {
    const res = await fileReport(reporter.token, {
      reason: 'Other',
      itemId: ownerItem,
      details: 'x'.repeat(1001),
    })
    expect(res.status).toBe(400)
  })

  it('400s a non-numeric itemId', async () => {
    const res = await fileReport(reporter.token, { reason: 'Spam', itemId: 'not-a-number' })
    expect(res.status).toBe(400)
  })

  it('carries field-level detail on a validation failure', async () => {
    // The house 400 shape: { success:false, message, details:[{field,...}] }.
    const res = await fileReport(reporter.token, { reason: 'Spam' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(Array.isArray(res.body.details)).toBe(true)
  })
})

/* ================================================================
   SUCCESS -- a well-formed report is created (201)
   ================================================================ */
describe('POST /api/reports success', () => {
  it('files an item report and returns the reporter-facing shape', async () => {
    const details = `${PREFIX}this listing looks like spam`
    const res = await fileReport(reporter.token, { reason: 'Spam', itemId: ownerItem, details })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe('Report submitted')

    const data = res.body.data
    expect(data.status).toBe('Open') // freshly filed, unreviewed
    expect(data.reason).toBe('Spam')
    expect(data.details).toBe(details)
    expect(data.reported_item_id).toBe(ownerItem)
    expect(data.reported_user_id).toBeNull()
    expect(data.reporter_id).toBe(reporter.id) // from the token, always
    expect(data.item_name).toBe(`${PREFIX}owner-item`) // target name travels
    expect(data.reported_user_name).toBeNull()
  })

  it('does NOT leak moderation internals to the reporter', async () => {
    // shapeReport deliberately withholds the reviewer/resolution columns and
    // both parties' emails -- the filer sees WHAT they filed, nothing about
    // how staff will handle it.
    const res = await fileReport(reporter.token, {
      reason: 'Fraud',
      itemId: ownerItem,
      details: `${PREFIX}leak check`,
    })
    expect(res.status).toBe(201)
    const data = res.body.data
    expect(data).not.toHaveProperty('reporter_email')
    expect(data).not.toHaveProperty('reported_user_email')
    expect(data).not.toHaveProperty('reviewed_by')
    expect(data).not.toHaveProperty('reviewer_name')
    expect(data).not.toHaveProperty('resolution_note')
  })

  it('files a user report (names an account, not a listing)', async () => {
    const res = await fileReport(reporter.token, {
      reason: 'Inappropriate',
      userId: owner.id,
      details: `${PREFIX}this account is abusive`,
    })
    expect(res.status).toBe(201)
    const data = res.body.data
    expect(data.reported_user_id).toBe(owner.id)
    expect(data.reported_item_id).toBeNull()
    expect(data.item_name).toBeNull()
    expect(data.reported_user_name).toBeTruthy() // the account's name joins in
  })

  it('stores NULL details when they are omitted', async () => {
    const res = await fileReport(reporter.token, { reason: 'Duplicate', itemId: ownerItem })
    expect(res.status).toBe(201)
    expect(res.body.data.details).toBeNull()
  })

  it('ignores a reporterId in the body and uses the token', async () => {
    // The classic impersonation attempt: name someone else as the reporter.
    // protect.js is the only source of identity, so the admin id here must
    // be ignored and the row credited to the reporter who holds the token.
    const res = await fileReport(reporter.token, {
      reason: 'Spam',
      itemId: ownerItem,
      reporterId: admin.id,
      details: `${PREFIX}spoofed reporter attempt`,
    })
    expect(res.status).toBe(201)
    expect(res.body.data.reporter_id).toBe(reporter.id)
    expect(res.body.data.reporter_id).not.toBe(admin.id)
  })
})

/* ================================================================
   TARGET CHECKS -- what the controller adds on top of the validator
   ================================================================ */
describe('POST /api/reports target checks', () => {
  it('404s reporting a non-existent item', async () => {
    const res = await fileReport(reporter.token, { reason: 'Spam', itemId: 99999999 })
    expect(res.status).toBe(404)
  })

  it('404s reporting a non-existent user', async () => {
    const res = await fileReport(reporter.token, { reason: 'Spam', userId: 99999999 })
    expect(res.status).toBe(404)
  })

  it('403s reporting your own listing', async () => {
    // reporterItem is owned by the reporter -- the controller refuses it
    // before the row is written (edit or delete your own listing instead).
    const res = await fileReport(reporter.token, { reason: 'Spam', itemId: reporterItem })
    expect(res.status).toBe(403)
  })

  it('403s reporting yourself', async () => {
    const res = await fileReport(reporter.token, { reason: 'Other', userId: reporter.id })
    expect(res.status).toBe(403)
  })
})

/* ================================================================
   DUPLICATES -- the per-reporter UNIQUE keys (409)
   ================================================================ */
describe('POST /api/reports duplicates', () => {
  it('409s a second report of the SAME item by the same reporter', async () => {
    const first = await fileReport(reporter.token, {
      reason: 'Spam',
      itemId: ownerItem,
      details: `${PREFIX}dup item first`,
    })
    expect(first.status).toBe(201)

    const second = await fileReport(reporter.token, {
      reason: 'Fraud', // different reason, still the same (item, reporter) key
      itemId: ownerItem,
      details: `${PREFIX}dup item second`,
    })
    expect(second.status).toBe(409)
  })

  it('409s a second report of the SAME user by the same reporter', async () => {
    const first = await fileReport(reporter.token, {
      reason: 'Inappropriate',
      userId: owner.id,
      details: `${PREFIX}dup user first`,
    })
    expect(first.status).toBe(201)

    const second = await fileReport(reporter.token, {
      reason: 'Spam',
      userId: owner.id,
      details: `${PREFIX}dup user second`,
    })
    expect(second.status).toBe(409)
  })
})

/* ================================================================
   THE LOOP -- a filed report reaches the moderation queue
   ================================================================
   Everything above proves the endpoint answers correctly. This proves
   the point of the endpoint existing at all: the row it writes is the
   very row a moderator later works. The reporter files; an admin reads
   it back through GET /api/admin/reports/:id and sees the full reviewer
   shape, credited to the right reporter, Open and awaiting a decision.
   ================================================================ */
describe('a filed report reaches the admin queue', () => {
  it('is readable through the admin detail endpoint, credited to the filer', async () => {
    const filed = await fileReport(reporter.token, {
      reason: 'Wrong Category',
      itemId: ownerItem,
      details: `${PREFIX}end-to-end loop`,
    })
    expect(filed.status).toBe(201)
    const id = filed.body.data.id

    const seen = await request(app)
      .get(`/api/admin/reports/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
    expect(seen.status).toBe(200)

    const report = seen.body.data
    expect(report.id).toBe(id)
    expect(report.status).toBe('Open')
    expect(report.reason).toBe('Wrong Category')
    expect(report.reported_item_id).toBe(ownerItem)
    // the admin shape resolves the joins the reporter never saw
    expect(report.reporter_email).toBe(reporter.email)
    expect(report.item_name).toBe(`${PREFIX}owner-item`)
  })
})
