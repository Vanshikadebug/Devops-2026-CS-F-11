/**
 * tests/adminUsers.test.js -- the /api/admin surface: the overview
 * snapshot and account management.
 *
 * The shape of this file follows the risk. The guard matrix comes
 * first, because the entire reason an admin API is dangerous is that
 * the wrong person reaching it is catastrophic in a way a wrong answer
 * never is -- so "who is turned away" is tested before "what the right
 * person sees". Then the reads, then the two mutations, then the
 * safety guards that protect an admin from themselves.
 *
 * >>> HOW ELEVATED ROLES ARE CREATED <<<
 * There is no API to mint the first admin -- by design; roles are
 * super_admin-only, which is a chicken-and-egg the bootstrap script
 * (scripts/create-admin.js) exists to break in production. A test owns
 * its database, so it registers ordinary accounts through the real
 * endpoint and then elevates them with a direct UPDATE. The tokens
 * issued at registration keep working with the new powers because
 * protect.js re-reads the user -- role and all -- from the database on
 * every request; nothing about the role is baked into the token.
 *
 * Every account, and every audit row those accounts generate, carries
 * the `admtest.` email prefix so afterAll can remove exactly what this
 * file created and nothing else. beforeAll clears the prefix first too,
 * so a crashed previous run cannot 409 the registrations on the next.
 */

const request = require('supertest')
const app = require('../app')
const { pool, closePool } = require('../config/db')

const PREFIX = 'admtest.'
const LIKE = `${PREFIX}%`

/* Registers a real account and returns its token + id + email. */
async function register(label, mobile) {
  const email = `${PREFIX}${label}@test.local`
  const res = await request(app).post('/api/auth/register').send({
    name: `Admin Test ${label}`,
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
   scripts/create-admin.js does, and the only way to create the first
   privileged account without another privileged account to do it. */
async function elevate(id, role) {
  await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id])
}

function authed(method, url, token) {
  return request(app)[method](url).set('Authorization', `Bearer ${token}`)
}

let superAdmin
let superAdmin2
let admin
let moderator
let plainUser
let target

beforeAll(async () => {
  // A clean slate, in case a previous run died before afterAll.
  await pool.execute('DELETE FROM audit_logs WHERE admin_email LIKE ?', [LIKE])
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [LIKE])

  superAdmin = await register('superadmin', '9800000001')
  superAdmin2 = await register('superadmin2', '9800000002')
  admin = await register('admin', '9800000003')
  moderator = await register('moderator', '9800000004')
  plainUser = await register('plain', '9800000005')
  target = await register('target', '9800000006')

  await elevate(superAdmin.id, 'super_admin')
  await elevate(superAdmin2.id, 'super_admin')
  await elevate(admin.id, 'admin')
  await elevate(moderator.id, 'moderator')
  // plainUser and target stay 'user'.
})

afterAll(async () => {
  // admin_email survives the account (that is the point of storing it),
  // so the audit rows still match the prefix after the users are gone --
  // but deleting them first keeps the intent obvious.
  await pool.execute('DELETE FROM audit_logs WHERE admin_email LIKE ?', [LIKE])
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [LIKE])
  await closePool()
})

/* ================================================================
   GUARDS -- who may reach each route at all
   ================================================================ */
