/**
 * tests/itemWrites.test.js -- POST, PUT, PATCH and DELETE on items.
 *
 * WHAT THIS FILE IS PROVING
 * Phase 8 is the first time a request can CHANGE someone's data, so
 * the majority of these tests are not about whether a field is
 * stored. They are about who is allowed to store it.
 *
 * The three questions, in order of how badly they fail:
 *
 *   1. Can a stranger with no token write anything?        (401)
 *   2. Can a logged-in user write to SOMEONE ELSE's item?  (403)
 *   3. Can a valid request corrupt its own row?            (400)
 *
 * Number 2 is the one that matters most, because it is the one that
 * still looks like a working application when it is broken. Everyone
 * notices a missing login; nobody notices that Priya can delete
 * Aarav's calculator until Aarav's calculator is gone.
 *
 * >>> THESE TESTS MUTATE DATA, SO THEY CLEAN UP AFTER THEMSELVES <<<
 * Every item created here is deleted in afterEach, and the one
 * seeded item that gets edited is restored. A suite that leaves the
 * database altered makes every LATER test depend on whether this
 * file ran first, which is how a suite starts passing and failing
 * based on file ordering. jest runs with --runInBand, so nothing
 * here races the read-only suites.
 */

const request = require('supertest')
const app = require('../app')
const { closePool } = require('../config/db')

afterAll(async () => {
  await closePool()
})

const AARAV = { email: 'aarav@example.com', password: 'password123' }
const PRIYA = { email: 'priya@example.com', password: 'password123' }

let aaravToken
let priyaToken
let aaravId
let skit
let mnit

/* Ids created during a test, deleted in afterEach. Recorded rather
   than derived, because a test that fails halfway through still has
   to clean up whatever it managed to create. */
let created = []

/** The body a valid create needs, so each test states only its own point. */
function validBody(overrides = {}) {
  return {
    name: 'Test Item — Phase 8',
    description: 'A description long enough to pass the ten-character minimum.',
    category: 'Books',
    condition: 'Good',
    collegeId: skit.id,
    ...overrides,
  }
}

async function createItem(token, body) {
  const res = await request(app)
    .post('/api/items')
    .set('Authorization', `Bearer ${token}`)
    .send(body ?? validBody())

  if (res.body?.data?.id) created.push({ id: res.body.data.id, token })
  return res
}

beforeAll(async () => {
  const a = await request(app).post('/api/auth/login').send(AARAV)
  aaravToken = a.body.token
  aaravId = a.body.user.id

  const p = await request(app).post('/api/auth/login').send(PRIYA)
  priyaToken = p.body.token

  const colleges = await request(app).get('/api/locations/colleges')
  skit = colleges.body.data.find((c) => c.slug === 'skit-jaipur')
  mnit = colleges.body.data.find((c) => c.slug === 'mnit-jaipur')
})

afterEach(async () => {
  for (const item of created) {
    await request(app)
      .delete(`/api/items/${item.id}`)
      .set('Authorization', `Bearer ${item.token}`)
  }
  created = []
})

/* ===============================================================
   AUTHENTICATION -- can a stranger write at all?
   =============================================================== */
