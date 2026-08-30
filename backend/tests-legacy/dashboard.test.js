/**
 * tests/dashboard.test.js -- AUTHORIZATION tests.
 *
 * WHAT IS DIFFERENT ABOUT THIS FILE?
 * auth.test.js asked "can the wrong person get IN?" -- authentication.
 * This file asks the harder question: "once someone is legitimately
 * in, can they see data that is not theirs?" -- authorization.
 *
 * That failure is worse than a broken login, because nothing looks
 * wrong. Every request has a valid token. The logs show a successful
 * 200. The attacker is a real, logged-in user who simply asked for
 * somebody else's row -- and got it.
 *
 * >>> WHY THIS FILE BUILDS ITS OWN TWO USERS <<<
 * It would be shorter to log in as the seeded Aarav and Priya and
 * compare their dashboards. But then every number depends on
 * seed-db.js, so editing the seed data breaks tests that have nothing
 * to do with seeding -- and worse, if the seed ever gave two users the
 * same counts, a leak between them would produce IDENTICAL numbers and
 * the test would still pass.
 *
 * So: two users created here, with DELIBERATELY DIFFERENT counts.
 * ALICE owns 3 items (2 Available, 1 Reserved) and sends 1 request.
 * BOB owns 1 item and sends none. Every number differs, so any
 * crossed wire changes a value the test is watching.
 *
 * CLEANUP: both users are removed in afterAll, and ON DELETE CASCADE
 * takes their items and requests with them.
 */

const request = require('supertest')
const app = require('../app')
const { pool, closePool } = require('../config/db')
const { signToken } = require('../utils/token')

const TEST_TAG = 'dashtest'

const credentials = (who) => ({
  name: `Dash ${who}`,
  email: `${TEST_TAG}.${who}@test.local`,
  mobile: '9876500000',
  password: 'correct-horse-9',
})

// Filled in by beforeAll.
const alice = {}
const bob = {}

/** Inserts an item directly, which is faster than an API that does
 *  not exist yet -- POST /api/items arrives in Phase 8. */
async function addItem(userId, name, status) {
  const [res] = await pool.execute(
    `INSERT INTO items (user_id, name, description, category, item_condition, location, status)
     VALUES (?, ?, 'Created by dashboard.test.js', 'Books', 'Good', 'Test City', ?)`,
    [userId, name, status],
  )
  return res.insertId
}

beforeAll(async () => {
  for (const [who, target] of [['alice', alice], ['bob', bob]]) {
    const res = await request(app).post('/api/auth/register').send(credentials(who))
    target.id = res.body.data.user.id
    target.token = res.body.data.token
    target.auth = `Bearer ${res.body.data.token}`
  }

  alice.items = [
    await addItem(alice.id, 'Alice Item One', 'Available'),
    await addItem(alice.id, 'Alice Item Two', 'Available'),
    await addItem(alice.id, 'Alice Item Three', 'Reserved'),
  ]
  bob.items = [await addItem(bob.id, 'Bob Item One', 'Available')]

  // Bob asks Alice for something: one request RECEIVED by Alice, one
  // SENT by Bob. Nobody requests their own item -- the request system
  // in Phase 10 forbids it, and the seed data follows the same rule.
  await pool.execute(
    `INSERT INTO requests (item_id, requester_id, status, message)
     VALUES (?, ?, 'Pending', 'Dashboard test request')`,
    [alice.items[0], bob.id],
  )
})

afterAll(async () => {
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [`${TEST_TAG}.%`])
  await closePool()
})

/* ===============================================================
   THE HAPPY PATH -- are the numbers actually right?
   =============================================================== */