describe('admin route guards', () => {
  it('401s the overview without a token', async () => {
    const res = await request(app).get('/api/admin/overview')
    expect(res.status).toBe(401)
  })

  it('403s the overview for a plain user', async () => {
    const res = await authed('get', '/api/admin/overview', plainUser.token)
    expect(res.status).toBe(403)
  })

  it('lets a moderator see the overview (the one staff-level route)', async () => {
    const res = await authed('get', '/api/admin/overview', moderator.token)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('401s the user list without a token', async () => {
    const res = await request(app).get('/api/admin/users')
    expect(res.status).toBe(401)
  })

  it('403s the user list for a moderator (account management is admin-only)', async () => {
    const res = await authed('get', '/api/admin/users', moderator.token)
    expect(res.status).toBe(403)
  })

  it('403s user detail for a moderator', async () => {
    const res = await authed('get', `/api/admin/users/${target.id}`, moderator.token)
    expect(res.status).toBe(403)
  })

  it('403s a status change for a moderator', async () => {
    const res = await authed('patch', `/api/admin/users/${target.id}/status`, moderator.token)
      .send({ status: 'blocked' })
    expect(res.status).toBe(403)
  })

  it('403s a role change for an admin (that route is super_admin-only)', async () => {
    const res = await authed('patch', `/api/admin/users/${target.id}/role`, admin.token)
      .send({ role: 'moderator' })
    expect(res.status).toBe(403)
  })
})

/* ================================================================
   GET /overview
   ================================================================ */
describe('GET /api/admin/overview', () => {
  it('returns the three count blocks with every key present', async () => {
    const res = await authed('get', '/api/admin/overview', admin.token)
    expect(res.status).toBe(200)

    const { users, items, reports } = res.body.data

    // Users: roles and statuses, every ENUM value present (zeroed if none).
    expect(Object.keys(users.roles).sort()).toEqual(
      ['admin', 'moderator', 'super_admin', 'user'],
    )
    expect(Object.keys(users.statuses).sort()).toEqual(['active', 'blocked'])
    for (const n of Object.values(users.roles)) expect(typeof n).toBe('number')

    // We created two super_admins in this file, so the count cannot be 0.
    expect(users.roles.super_admin).toBeGreaterThanOrEqual(2)

    // Items: the four moderation states.
    expect(Object.keys(items).sort()).toEqual(
      ['Approved', 'Hidden', 'Pending', 'Rejected'],
    )

    // Reports: the four workflow states.
    expect(Object.keys(reports).sort()).toEqual(
      ['Open', 'Rejected', 'Resolved', 'Under Review'],
    )
  })
})

/* ================================================================
   GET /users -- list, filters, pagination
   ================================================================ */
describe('GET /api/admin/users', () => {
  it('returns a page with pagination meta', async () => {
    const res = await authed('get', '/api/admin/users', admin.token)
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
    // No ?limit -- the size comes from resolvePagination, which reads the
    // platform setting. This is the assertion that proves that setting is
    // finally wired to something.
    const res = await authed('get', '/api/admin/users', admin.token)
    expect(res.body.pagination.limit).toBe(20)
  })

  it('honours an explicit ?limit', async () => {
    const res = await authed('get', '/api/admin/users?limit=1', admin.token)
    expect(res.status).toBe(200)
    expect(res.body.pagination.limit).toBe(1)
    expect(res.body.data.length).toBeLessThanOrEqual(1)
  })

  it('filters by ?search on email', async () => {
    const res = await authed('get', '/api/admin/users?search=admtest.target', admin.token)
    expect(res.status).toBe(200)
    expect(res.body.data.some((u) => u.id === target.id)).toBe(true)
    // Everything returned actually matches the term (nothing leaked in).
    expect(res.body.data.every((u) => /admtest\.target/i.test(u.email))).toBe(true)
  })

  it('filters by ?role', async () => {
    const res = await authed('get', '/api/admin/users?role=super_admin&limit=100', admin.token)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    expect(res.body.data.every((u) => u.role === 'super_admin')).toBe(true)
  })

  it('never includes a password field in the list', async () => {
    const res = await authed('get', '/api/admin/users?limit=100', admin.token)
    for (const u of res.body.data) {
      expect(u).not.toHaveProperty('password')
    }
  })
})

/* ================================================================
   GET /users/:id -- detail
   ================================================================ */
describe('GET /api/admin/users/:id', () => {
  it('returns the full profile with activity counts and no password', async () => {
    const res = await authed('get', `/api/admin/users/${target.id}`, admin.token)
    expect(res.status).toBe(200)

    const u = res.body.data
    expect(u.id).toBe(target.id)
    expect(u.email).toBe(target.email)
    expect(u).not.toHaveProperty('password')

    // The counts findByIdForAdmin adds over the plain profile. Coerced
    // before the check because a COUNT(*) can arrive from the driver as
    // a string, and whether it does is not what this test is about.
    for (const key of ['available_count', 'pending_count', 'requests_sent', 'requests_received', 'item_count']) {
      expect(u[key]).toBeDefined()
      expect(Number.isFinite(Number(u[key]))).toBe(true)
    }
  })

  it('404s a missing id', async () => {
    const res = await authed('get', '/api/admin/users/99999999', admin.token)
    expect(res.status).toBe(404)
  })

  it('400s a non-numeric id', async () => {
    const res = await authed('get', '/api/admin/users/not-a-number', admin.token)
    expect(res.status).toBe(400)
  })
})

/* ================================================================
   PATCH /users/:id/status -- block & unblock
   ================================================================ */
describe('PATCH /api/admin/users/:id/status', () => {
  beforeEach(async () => {
    // Each test starts from a known state so their order cannot matter.
    await pool.execute(
      'UPDATE users SET role = ?, status = ? WHERE id = ?',
      ['user', 'active', target.id],
    )
  })

  it('blocks a user, and the block takes effect on their very next request', async () => {
    const res = await authed('patch', `/api/admin/users/${target.id}/status`, admin.token)
      .send({ status: 'blocked' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('blocked')
    expect(res.body.message).toBe('User blocked')

    // The blocked account's own token is now refused, though it is still
    // cryptographically valid -- protect.js re-checks status every request.
    const me = await authed('get', '/api/auth/me', target.token)
    expect(me.status).toBe(403)
  })

  it('writes an audit row for a block', async () => {
    await authed('patch', `/api/admin/users/${target.id}/status`, admin.token)
      .send({ status: 'blocked' })

    const [rows] = await pool.execute(
      `SELECT admin_email, target_type, target_id, changes
         FROM audit_logs
        WHERE target_id = ? AND action = 'user.status_change'
        ORDER BY id DESC LIMIT 1`,
      [target.id],
    )
    const row = rows[0]
    expect(row).toBeTruthy()
    expect(row.admin_email).toBe(admin.email)
    expect(row.target_type).toBe('user')
    expect(Number(row.target_id)).toBe(target.id)

    const changes = typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    expect(changes.status).toEqual({ from: 'active', to: 'blocked' })
  })

  it('unblocks a user and restores their access', async () => {
    await authed('patch', `/api/admin/users/${target.id}/status`, admin.token)
      .send({ status: 'blocked' })

    const res = await authed('patch', `/api/admin/users/${target.id}/status`, admin.token)
      .send({ status: 'active' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('active')
    expect(res.body.message).toBe('User unblocked')

    const me = await authed('get', '/api/auth/me', target.token)
    expect(me.status).toBe(200)
  })

  it('treats re-blocking an already-blocked user as a no-op with no new audit row', async () => {
    await pool.execute('UPDATE users SET status = ? WHERE id = ?', ['blocked', target.id])

    const [[{ n: before }]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE target_id = ? AND action = 'user.status_change'",
      [target.id],
    )

    const res = await authed('patch', `/api/admin/users/${target.id}/status`, admin.token)
      .send({ status: 'blocked' })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/already blocked/i)

    const [[{ n: after }]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE target_id = ? AND action = 'user.status_change'",
      [target.id],
    )
    expect(after).toBe(before)
  })

  it('400s an invalid status', async () => {
    const res = await authed('patch', `/api/admin/users/${target.id}/status`, admin.token)
      .send({ status: 'sideways' })
    expect(res.status).toBe(400)
  })

  it('400s a missing status', async () => {
    const res = await authed('patch', `/api/admin/users/${target.id}/status`, admin.token)
      .send({})
    expect(res.status).toBe(400)
  })
})

/* ================================================================
   PATCH /users/:id/role -- super_admin only
   ================================================================ */
describe('PATCH /api/admin/users/:id/role', () => {
  beforeEach(async () => {
    await pool.execute(
      'UPDATE users SET role = ?, status = ? WHERE id = ?',
      ['user', 'active', target.id],
    )
  })

  it('promotes a user to moderator and records it', async () => {
    const res = await authed('patch', `/api/admin/users/${target.id}/role`, superAdmin.token)
      .send({ role: 'moderator' })
    expect(res.status).toBe(200)
    expect(res.body.data.role).toBe('moderator')

    const [rows] = await pool.execute(
      `SELECT admin_email, changes FROM audit_logs
        WHERE target_id = ? AND action = 'user.role_change'
        ORDER BY id DESC LIMIT 1`,
      [target.id],
    )
    const row = rows[0]
    expect(row).toBeTruthy()
    expect(row.admin_email).toBe(superAdmin.email)
    const changes = typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    expect(changes.role).toEqual({ from: 'user', to: 'moderator' })
  })

  it('lets a super_admin mint another super_admin', async () => {
    const res = await authed('patch', `/api/admin/users/${target.id}/role`, superAdmin.token)
      .send({ role: 'super_admin' })
    expect(res.status).toBe(200)
    expect(res.body.data.role).toBe('super_admin')
  })

  it('treats an unchanged role as a no-op with no new audit row', async () => {
    await pool.execute('UPDATE users SET role = ? WHERE id = ?', ['moderator', target.id])

    const [[{ n: before }]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE target_id = ? AND action = 'user.role_change'",
      [target.id],
    )

    const res = await authed('patch', `/api/admin/users/${target.id}/role`, superAdmin.token)
      .send({ role: 'moderator' })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/already moderator/i)

    const [[{ n: after }]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE target_id = ? AND action = 'user.role_change'",
      [target.id],
    )
    expect(after).toBe(before)
  })

  it('400s an invalid role', async () => {
    const res = await authed('patch', `/api/admin/users/${target.id}/role`, superAdmin.token)
      .send({ role: 'wizard' })
    expect(res.status).toBe(400)
  })
})

/* ================================================================
   SAFETY GUARDS -- protecting an admin from themselves
   ================================================================ */
describe('admin safety guards', () => {
  it('403s an admin trying to block a super_admin (a superior)', async () => {
    const res = await authed('patch', `/api/admin/users/${superAdmin.id}/status`, admin.token)
      .send({ status: 'blocked' })
    expect(res.status).toBe(403)
  })

  it('422s an admin trying to block their own account', async () => {
    const res = await authed('patch', `/api/admin/users/${admin.id}/status`, admin.token)
      .send({ status: 'blocked' })
    expect(res.status).toBe(422)
  })

  it('404s (not 403) an action on a non-existent account', async () => {
    // Not-found is decided before the permission checks, so a deleted id
    // reads as gone rather than forbidden.
    const res = await authed('patch', '/api/admin/users/99999999/status', admin.token)
      .send({ status: 'blocked' })
    expect(res.status).toBe(404)
  })

  it("403s a super_admin trying to change a peer super_admin's role", async () => {
    const res = await authed('patch', `/api/admin/users/${superAdmin2.id}/role`, superAdmin.token)
      .send({ role: 'admin' })
    expect(res.status).toBe(403)
  })

  it('422s a super_admin trying to change their own role', async () => {
    const res = await authed('patch', `/api/admin/users/${superAdmin.id}/role`, superAdmin.token)
      .send({ role: 'admin' })
    expect(res.status).toBe(422)
  })
})
