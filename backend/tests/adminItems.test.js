/**
 * tests/adminItems.test.js -- the /api/admin/items surface: the
 * moderation queue, item detail, and the moderation decision itself.
 *
 * The shape follows the same risk order as adminUsers.test.js: the guard
 * matrix first (who is turned away is more important than what the right
 * person sees), then the reads, then the mutation -- ending with the one
 * consequence that reaches outside the admin panel, that hiding a listing
 * removes it from the public site.
 *
 * >>> WHY ITEMS ARE SEEDED WITH DIRECT SQL, NOT THE POST ENDPOINT <<<
 * The same reason adminUsers elevates roles with an UPDATE rather than an
 * API call: a test owns its database, and going through POST /api/items
 * would couple these moderation tests to the create endpoint's contract
 * AND could only ever produce 'Approved' rows (new listings publish
 * immediately -- see itemModel.create). This suite needs a Pending row
 * and a Hidden row to exist BEFORE any moderation happens, which only a
 * direct insert can arrange. The owner is a real, registered, active
 * account so the public-visibility check at the end is honest.
 *
 * Every account carries the `itmtest.` email prefix and every item an
 * `itmtest.` name prefix, so afterAll removes exactly what this file
 * created. Items are deleted BEFORE users: items.user_id references
 * users(id), so the other order would trip the foreign key. beforeAll
 * clears the same prefixes first, so a crashed previous run cannot 409
 * the registrations or leave stray rows skewing a count.
 */

const request = require('supertest')
const app = require('../app')
const { pool, closePool } = require('../config/db')

const PREFIX = 'itmtest.'
const LIKE = `${PREFIX}%`

