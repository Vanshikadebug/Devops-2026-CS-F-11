/**
 * tests/userCollege.test.js -- PUT /api/users/me/college.
 *
 * THIS IS THE ONLY WRITE ENDPOINT ADDED BY THE LOCATION FEATURE, so
 * it carries the authorization risk. Most of what follows is
 * therefore about who is allowed to change what, not about whether
 * the value is stored.
 *
 * THESE TESTS MUTATE DATA, so each one puts it back. A suite that
 * leaves the database altered makes every LATER test depend on
 * whether this file ran first -- which is how a suite starts passing
 * and failing based on file ordering.
 */

const request = require('supertest')
const app = require('../app')
const { closePool } = require('../config/db')

afterAll(async () => {
  await closePool()
})

const LOGIN = { email: 'aarav@example.com', password: 'password123' }

let token
let originalCollegeId
let skit
let mnit

async function currentUser() {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
  return res.body.user
}

beforeAll(async () => {
  const login = await request(app).post('/api/auth/login').send(LOGIN)
  token = login.body.token

  const me = await currentUser()
  originalCollegeId = me.college_id

  const colleges = await request(app).get('/api/locations/colleges')
  skit = colleges.body.data.find((c) => c.slug === 'skit-jaipur')
  mnit = colleges.body.data.find((c) => c.slug === 'mnit-jaipur')
})

// Restore the seeded value, whatever any individual test did.
afterEach(async () => {
  await request(app)
    .put('/api/users/me/college')
    .set('Authorization', `Bearer ${token}`)
    .send({ collegeId: originalCollegeId })
})

describe('authorization', () => {
  it('401s without a token', async () => {
    // >>> THE IMPORTANT ONE <<<
    // Unprotected, this endpoint would let anyone on the network
    // rewrite a profile. The route must carry `protect`.
    const res = await request(app)
      .put('/api/users/me/college')
      .send({ collegeId: skit.id })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('401s with a forged token', async () => {
    const res = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', 'Bearer not.a.real.token')
      .send({ collegeId: skit.id })

    expect(res.status).toBe(401)
  })

  it('changes only the caller, no matter what the body claims', async () => {
    // >>> THE INSECURE-DIRECT-OBJECT-REFERENCE TEST <<<
    // The URL offers nowhere to name a victim, so the attempt here
    // is to smuggle one through the body. Those extra keys must be
    // ignored entirely: the user id comes from the verified token
    // signature and from nowhere else.
    const victimBefore = await request(app)
      .post('/api/auth/login')
      .send({ email: 'priya@example.com', password: 'password123' })
    const victimId = victimBefore.body.user.id
    const victimCollegeBefore = victimBefore.body.user.college_id

    const res = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: mnit.id, id: victimId, userId: victimId, user_id: victimId })

    expect(res.status).toBe(200)
    expect(res.body.user.id).not.toBe(victimId)
    expect(res.body.user.college_id).toBe(mnit.id)

    // And the other account is untouched.
    const victimAfter = await request(app)
      .post('/api/auth/login')
      .send({ email: 'priya@example.com', password: 'password123' })
    expect(victimAfter.body.user.college_id).toBe(victimCollegeBefore)
  })
})

describe('saving a college', () => {
  it('stores it and returns the resolved area and city', async () => {
    const res = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: mnit.id })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.user.college_id).toBe(mnit.id)
    expect(res.body.user.college_name).toBe('MNIT Jaipur')
    expect(res.body.user.area_name).toBe('Malviya Nagar')
    expect(res.body.user.city_name).toBe('Jaipur')
  })

  it('persists, so a later request sees it', async () => {
    // Returning the right object while writing nothing is a real
    // failure mode -- the controller re-reads the row, but only a
    // separate request proves the UPDATE actually landed.
    await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: mnit.id })

    const me = await currentUser()
    expect(me.college_id).toBe(mnit.id)
  })

  it('accepts null, because "I would rather not say" is a real answer', async () => {
    const res = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: null })

    expect(res.status).toBe(200)
    expect(res.body.user.college_id).toBeNull()
    expect(res.body.user.college_name).toBeNull()

    // The user must still load -- the college JOINs are LEFT JOINs
    // precisely so a user without one does not vanish from
    // findById(), which protect.js calls on every request.
    const me = await currentUser()
    expect(me.id).toBeDefined()
    expect(me.college_id).toBeNull()
  })

  it('is idempotent: sending the same value twice changes nothing', async () => {
    // What makes PUT the right verb, and a retry after a dropped
    // connection safe.
    const first = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: mnit.id })

    const second = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: mnit.id })

    expect(second.status).toBe(first.status)
    expect(second.body.user.college_id).toBe(first.body.user.college_id)
  })

  it('never returns the password hash', async () => {
    // >>> SECURITY TEST <<<
    // The response includes the whole user object, re-read after the
    // write. If that read ever went through the with-password query,
    // this endpoint would broadcast a bcrypt hash on every save.
    const res = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: skit.id })

    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/)
    expect(res.body.user).not.toHaveProperty('password')
  })
})

describe('rejecting bad input', () => {
  it('404s for a college that does not exist', async () => {
    const res = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: 999999 })

    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/999999/)
  })

  it('400s when collegeId is missing entirely', async () => {
    // >>> undefined IS NOT null <<<
    // They look alike in JavaScript and mean opposite things here.
    // Treating a missing field as "clear it" would let a malformed
    // request silently wipe the saved college, with no error anywhere.
    await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: skit.id })

    const res = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)

    // And the previously saved value survived the bad request.
    const me = await currentUser()
    expect(me.college_id).toBe(skit.id)
  })

  it('400s on a non-numeric collegeId', async () => {
    const res = await request(app)
      .put('/api/users/me/college')
      .set('Authorization', `Bearer ${token}`)
      .send({ collegeId: 'skit-jaipur' })

    expect(res.status).toBe(400)
  })

  it('400s on a negative or zero collegeId', async () => {
    for (const bad of [0, -1]) {
      const res = await request(app)
        .put('/api/users/me/college')
        .set('Authorization', `Bearer ${token}`)
        .send({ collegeId: bad })

      expect(res.status).toBe(400)
    }
  })
})
