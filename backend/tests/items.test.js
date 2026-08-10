/**
 * tests/items.test.js -- API tests for the read-only item endpoints.
 *
 * WHAT IS DIFFERENT ABOUT THESE TESTS?
 * health.test.js exercised Express alone. These go through the WHOLE
 * stack -- route, controller, model, MySQL -- and assert on real
 * seeded rows. They are the automated version of "open the browser
 * and look at it", and unlike looking, they run in one second and
 * cannot forget to check something.
 *
 * They are READ-ONLY, so they need no transaction and no cleanup:
 * running them a hundred times leaves the database exactly as it was.
 *
 * PREREQUISITE: `npm run db:reset` must have been run at least once.
 * A test that fails because the database is empty is a confusing
 * failure, so the first test says so explicitly.
 */

const request = require('supertest')
const app = require('../app')
const { closePool } = require('../config/db')

// Without this, Jest prints "A worker process has failed to exit
// gracefully" and hangs -- the pool's open sockets keep Node's event
// loop alive after the last assertion.
afterAll(async () => {
  await closePool()
})

describe('GET /api/items', () => {
  it('returns 200 with the seeded items', async () => {
    const res = await request(app).get('/api/items')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0) // run `npm run db:reset` if this fails
    expect(res.body.count).toBe(res.body.data.length)
  })

  it('exposes `condition`, not the database name `item_condition`', async () => {
    // Guards the alias in itemModel.js. If someone "tidies up" that
    // query and drops the AS clause, every ItemCard silently renders
    // an empty condition -- a bug with no error message anywhere.
    const res = await request(app).get('/api/items')
    const item = res.body.data[0]

    expect(item).toHaveProperty('condition')
    expect(item).not.toHaveProperty('item_condition')
    expect(['New', 'Like New', 'Good', 'Fair', 'Poor']).toContain(item.condition)
  })

  it('includes every field the frontend renders', async () => {
    const res = await request(app).get('/api/items')

    // Checking ALL rows, not just the first. The seed deliberately
    // includes items with image_url = null and one with no college
    // at all; if a row were missing a key entirely, testing only
    // data[0] would sail past it.
    //
    // toEqual on the whole sorted key list, rather than a series of
    // toHaveProperty calls, is the point: it fails on a field that
    // APPEARS as well as one that disappears. That is what catches
    // the day someone adds `u.email` to the JOIN "just for debugging".
    res.body.data.forEach((item) => {
      expect(Object.keys(item).sort()).toEqual(
        [
          'area_name', 'category', 'city_name', 'college_id', 'college_name',
          'condition', 'created_at', 'description', 'id', 'image_url',
          'location', 'name', 'owner_name', 'status', 'user_id',
        ].sort(),
      )
    })
  })

  it('resolves the college of an on-campus item, and nulls for an off-campus one', async () => {
    // >>> THIS IS THE LEFT JOIN TEST <<<
    // items.college_id is nullable, so the college tables are
    // reached with LEFT JOINs. Were any of them a plain JOIN, the
    // off-campus row would not come back wrong -- it would silently
    // VANISH from every listing, which is far harder to notice.
    const res = await request(app).get('/api/items')

    const onCampus = res.body.data.filter((i) => i.college_id !== null)
    const offCampus = res.body.data.filter((i) => i.college_id === null)

    expect(onCampus.length).toBeGreaterThan(0)
    expect(offCampus.length).toBeGreaterThan(0) // run `npm run db:reset` if this fails

    onCampus.forEach((item) => {
      expect(typeof item.college_name).toBe('string')
      expect(typeof item.area_name).toBe('string')
      expect(typeof item.city_name).toBe('string')
    })

    offCampus.forEach((item) => {
      expect(item.college_name).toBeNull()
      // `location` is NOT NULL in the schema precisely so a card
      // with no college still has something true to display.
      expect(item.location).toBeTruthy()
    })
  })

  it('never leaks the owner\'s password, email or mobile', async () => {
    // >>> SECURITY TEST <<<
    // The query JOINs the users table, so those columns are one word
    // away from being returned. Asserting on the whole serialised
    // body catches them wherever they might appear -- including
    // nested inside a field we did not anticipate.
    const res = await request(app).get('/api/items')
    const body = JSON.stringify(res.body)

    expect(body).not.toMatch(/password/i)
    expect(body).not.toMatch(/\$2[aby]\$/)     // a bcrypt hash
    expect(body).not.toMatch(/@example\.com/)  // a seeded email
    expect(body).not.toMatch(/"mobile"/)

    res.body.data.forEach((item) => {
      expect(item).not.toHaveProperty('email')
      expect(item).not.toHaveProperty('mobile')
    })
  })

  it('returns items newest first, deterministically', async () => {
    const res = await request(app).get('/api/items')
    const ids = res.body.data.map((i) => i.id)

    // Every seeded row shares a created_at, so this really tests the
    // `, i.id DESC` tiebreaker -- without it the order could differ
    // between two identical requests.
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
  })

  it('returns dates as strings, not shifted by a timezone', async () => {
    // dateStrings: true in config/db.js. If it were off, mysql2 would
    // hand back JS Date objects, JSON.stringify would convert them to
    // UTC, and an item created at 23:30 IST would display as the
    // previous day in the browser.
    const res = await request(app).get('/api/items')
    expect(typeof res.body.data[0].created_at).toBe('string')
    expect(res.body.data[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})

describe('GET /api/items/:id', () => {
  it('returns the requested item', async () => {
    const list = await request(app).get('/api/items')
    const expected = list.body.data[0]

    const res = await request(app).get(`/api/items/${expected.id}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(expected.id)
    // Both endpoints share ITEM_FIELDS, so their shapes must match.
    expect(Object.keys(res.body.data).sort()).toEqual(Object.keys(expected).sort())
  })

  it('returns 404 for an id that does not exist', async () => {
    const res = await request(app).get('/api/items/999999')

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.headers['content-type']).toMatch(/json/)
  })

  it('returns 400 for an id that is not a number', async () => {
    const res = await request(app).get('/api/items/abc')

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('is not vulnerable to SQL injection in the id', async () => {
    // >>> SECURITY TEST <<<
    // The classic payload. With string concatenation this returns
    // every row. With the prepared statement in itemModel.js the
    // whole string is treated as one value, fails the numeric check,
    // and is rejected before MySQL is ever contacted.
    const res = await request(app).get('/api/items/1 OR 1=1')

    expect(res.status).toBe(400)
    expect(res.body.data).toBeUndefined()
  })

  it('survives a DROP TABLE attempt and leaves the data intact', async () => {
    // >>> SECURITY TEST <<<
    // Proving the damage did not happen matters more than the status
    // code: we re-list afterwards and confirm the table still holds
    // its rows.
    const before = await request(app).get('/api/items')

    await request(app).get(`/api/items/${encodeURIComponent('1; DROP TABLE items;--')}`)

    const after = await request(app).get('/api/items')
    expect(after.status).toBe(200)
    expect(after.body.count).toBe(before.body.count)
  })
})