describe('GET /api/dashboard', () => {
  it('returns the caller\'s own profile, stats and recent items', async () => {
    const res = await request(app).get('/api/dashboard').set('Authorization', alice.auth)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user.id).toBe(alice.id)
    expect(res.body.data.stats).toBeDefined()
    expect(Array.isArray(res.body.data.recentItems)).toBe(true)
  })

  it('counts items by status, and counts only this user\'s items', async () => {
    const res = await request(app).get('/api/dashboard').set('Authorization', alice.auth)

    expect(res.body.data.stats.items).toEqual({
      total: 3,
      available: 2,
      reserved: 1,
      unavailable: 0,
    })
  })

  it('returns counts as numbers, never as strings', async () => {
    // >>> THE mysql2 DECIMAL TRAP <<<
    // COUNT(*) arrives as a number but SUM() arrives as a STRING,
    // because MySQL types it DECIMAL and mysql2 preserves precision
    // by not converting. statsModel.js casts with Number(); this test
    // fails the moment a cast is dropped.
    //
    // Without it the bug is nearly invisible: React renders "2" and 2
    // identically, and it only surfaces when someone adds two stats
    // together and gets "22".
    const res = await request(app).get('/api/dashboard').set('Authorization', alice.auth)
    const { items, requestsReceived, requestsSent } = res.body.data.stats

    for (const group of [items, requestsReceived, requestsSent]) {
      Object.entries(group).forEach(([key, value]) => {
        expect(typeof value).toBe(`number`) // key: ${key}
        expect(Number.isNaN(value)).toBe(false)
      })
    }
  })

  it('separates requests RECEIVED from requests SENT', async () => {
    // These two travel different paths through the schema -- received
    // goes requests -> items -> items.user_id, sent reads
    // requests.requester_id directly. Confusing them would show a
    // user their own outgoing requests as incoming ones.
    const aliceRes = await request(app).get('/api/dashboard').set('Authorization', alice.auth)
    const bobRes = await request(app).get('/api/dashboard').set('Authorization', bob.auth)

    // Bob asked Alice for one item.
    expect(aliceRes.body.data.stats.requestsReceived).toEqual({ total: 1, pending: 1 })
    expect(aliceRes.body.data.stats.requestsSent).toEqual({ total: 0, pending: 0, accepted: 0 })

    expect(bobRes.body.data.stats.requestsSent).toEqual({ total: 1, pending: 1, accepted: 0 })
    expect(bobRes.body.data.stats.requestsReceived).toEqual({ total: 0, pending: 0 })
  })

  it('returns zeroes, not nulls, for a brand-new account', async () => {
    // SUM() over zero rows is NULL, not 0 -- COALESCE handles it.
    // Without that, a new user's dashboard would render "null items".
    const fresh = await request(app).post('/api/auth/register').send(credentials('fresh'))
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${fresh.body.data.token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.stats.items).toEqual({
      total: 0, available: 0, reserved: 0, unavailable: 0,
    })
    expect(res.body.data.stats.requestsReceived).toEqual({ total: 0, pending: 0 })
    expect(res.body.data.recentItems).toEqual([])
  })

  it('never includes a password or another user\'s contact details', async () => {
    // >>> SECURITY <<<
    // itemModel JOINs users, so email and mobile are one word away
    // from being selected. Asserting on the whole body catches them
    // anywhere, including in a field nobody anticipated.
    const res = await request(app).get('/api/dashboard').set('Authorization', alice.auth)
    const body = JSON.stringify(res.body)

    expect(body).not.toMatch(/password/i)
    expect(body).not.toMatch(/\$2[aby]\$/)
    expect(body).not.toMatch(credentials('bob').email)
  })
})

/* ===============================================================
   AUTHORIZATION -- the heart of this phase
   =============================================================== */