describe('authentication', () => {
  it('401s POST without a token', async () => {
    const res = await request(app).post('/api/items').send(validBody())

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('401s PUT, PATCH and DELETE without a token', async () => {
    // Every write verb, because `protect` is per-route: omitting it
    // from one line is a complete hole in that one endpoint, and
    // testing only POST would not find it.
    const put = await request(app).put('/api/items/1').send(validBody())
    const patch = await request(app).patch('/api/items/1/status').send({ status: 'Reserved' })
    const del = await request(app).delete('/api/items/1')

    expect(put.status).toBe(401)
    expect(patch.status).toBe(401)
    expect(del.status).toBe(401)
  })

  it('401s with a forged token', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', 'Bearer not.a.real.token')
      .send(validBody())

    expect(res.status).toBe(401)
  })

  it('leaves the item untouched when a write is rejected', async () => {
    // The status code is not the claim worth testing on its own. The
    // claim is that nothing CHANGED -- a 401 response with the write
    // already committed would pass every assertion above.
    const before = await request(app).get('/api/items/1')

    await request(app).delete('/api/items/1')
    await request(app).put('/api/items/1').send(validBody({ name: 'Hijacked' }))

    const after = await request(app).get('/api/items/1')

    expect(after.status).toBe(200)
    expect(after.body.data.name).toBe(before.body.data.name)
  })
})

/* ===============================================================
   OWNERSHIP -- THE IMPORTANT SECTION
   ===============================================================
   Priya is a real, fully logged-in user. Every request below carries
   a valid token. The only thing wrong with them is that the item
   belongs to Aarav.
=============================================================== */
describe('ownership', () => {
  let aaravItemId

  beforeEach(async () => {
    const res = await createItem(aaravToken)
    aaravItemId = res.body.data.id
  })

  it("403s when another user tries to edit Aarav's item", async () => {
    const res = await request(app)
      .put(`/api/items/${aaravItemId}`)
      .set('Authorization', `Bearer ${priyaToken}`)
      .send(validBody({ name: 'Priya was here' }))

    expect(res.status).toBe(403)
  })

  it("403s when another user tries to delete Aarav's item", async () => {
    const res = await request(app)
      .delete(`/api/items/${aaravItemId}`)
      .set('Authorization', `Bearer ${priyaToken}`)

    expect(res.status).toBe(403)
  })

  it("403s when another user tries to change Aarav's item status", async () => {
    const res = await request(app)
      .patch(`/api/items/${aaravItemId}/status`)
      .set('Authorization', `Bearer ${priyaToken}`)
      .send({ status: 'Unavailable' })

    expect(res.status).toBe(403)
  })

  it('a rejected edit changes nothing at all', async () => {
    // >>> THE ASSERTION THAT ACTUALLY MATTERS <<<
    // A 403 that has already written the row is worse than no check,
    // because the status code says the system is working.
    await request(app)
      .put(`/api/items/${aaravItemId}`)
      .set('Authorization', `Bearer ${priyaToken}`)
      .send(validBody({ name: 'Priya was here', description: 'Overwritten by someone else entirely.' }))

    const after = await request(app).get(`/api/items/${aaravItemId}`)

    expect(after.status).toBe(200)
    expect(after.body.data.name).toBe('Test Item — Phase 8')
    expect(after.body.data.user_id).toBe(aaravId)
  })

  it('a rejected delete leaves the item there', async () => {
    await request(app)
      .delete(`/api/items/${aaravItemId}`)
      .set('Authorization', `Bearer ${priyaToken}`)

    const after = await request(app).get(`/api/items/${aaravItemId}`)
    expect(after.status).toBe(200)
  })

  it('the owner CAN do all three', async () => {
    // The mirror of the tests above. A middleware that returned 403
    // unconditionally would pass every ownership test so far, and be
    // completely broken.
    const edit = await request(app)
      .put(`/api/items/${aaravItemId}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send(validBody({ name: 'Edited by its owner' }))

    const status = await request(app)
      .patch(`/api/items/${aaravItemId}/status`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Reserved' })

    const del = await request(app)
      .delete(`/api/items/${aaravItemId}`)
      .set('Authorization', `Bearer ${aaravToken}`)

    expect(edit.status).toBe(200)
    expect(edit.body.data.name).toBe('Edited by its owner')
    expect(status.status).toBe(200)
    expect(status.body.data.status).toBe('Reserved')
    expect(del.status).toBe(200)

    created = [] // already gone
  })

  it('404s for an item that does not exist, before checking ownership', async () => {
    const res = await request(app)
      .delete('/api/items/999999')
      .set('Authorization', `Bearer ${priyaToken}`)

    expect(res.status).toBe(404)
  })

  it('400s on a non-numeric id rather than reaching the database', async () => {
    const res = await request(app)
      .delete('/api/items/abc')
      .set('Authorization', `Bearer ${aaravToken}`)

    expect(res.status).toBe(400)
  })
})

/* ===============================================================
   THE OWNER IS NEVER TAKEN FROM THE REQUEST
   =============================================================== */
describe('owner assignment', () => {
  it('ignores a user_id in the body and uses the token', async () => {
    // >>> THE INSECURE-DIRECT-OBJECT-REFERENCE TEST <<<
    // Every plausible spelling an attacker might try, in one body.
    // The item must belong to Priya, who sent it -- not to Aarav,
    // whose id is all over the request.
    const res = await createItem(priyaToken, {
      ...validBody(),
      user_id: aaravId,
      userId: aaravId,
      owner_id: aaravId,
      id: 1,
    })

    expect(res.status).toBe(201)
    expect(res.body.data.user_id).not.toBe(aaravId)
    // And the `id: 1` did not overwrite item 1 either.
    expect(res.body.data.id).not.toBe(1)
  })

  it('does not let PUT reassign an item to another user', async () => {
    const made = await createItem(aaravToken)

    const res = await request(app)
      .put(`/api/items/${made.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send(validBody({ user_id: 2, userId: 2 }))

    expect(res.status).toBe(200)
    expect(res.body.data.user_id).toBe(aaravId)
  })
})

/* ===============================================================
   LOCATION -- the derived-value rule
   =============================================================== */
describe('location resolution', () => {
  it('derives location text from the chosen college', async () => {
    const res = await createItem(aaravToken, validBody({ collegeId: skit.id }))

    expect(res.status).toBe(201)
    expect(res.body.data.college_id).toBe(skit.id)
    expect(res.body.data.location).toBe('Jagatpura, Jaipur')
    expect(res.body.data.college_name).toBe('SKIT Jaipur')
  })

  it('IGNORES a location that contradicts the college', async () => {
    // >>> THE POINT OF resolvePlace() <<<
    // Both fields are individually valid, so nothing rejects this
    // body. Stored as sent, the row would filter into Jagatpura and
    // PRINT as Kota -- wrong in a way that raises no error, ever.
    const res = await createItem(
      aaravToken,
      validBody({ collegeId: skit.id, location: 'Kota, Rajasthan' }),
    )

    expect(res.status).toBe(201)
    expect(res.body.data.location).toBe('Jagatpura, Jaipur')
    expect(res.body.data.location).not.toContain('Kota')
  })

  it('accepts free text when there is no college', async () => {
    const res = await createItem(
      aaravToken,
      validBody({ collegeId: null, location: 'Pratap Nagar, Jaipur' }),
    )

    expect(res.status).toBe(201)
    expect(res.body.data.college_id).toBeNull()
    expect(res.body.data.location).toBe('Pratap Nagar, Jaipur')
    // The LEFT JOIN must keep this row visible with null college
    // fields rather than dropping it -- a plain JOIN would make
    // every off-campus item silently vanish from the API.
    expect(res.body.data.college_name).toBeNull()
  })

  it('400s when neither a college nor a location is given', async () => {
    const res = await createItem(aaravToken, validBody({ collegeId: null }))
    expect(res.status).toBe(400)
  })

  /* >>> THIS TEST EXISTS BECAUSE THE SUITE MISSED A REAL BUG <<<
     Every case above sends collegeId as null, which is what a
     hand-written JSON body contains. A BROWSER does not send null: an
     unselected <select> submits the EMPTY STRING, and that is the
     value the form produces on every off-campus listing.

     collegeIdRule uses optional({ values: 'falsy' }), so '' is passed
     through unchecked as "no college". resolvePlace originally asked
     `collegeId !== undefined && collegeId !== null`, which '' fails --
     so it took the on-campus branch, looked up the college whose id is
     '', and answered 404 "No college found with id " to a request that
     was completely valid.

     Fifty-three passing tests did not catch it because all of them
     spelled absence the way a test author does, not the way a form
     does. That is the lesson worth keeping: a fixture that never uses
     the client's actual encoding tests a client that does not exist. */
  it('treats an EMPTY STRING college id as no college, like the form sends', async () => {
    const res = await createItem(
      aaravToken,
      validBody({ collegeId: '', location: 'Pratap Nagar, Jaipur' }),
    )

    expect(res.status).toBe(201)
    expect(res.body.data.college_id).toBeNull()
    expect(res.body.data.location).toBe('Pratap Nagar, Jaipur')
  })

  it('treats an empty-string college id the same way on UPDATE', async () => {
    // The same gap on the edit path would let someone clear their
    // college and get a 404 for an item that is on screen in front
    // of them.
    const made = await createItem(aaravToken, validBody({ collegeId: skit.id }))

    const res = await request(app)
      .put(`/api/items/${made.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send(validBody({ collegeId: '', location: 'Hostel B common room' }))

    expect(res.status).toBe(200)
    expect(res.body.data.college_id).toBeNull()
    expect(res.body.data.location).toBe('Hostel B common room')
  })

  it('404s for a college id that does not exist', async () => {
    const res = await createItem(aaravToken, validBody({ collegeId: 999999 }))
    expect(res.status).toBe(404)
  })

  it('re-derives the location when the college is changed', async () => {
    // The mismatch has to stay impossible through EDITS too, or
    // editing becomes the way to reintroduce it.
    const made = await createItem(aaravToken, validBody({ collegeId: skit.id }))

    const res = await request(app)
      .put(`/api/items/${made.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send(validBody({ collegeId: mnit.id }))

    expect(res.status).toBe(200)
    expect(res.body.data.college_id).toBe(mnit.id)
    expect(res.body.data.location).toBe('Malviya Nagar, Jaipur')
  })
})

/* ===============================================================
   VALIDATION
   =============================================================== */
describe('validation', () => {
  const bad = [
    ['a missing name', { name: undefined }],
    ['a blank name', { name: '   ' }],
    ['a two-character name', { name: 'ab' }],
    ['a name past VARCHAR(150)', { name: 'x'.repeat(151) }],
    ['a missing description', { description: undefined }],
    ['a nine-character description', { description: 'too short' }],
    ['an unknown category', { category: 'Bookss' }],
    ['an unknown condition', { condition: 'Mint' }],
    ['an unknown status', { status: 'Sold' }],
    ['a negative college id', { collegeId: -1 }],
    ['a non-numeric college id', { collegeId: 'skit' }],
  ]

  it.each(bad)('400s on %s', async (_label, override) => {
    const res = await createItem(aaravToken, validBody(override))
    expect(res.status).toBe(400)
  })

  it('reports every bad field at once, not just the first', async () => {
    const res = await createItem(aaravToken, {
      name: '',
      description: '',
      category: 'Nope',
      condition: 'Nope',
    })

    expect(res.status).toBe(400)
    expect(Array.isArray(res.body.details)).toBe(true)
    // One resubmit per problem is a miserable form to fill in.
    expect(res.body.details.length).toBeGreaterThan(1)
  })

  it('trims whitespace around the name', async () => {
    const res = await createItem(aaravToken, validBody({ name: '   Padded Name   ' }))

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Padded Name')
  })

  it('stores an empty image URL as null, not as an empty string', async () => {
    // '' and NULL would mean the same thing in two representations,
    // and <img src=""> makes the browser re-download the page as an
    // image. One representation for absent.
    const res = await createItem(aaravToken, validBody({ imageUrl: '' }))

    expect(res.status).toBe(201)
    expect(res.body.data.image_url).toBeNull()
  })
})

/* ===============================================================
   THE IMAGE URL -- the one field rendered into an attribute
   =============================================================== */
describe('image url safety', () => {
  const rejected = [
    ['a javascript: scheme', 'javascript:alert(1)'],
    ['a data: URI', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['a vbscript: scheme', 'vbscript:msgbox(1)'],
    ['plain http, which browsers block as mixed content', 'http://example.com/x.jpg'],
    ['a path traversal attempt', '/images/../../etc/passwd'],
    ['a path outside /images', '/etc/passwd'],
    ['a bare filename', 'photo.jpg'],
  ]

  it.each(rejected)('rejects %s', async (_label, imageUrl) => {
    const res = await createItem(aaravToken, validBody({ imageUrl }))
    expect(res.status).toBe(400)
  })

  it('accepts an https URL', async () => {
    const res = await createItem(
      aaravToken,
      validBody({ imageUrl: 'https://example.com/photo.jpg' }),
    )
    expect(res.status).toBe(201)
  })

  it('accepts a path under /images/', async () => {
    const res = await createItem(
      aaravToken,
      validBody({ imageUrl: '/images/items/casio-fx991es-calculator.jpg' }),
    )
    expect(res.status).toBe(201)
  })
})

/* ===============================================================
   THE STORED ROW
   =============================================================== */
describe('what actually gets stored', () => {
  it('returns the item in the same shape GET returns', async () => {
    // The frontend renders the POST response directly, so a create
    // that answered with fewer fields than GET would produce a card
    // that is missing its college until the next full reload.
    const made = await createItem(aaravToken)
    const fetched = await request(app).get(`/api/items/${made.body.data.id}`)

    expect(Object.keys(made.body.data).sort())
      .toEqual(Object.keys(fetched.body.data).sort())
  })

  it('defaults status to Available', async () => {
    const res = await createItem(aaravToken)
    expect(res.body.data.status).toBe('Available')
  })

  it('never returns the owner email or mobile', async () => {
    // Contact details are Phase 10, and only to an owner who has
    // ACCEPTED your request. A write endpoint is an easy place to
    // leak them by returning a joined row nobody audited.
    const res = await createItem(aaravToken)
    const body = JSON.stringify(res.body)

    expect(body).not.toContain('aarav@example.com')
    expect(body).not.toContain('9876543210')
    expect(body).not.toContain('$2b$')
  })

  it('the new item appears in GET /api/items/mine', async () => {
    const made = await createItem(aaravToken)

    const mine = await request(app)
      .get('/api/items/mine')
      .set('Authorization', `Bearer ${aaravToken}`)

    expect(mine.body.data.some((i) => i.id === made.body.data.id)).toBe(true)
  })

  it('the new item is findable by the college filter', async () => {
    const made = await createItem(aaravToken, validBody({ collegeId: mnit.id }))

    const list = await request(app).get(`/api/items?college=${mnit.id}`)

    expect(list.body.data.some((i) => i.id === made.body.data.id)).toBe(true)
  })

  it('a deleted item is gone from the list and from GET by id', async () => {
    const made = await createItem(aaravToken)
    const id = made.body.data.id

    await request(app)
      .delete(`/api/items/${id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
    created = []

    const byId = await request(app).get(`/api/items/${id}`)
    const list = await request(app).get('/api/items')

    expect(byId.status).toBe(404)
    expect(list.body.data.some((i) => i.id === id)).toBe(false)
  })

  it('PATCH changes only the status', async () => {
    const made = await createItem(aaravToken)
    const before = made.body.data

    const res = await request(app)
      .patch(`/api/items/${made.body.data.id}/status`)
      .set('Authorization', `Bearer ${aaravToken}`)
      // A body carrying other fields must not be able to smuggle
      // them past an endpoint that only promises to change status.
      .send({ status: 'Unavailable', name: 'Renamed via PATCH', category: 'Clothing' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('Unavailable')
    expect(res.body.data.name).toBe(before.name)
    expect(res.body.data.category).toBe(before.category)
  })

  it('400s a PATCH with no status', async () => {
    const made = await createItem(aaravToken)

    const res = await request(app)
      .patch(`/api/items/${made.body.data.id}/status`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({})

    expect(res.status).toBe(400)
  })
})

/* ===============================================================
   INJECTION -- the values are data, never SQL
   =============================================================== */
describe('injection', () => {
  it('stores SQL as literal text', async () => {
    const name = "Robert'); DROP TABLE items;--"

    const res = await createItem(aaravToken, validBody({ name }))

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe(name)

    // And the table is still there.
    const list = await request(app).get('/api/items')
    expect(list.status).toBe(200)
    expect(list.body.count).toBeGreaterThan(0)
  })

  it('stores HTML as literal text rather than interpreting it', async () => {
    // React escapes this on the way out; the server's job is simply
    // to store what was sent without mangling it.
    const description = '<script>alert("xss")</script> and some real text here.'

    const res = await createItem(aaravToken, validBody({ description }))

    expect(res.status).toBe(201)
    expect(res.body.data.description).toBe(description)
  })
})
