/**
 * tests/requests.test.js -- the request/claim API.
 *
 * Auth first, then uniqueness and ownership, then the accept
 * transaction (item Reserved, sibling pending requests Rejected),
 * then contact fields appearing only after accept.
 *
 * Mutating tests create their own items and delete them in afterEach
 * so CASCADE clears the requests. A leftover row here would change
 * dashboard counts and fail later files depending on run order.
 */

const request = require('supertest')
const app = require('../app')
const { pool, closePool } = require('../config/db')

afterAll(async () => {
  await pool.execute('DELETE FROM users WHERE email LIKE ?', ['reqtest.%'])
  await closePool()
})

const AARAV = { email: 'aarav@example.com', password: 'password123' }
const PRIYA = { email: 'priya@example.com', password: 'password123' }

let aaravToken
let priyaToken
let aaravId
let priyaId
let thirdToken
let thirdId
let skit

let created = []

function validItem(overrides = {}) {
  return {
    name: 'Request-test listing',
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
    .send(body ?? validItem())

  if (res.body?.data?.id) created.push({ id: res.body.data.id, token })
  return res
}

async function sendRequest(token, body) {
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

beforeAll(async () => {
  const a = await request(app).post('/api/auth/login').send(AARAV)
  aaravToken = a.body.token
  aaravId = a.body.user.id

  const p = await request(app).post('/api/auth/login').send(PRIYA)
  priyaToken = p.body.token
  priyaId = p.body.user.id

  const third = await request(app).post('/api/auth/register').send({
    name: 'Req Third',
    email: 'reqtest.third@test.local',
    mobile: '9876500099',
    password: 'correct-horse-9',
  })
  thirdToken = third.body.token
  thirdId = third.body.user.id

  const colleges = await request(app).get('/api/locations/colleges')
  skit = colleges.body.data.find((c) => c.slug === 'skit-jaipur')
})

afterEach(async () => {
  for (const item of created) {
    await request(app)
      .delete(`/api/items/${item.id}`)
      .set('Authorization', `Bearer ${item.token}`)
  }
  created = []
})

describe('authentication', () => {
  it('401s POST without a token', async () => {
    const res = await request(app).post('/api/requests').send({ itemId: 1 })
    expect(res.status).toBe(401)
  })

  it('401s GET sent, GET received and PATCH without a token', async () => {
    const sent = await request(app).get('/api/requests/sent')
    const received = await request(app).get('/api/requests/received')
    const patch = await request(app).patch('/api/requests/1').send({ status: 'Accepted' })

    expect(sent.status).toBe(401)
    expect(received.status).toBe(401)
    expect(patch.status).toBe(401)
  })
})

describe('creating a request', () => {
  it('lets a logged-in user request someone else\'s available item', async () => {
    const listed = await createItem(aaravToken)
    const res = await sendRequest(priyaToken, {
      itemId: listed.body.data.id,
      message: 'Could I collect this on Saturday?',
    })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('Pending')
    expect(res.body.data.item_id).toBe(listed.body.data.id)
    expect(res.body.data.requester_id).toBe(priyaId)
    expect(res.body.data.owner_id).toBe(aaravId)
    expect(res.body.data.message).toBe('Could I collect this on Saturday?')
    expect(res.body.data).not.toHaveProperty('owner_email')
    expect(res.body.data).not.toHaveProperty('requester_email')
  })

  it('ignores a requesterId in the body and uses the token', async () => {
    const listed = await createItem(aaravToken)
    const res = await sendRequest(priyaToken, {
      itemId: listed.body.data.id,
      requesterId: aaravId,
    })

    expect(res.status).toBe(201)
    expect(res.body.data.requester_id).toBe(priyaId)
  })

  it('403s when you request your own item', async () => {
    const listed = await createItem(aaravToken)
    const res = await sendRequest(aaravToken, { itemId: listed.body.data.id })

    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/yourself/i)
  })

  it('422s when the item is not Available', async () => {
    const listed = await createItem(aaravToken)
    await request(app)
      .patch(`/api/items/${listed.body.data.id}/status`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Reserved' })

    const res = await sendRequest(priyaToken, { itemId: listed.body.data.id })
    expect(res.status).toBe(422)
  })

  it('404s for an item that does not exist', async () => {
    const res = await sendRequest(priyaToken, { itemId: 999999999 })
    expect(res.status).toBe(404)
  })

  it('400s on a missing or non-numeric itemId', async () => {
    const missing = await sendRequest(priyaToken, { message: 'hi' })
    const bad = await sendRequest(priyaToken, { itemId: 'abc' })

    expect(missing.status).toBe(400)
    expect(bad.status).toBe(400)
  })

  it('409s a second request for the same item by the same user', async () => {
    const listed = await createItem(aaravToken)
    const first = await sendRequest(priyaToken, { itemId: listed.body.data.id })
    const second = await sendRequest(priyaToken, { itemId: listed.body.data.id })

    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
    expect(second.body.message).toMatch(/already requested/i)
  })

  it('stores SQL in the message as literal text', async () => {
    const listed = await createItem(aaravToken)
    const payload = "'; DROP TABLE requests; --"
    const res = await sendRequest(priyaToken, {
      itemId: listed.body.data.id,
      message: payload,
    })

    expect(res.status).toBe(201)
    expect(res.body.data.message).toBe(payload)

    const stillThere = await request(app)
      .get('/api/requests/sent')
      .set('Authorization', `Bearer ${priyaToken}`)
    expect(stillThere.status).toBe(200)
  })
})

describe('listing sent and received', () => {
  it('shows a request in the requester\'s sent list and the owner\'s received list', async () => {
    const listed = await createItem(aaravToken)
    await sendRequest(priyaToken, { itemId: listed.body.data.id, message: 'Mine' })

    const sent = await request(app)
      .get('/api/requests/sent')
      .set('Authorization', `Bearer ${priyaToken}`)
    const received = await request(app)
      .get('/api/requests/received')
      .set('Authorization', `Bearer ${aaravToken}`)
    const aaravSent = await request(app)
      .get('/api/requests/sent')
      .set('Authorization', `Bearer ${aaravToken}`)

    expect(sent.body.data.some((r) => r.item_id === listed.body.data.id)).toBe(true)
    expect(received.body.data.some((r) => r.item_id === listed.body.data.id)).toBe(true)
    expect(aaravSent.body.data.some((r) => r.item_id === listed.body.data.id)).toBe(false)

    sent.body.data.forEach((row) => {
      expect(row.requester_id).toBe(priyaId)
      expect(row).not.toHaveProperty('owner_email')
    })
    received.body.data.forEach((row) => {
      expect(row.owner_id).toBe(aaravId)
    })
  })

  it('narrows GET /sent with ?item=', async () => {
    const one = await createItem(aaravToken)
    const two = await createItem(aaravToken)
    await sendRequest(priyaToken, { itemId: one.body.data.id })
    await sendRequest(priyaToken, { itemId: two.body.data.id })

    const res = await request(app)
      .get(`/api/requests/sent?item=${one.body.data.id}`)
      .set('Authorization', `Bearer ${priyaToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].item_id).toBe(one.body.data.id)
  })
})

describe('accept and reject', () => {
  it('lets the owner reject a pending request without changing the item', async () => {
    const listed = await createItem(aaravToken)
    const made = await sendRequest(priyaToken, { itemId: listed.body.data.id })

    const res = await request(app)
      .patch(`/api/requests/${made.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Rejected' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('Rejected')
    expect(res.body.data).not.toHaveProperty('owner_email')

    const item = await request(app).get(`/api/items/${listed.body.data.id}`)
    expect(item.body.data.status).toBe('Available')
  })

  it('on accept, reserves the item and rejects other pending requests', async () => {
    const listed = await createItem(aaravToken)
    const priyaReq = await sendRequest(priyaToken, { itemId: listed.body.data.id })
    const thirdReq = await sendRequest(thirdToken, { itemId: listed.body.data.id })

    const res = await request(app)
      .patch(`/api/requests/${priyaReq.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Accepted' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('Accepted')
    expect(res.body.data.owner_email).toBeTruthy()
    expect(res.body.data.owner_mobile).toBeTruthy()
    expect(res.body.data.requester_email).toBeTruthy()
    expect(res.body.data.requester_mobile).toBeTruthy()

    const item = await request(app).get(`/api/items/${listed.body.data.id}`)
    expect(item.body.data.status).toBe('Reserved')
    expect(item.body.data).not.toHaveProperty('email')
    expect(item.body.data.owner_name).toBeTruthy()

    const thirdView = await request(app)
      .get('/api/requests/sent')
      .set('Authorization', `Bearer ${thirdToken}`)
    const sibling = thirdView.body.data.find((r) => r.id === thirdReq.body.data.id)
    expect(sibling.status).toBe('Rejected')
    expect(sibling).not.toHaveProperty('owner_email')
  })

  it('exposes owner contact on the requester\'s sent list after accept', async () => {
    const listed = await createItem(aaravToken)
    const made = await sendRequest(priyaToken, { itemId: listed.body.data.id })

    await request(app)
      .patch(`/api/requests/${made.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Accepted' })

    const sent = await request(app)
      .get(`/api/requests/sent?item=${listed.body.data.id}`)
      .set('Authorization', `Bearer ${priyaToken}`)

    expect(sent.body.data[0].status).toBe('Accepted')
    expect(sent.body.data[0].owner_email).toMatch(/@/)
    expect(sent.body.data[0].owner_mobile).toBeTruthy()
  })

  it('403s when the requester tries to accept their own request', async () => {
    const listed = await createItem(aaravToken)
    const made = await sendRequest(priyaToken, { itemId: listed.body.data.id })

    const res = await request(app)
      .patch(`/api/requests/${made.body.data.id}`)
      .set('Authorization', `Bearer ${priyaToken}`)
      .send({ status: 'Accepted' })

    expect(res.status).toBe(403)
  })

  it('404s when a stranger tries to decide someone else\'s request', async () => {
    const listed = await createItem(aaravToken)
    const made = await sendRequest(priyaToken, { itemId: listed.body.data.id })

    const res = await request(app)
      .patch(`/api/requests/${made.body.data.id}`)
      .set('Authorization', `Bearer ${thirdToken}`)
      .send({ status: 'Accepted' })

    expect(res.status).toBe(404)
  })

  it('404s for an id that does not exist', async () => {
    const res = await request(app)
      .patch('/api/requests/999999999')
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Accepted' })

    expect(res.status).toBe(404)
  })

  it('400s a PATCH that tries to set Pending', async () => {
    const listed = await createItem(aaravToken)
    const made = await sendRequest(priyaToken, { itemId: listed.body.data.id })

    const res = await request(app)
      .patch(`/api/requests/${made.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Pending' })

    expect(res.status).toBe(400)
  })

  it('422s a second decision on an already-decided request', async () => {
    const listed = await createItem(aaravToken)
    const made = await sendRequest(priyaToken, { itemId: listed.body.data.id })

    await request(app)
      .patch(`/api/requests/${made.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Rejected' })

    const res = await request(app)
      .patch(`/api/requests/${made.body.data.id}`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ status: 'Accepted' })

    expect(res.status).toBe(422)
  })
})