describe('dashboard data scoping', () => {
  it('gives two users completely different answers', async () => {
    const a = await request(app).get('/api/dashboard').set('Authorization', alice.auth)
    const b = await request(app).get('/api/dashboard').set('Authorization', bob.auth)

    expect(a.body.data.user.id).not.toBe(b.body.data.user.id)
    expect(a.body.data.stats.items.total).toBe(3)
    expect(b.body.data.stats.items.total).toBe(1)
  })

  it('ignores every attempt to name a different user in the request', async () => {
    // >>> THE CENTRAL SECURITY TEST OF PHASE 7 <<<
    // Bob is a real logged-in user with a valid token. He now asks for
    // Alice's dashboard using every channel an HTTP request offers:
    // query string, body, and a custom header. The endpoint takes its
    // id from req.user.id -- set by protect.js from a VERIFIED
    // signature -- so all of these are simply ignored.
    //
    // If any of them worked, Bob could walk ?userId=1,2,3 through the
    // entire user table, and each response would be a normal 200.
    const attempts = [
      request(app).get(`/api/dashboard?userId=${alice.id}`).set('Authorization', bob.auth),
      request(app).get(`/api/dashboard?id=${alice.id}`).set('Authorization', bob.auth),
      request(app).get(`/api/dashboard?user_id=${alice.id}`).set('Authorization', bob.auth),
      request(app).get('/api/dashboard').set('Authorization', bob.auth).send({ userId: alice.id }),
      request(app).get('/api/dashboard').set('Authorization', bob.auth).set('X-User-Id', String(alice.id)),
    ]

    for (const attempt of attempts) {
      const res = await attempt
      expect(res.status).toBe(200)
      expect(res.body.data.user.id).toBe(bob.id)
      expect(res.body.data.stats.items.total).toBe(1) // Bob's count, not Alice's 3
      res.body.data.recentItems.forEach((item) => {
        expect(item.user_id).toBe(bob.id)
      })
    }
  })

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/dashboard')

    expect(res.status).toBe(401)
    expect(res.body.data).toBeUndefined()
  })

  it('rejects a forged token and a token for a deleted account', async () => {
    // Both are already covered for /api/auth/me, but `protect` guards
    // each route independently -- a route is only as protected as its
    // own middleware list, so each protected route earns its own test.
    const forged = require('jsonwebtoken').sign(
      { id: alice.id }, 'not-the-real-secret', { expiresIn: '7d' },
    )

    const withForged = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${forged}`)
    expect(withForged.status).toBe(401)

    const withGhost = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${signToken(999999)}`)
    expect(withGhost.status).toBe(401)
  })
})

/* ===============================================================
   GET /api/items/mine
   =============================================================== */
describe('GET /api/items/mine', () => {
  it('returns only the caller\'s items', async () => {
    const res = await request(app).get('/api/items/mine').set('Authorization', alice.auth)

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(3)
    res.body.data.forEach((item) => {
      expect(item.user_id).toBe(alice.id)
    })
  })

  it('includes items that are NOT Available', async () => {
    // The public list will eventually hide reserved items; your own
    // list must not, or an item would vanish from the only screen
    // where you can manage it.
    const res = await request(app).get('/api/items/mine').set('Authorization', alice.auth)
    const statuses = res.body.data.map((i) => i.status)

    expect(statuses).toContain('Reserved')
  })

  it('is matched as a literal path, not as /:id', async () => {
    // >>> ROUTE ORDER <<<
    // Express matches top to bottom, and '/:id' would happily match
    // the text "mine". If the two routes in itemRoutes.js were
    // swapped, this request would reach getItemById and answer
    // 400 "Item id must be a positive whole number" -- an error that
    // sends you looking for a bug in the frontend's fetch call.
    const res = await request(app).get('/api/items/mine').set('Authorization', alice.auth)

    expect(res.status).toBe(200)
    expect(res.body.data).toBeDefined()
  })

  it('honours ?limit and cannot be injected through it', async () => {
    // LIMIT cannot be a bound parameter in a prepared statement, so
    // itemModel interpolates it -- which is only safe because
    // parseInt has proven it is an integer first.
    const limited = await request(app)
      .get('/api/items/mine?limit=2')
      .set('Authorization', alice.auth)
    expect(limited.body.data).toHaveLength(2)

    const injected = await request(app)
      .get(`/api/items/mine?limit=${encodeURIComponent('2; DROP TABLE items;--')}`)
      .set('Authorization', alice.auth)
    expect(injected.status).toBe(200)

    // Prove the damage did not happen: the table still answers.
    const after = await request(app).get('/api/items')
    expect(after.status).toBe(200)
    expect(after.body.count).toBeGreaterThan(0)
  })

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/items/mine')

    expect(res.status).toBe(401)
    expect(res.body.data).toBeUndefined()
  })
})