/* Registers a real account and returns its token + id + email. */
async function register(label, mobile) {
  const email = `${PREFIX}${label}@test.local`
  const res = await request(app).post('/api/auth/register').send({
    name: `Item Test ${label}`,
    email,
    mobile,
    password: 'password123',
  })
  if (!res.body?.data?.token) {
    throw new Error(`setup: could not register ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return { token: res.body.data.token, id: res.body.data.user.id, email }
}

/* Promotes an account by writing the ENUM directly -- the same thing
   scripts/create-admin.js does, and adminUsers.test.js with it. */
async function elevate(id, role) {
  await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id])
}

/* Inserts one item straight into the table so the test controls its
   initial moderation_status, which the create endpoint could not. Column
   names mirror itemModel.create; category/condition/status are real ENUM
   values so a strict-mode INSERT does not warn-and-truncate. */
async function insertItem({ ownerId, name, moderation = 'Approved', status = 'Available' }) {
  const [result] = await pool.execute(
    `INSERT INTO items
       (user_id, name, description, category, item_condition,
        location, college_id, image_url, status, moderation_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      name,
      'A second-hand item seeded for the moderation test suite.',
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

function authed(method, url, token) {
  return request(app)[method](url).set('Authorization', `Bearer ${token}`)
}

let moderator
let admin
let plainUser
let owner

// Read-only fixtures for the list/detail tests -- never mutated.
let listApproved
let listPending
let listHidden
// The single item the mutation tests act on; reset in their beforeEach.
let workItem

async function wipe() {
  // audit -> items -> users. items.user_id FKs users, so users last.
  await pool.execute('DELETE FROM audit_logs WHERE admin_email LIKE ?', [LIKE])
  await pool.execute('DELETE FROM items WHERE name LIKE ?', [LIKE])
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [LIKE])
}

beforeAll(async () => {
  await wipe()

  moderator = await register('moderator', '9810000001')
  admin = await register('admin', '9810000002')
  plainUser = await register('plain', '9810000003')
  owner = await register('owner', '9810000004')

  await elevate(moderator.id, 'moderator')
  await elevate(admin.id, 'admin')
  // plainUser and owner stay 'user'.

  listApproved = await insertItem({ ownerId: owner.id, name: `${PREFIX}searchable-unicorn`, moderation: 'Approved' })
  listPending = await insertItem({ ownerId: owner.id, name: `${PREFIX}pending-lamp`, moderation: 'Pending' })
  listHidden = await insertItem({ ownerId: owner.id, name: `${PREFIX}hidden-desk`, moderation: 'Hidden' })
  workItem = await insertItem({ ownerId: owner.id, name: `${PREFIX}work-chair`, moderation: 'Approved' })
})

afterAll(async () => {
  await wipe()
  await closePool()
})

/* ================================================================
   GUARDS -- who may reach the item routes at all
   ================================================================ */
describe('admin item route guards', () => {
  it('401s the item list without a token', async () => {
    const res = await request(app).get('/api/admin/items')
    expect(res.status).toBe(401)
  })

  it('403s the item list for a plain user', async () => {
    const res = await authed('get', '/api/admin/items', plainUser.token)
    expect(res.status).toBe(403)
  })

  it('lets a moderator list items (moderation is staff-level work)', async () => {
    const res = await authed('get', '/api/admin/items', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('lets an admin list items too (admin outranks moderator)', async () => {
    const res = await authed('get', '/api/admin/items', admin.token)
    expect(res.status).toBe(200)
  })

  it('401s a moderation change without a token', async () => {
    const res = await request(app)
      .patch(`/api/admin/items/${workItem}/moderation`)
      .send({ moderation_status: 'Hidden' })
    expect(res.status).toBe(401)
  })

  it('403s a moderation change for a plain user', async () => {
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, plainUser.token)
      .send({ moderation_status: 'Hidden' })
    expect(res.status).toBe(403)
  })
})

/* ================================================================
   GET /items -- list, filters, pagination
   ================================================================ */
describe('GET /api/admin/items', () => {
  it('returns a page with pagination meta', async () => {
    const res = await authed('get', '/api/admin/items', moderator.token)
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
    // Same assertion as the user list: no ?limit, so the size comes from
    // resolvePagination reading the platform setting -- proof the item
    // list is wired to that setting and not a hardcoded default.
    const res = await authed('get', '/api/admin/items', moderator.token)
    expect(res.body.pagination.limit).toBe(20)
  })

  it('honours an explicit ?limit', async () => {
    const res = await authed('get', '/api/admin/items?limit=1', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.pagination.limit).toBe(1)
    expect(res.body.data.length).toBeLessThanOrEqual(1)
  })

  it('filters by ?moderation status', async () => {
    const res = await authed('get', '/api/admin/items?moderation=Pending&limit=100', moderator.token)
    expect(res.status).toBe(200)
    // Our seeded Pending row is present...
    expect(res.body.data.some((i) => i.id === listPending)).toBe(true)
    // ...and nothing in a different state leaked in.
    expect(res.body.data.every((i) => i.moderation_status === 'Pending')).toBe(true)
  })

  it('filters by ?search across the owner email', async () => {
    const res = await authed('get', '/api/admin/items?search=itmtest.owner&limit=100', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.data.some((i) => i.id === listApproved)).toBe(true)
    expect(res.body.data.every((i) => /itmtest\.owner/i.test(i.owner_email))).toBe(true)
  })

  it('shows pending and hidden listings the public list would hide', async () => {
    // The whole reason listForAdmin is a separate function from findAll:
    // an admin sees everything, including the states the browse grid
    // filters out. Both our non-Approved seeds show up here.
    const res = await authed('get', '/api/admin/items?search=itmtest.owner&limit=100', moderator.token)
    const ids = res.body.data.map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining([listPending, listHidden]))
  })
})

/* ================================================================
   GET /items/:id -- detail (the full admin shape)
   ================================================================ */
describe('GET /api/admin/items/:id', () => {
  it('returns the admin shape: owner email, moderation columns, request count', async () => {
    const res = await authed('get', `/api/admin/items/${listApproved}`, moderator.token)
    expect(res.status).toBe(200)

    const item = res.body.data
    expect(item.id).toBe(listApproved)
    // Fields the PUBLIC item shape deliberately omits, present here.
    expect(item.owner_email).toBe(owner.email)
    expect(item).toHaveProperty('moderation_reason')
    expect(item).toHaveProperty('moderated_by')
    expect(item).toHaveProperty('moderator_name')
    expect(Number.isFinite(Number(item.request_count))).toBe(true)
  })

  it('404s a missing id', async () => {
    const res = await authed('get', '/api/admin/items/99999999', moderator.token)
    expect(res.status).toBe(404)
  })

  it('400s a non-numeric id', async () => {
    const res = await authed('get', '/api/admin/items/not-a-number', moderator.token)
    expect(res.status).toBe(400)
  })
})

/* ================================================================
   PATCH /items/:id/moderation -- the decision
   ================================================================ */
describe('PATCH /api/admin/items/:id/moderation', () => {
  beforeEach(async () => {
    // Known baseline so test order cannot matter: approved, untouched by
    // any moderator, with no lingering reason from a previous test.
    await pool.execute(
      `UPDATE items
          SET moderation_status = 'Approved', status = 'Available',
              moderated_by = NULL, moderated_at = NULL, moderation_reason = NULL
        WHERE id = ?`,
      [workItem],
    )
  })

  it('hides a listing and stamps the acting moderator', async () => {
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Hidden' })
    expect(res.status).toBe(200)
    expect(res.body.data.moderation_status).toBe('Hidden')
    expect(Number(res.body.data.moderated_by)).toBe(moderator.id)
    expect(res.body.data.moderated_at).toBeTruthy()
  })

  it('an admin (above moderator) may also moderate', async () => {
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, admin.token)
      .send({ moderation_status: 'Hidden' })
    expect(res.status).toBe(200)
    expect(res.body.data.moderation_status).toBe('Hidden')
  })

  it('refuses a rejection with no reason (400) -- the schema requires one', async () => {
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Rejected' })
    expect(res.status).toBe(400)
  })

  it('accepts a rejection with a reason and stores it', async () => {
    const reason = 'Prohibited item -- weapons are not allowed on the platform.'
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Rejected', reason })
    expect(res.status).toBe(200)
    expect(res.body.data.moderation_status).toBe('Rejected')
    expect(res.body.data.moderation_reason).toBe(reason)
  })

  it('400s a reason longer than the column (500 chars)', async () => {
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Hidden', reason: 'x'.repeat(501) })
    expect(res.status).toBe(400)
  })

  it('requeuing to Pending clears the moderator, timestamp and reason', async () => {
    // Put it in a decided state WITH a moderator and reason first...
    await pool.execute(
      `UPDATE items
          SET moderation_status = 'Rejected', moderated_by = ?,
              moderated_at = NOW(), moderation_reason = ?
        WHERE id = ?`,
      [moderator.id, 'an earlier rejection', workItem],
    )

    // ...then send it back to the queue. setModeration nulls the decision
    // columns because the previous judgement no longer applies; the audit
    // log keeps the history.
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Pending' })
    expect(res.status).toBe(200)
    expect(res.body.data.moderation_status).toBe('Pending')
    expect(res.body.data.moderated_by).toBeNull()
    expect(res.body.data.moderated_at).toBeNull()
    expect(res.body.data.moderation_reason).toBeNull()
  })

  it('writes an audit row recording the transition', async () => {
    await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Hidden' })

    const [rows] = await pool.execute(
      `SELECT admin_email, target_type, target_id, changes
         FROM audit_logs
        WHERE target_id = ? AND action = 'item.moderation_change'
        ORDER BY id DESC LIMIT 1`,
      [workItem],
    )
    const row = rows[0]
    expect(row).toBeTruthy()
    expect(row.admin_email).toBe(moderator.email)
    expect(row.target_type).toBe('item')
    expect(Number(row.target_id)).toBe(workItem)

    const changes = typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    expect(changes.moderation_status).toEqual({ from: 'Approved', to: 'Hidden' })
  })

  it('400s an invalid moderation status', async () => {
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Quarantined' })
    expect(res.status).toBe(400)
  })

  it('400s a missing moderation status', async () => {
    const res = await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({})
    expect(res.status).toBe(400)
  })

  it('404s moderating a non-existent item', async () => {
    const res = await authed('patch', '/api/admin/items/99999999/moderation', moderator.token)
      .send({ moderation_status: 'Hidden' })
    expect(res.status).toBe(404)
  })
})

/* ================================================================
   THE CONSEQUENCE -- moderation reaches the public site
   ================================================================
   The only test here that leaves the admin surface. Everything above
   proves the row changed; this proves the change MEANS something, by
   reading the public detail route (findPublicById) that the browse grid
   and item page depend on.
   ================================================================ */
describe('moderation and public visibility', () => {
  beforeEach(async () => {
    await pool.execute(
      `UPDATE items
          SET moderation_status = 'Approved', status = 'Available',
              moderated_by = NULL, moderated_at = NULL, moderation_reason = NULL
        WHERE id = ?`,
      [workItem],
    )
  })

  it('an approved listing is visible on the public detail route', async () => {
    const res = await request(app).get(`/api/items/${workItem}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(workItem)
  })

  it('hiding it removes it from the public detail route immediately', async () => {
    await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Hidden' })

    const res = await request(app).get(`/api/items/${workItem}`)
    expect(res.status).toBe(404)
  })

  it('approving it again restores public visibility', async () => {
    await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Hidden' })
    await authed('patch', `/api/admin/items/${workItem}/moderation`, moderator.token)
      .send({ moderation_status: 'Approved' })

    const res = await request(app).get(`/api/items/${workItem}`)
    expect(res.status).toBe(200)
    expect(res.body.data.moderation_status).toBe('Approved')
  })
})
