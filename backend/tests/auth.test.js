/**
 * tests/auth.test.js -- registration, login and token protection.
 *
 * MOST OF THESE ARE SECURITY TESTS, and they are the reason this
 * file exists. A feature test asks "can a user log in?". A security
 * test asks "can someone log in who should not?" -- and that second
 * question is the one that matters, because the failure is silent.
 * An app with broken authentication works perfectly for everyone,
 * including the attacker.
 *
 * TEST ISOLATION
 * Registration writes real rows, so each test that creates a user
 * uses a unique email and the rows are removed in afterAll. Tests
 * that leave debris behind pass the first time and fail the second
 * with ER_DUP_ENTRY, which teaches people to distrust the suite.
 */

const request = require('supertest')
const app = require('../app')
const { pool, closePool } = require('../config/db')
const { signToken } = require('../utils/token')

// A recognisable marker so cleanup can find exactly our rows and
// never touch the seeded demo users.
const TEST_TAG = 'authtest'

const newUser = (n) => ({
  name: `Auth Test ${n}`,
  email: `${TEST_TAG}.${n}@test.local`,
  mobile: '9876500000',
  password: 'correct-horse-9',
})

// last_login_at is written fire-and-forget by the login controller, so
// a read taken the instant login returns can lose the race with the
// UPDATE. Poll for up to a couple of seconds and return the value the
// moment it appears; null means it never did.
async function waitForLastLogin(id, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const [[row]] = await pool.execute(
      'SELECT last_login_at FROM users WHERE id = ?',
      [id],
    )
    if (row && row.last_login_at !== null) return row.last_login_at
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return null
}

afterAll(async () => {
  // ON DELETE CASCADE removes any items and requests these users
  // created, so one statement is enough.
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [`${TEST_TAG}.%`])
  await closePool()
})

/* ===============================================================
   REGISTRATION
   =============================================================== */
describe('POST /api/auth/register', () => {
  it('creates an account and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(newUser('create'))

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.token).toBe('string')
    // A JWT is three dot-separated parts.
    expect(res.body.token.split('.')).toHaveLength(3)
    expect(res.body.user.email).toBe(`${TEST_TAG}.create@test.local`)
    expect(res.body.user.id).toBeGreaterThan(0)
  })

  it('never returns the password or its hash', async () => {
    // >>> SECURITY <<<
    const res = await request(app).post('/api/auth/register').send(newUser('nopass'))

    expect(res.body.user).not.toHaveProperty('password')
    const body = JSON.stringify(res.body)
    expect(body).not.toMatch(/correct-horse-9/) // the plain text
    expect(body).not.toMatch(/\$2[aby]\$/)      // a bcrypt hash
  })

  it('stores the password as a bcrypt hash, never plain text', async () => {
    // >>> SECURITY <<<
    // Checking the RESPONSE is not enough -- the password could be
    // hidden from the API and still sitting in the table as plain
    // text. So we look directly at the stored row.
    const user = newUser('hashed')
    await request(app).post('/api/auth/register').send(user)

    const [[row]] = await pool.execute(
      'SELECT password FROM users WHERE email = ?',
      [user.email],
    )

    expect(row.password).not.toBe(user.password)
    expect(row.password).toMatch(/^\$2[aby]\$\d{2}\$/)
    expect(row.password).toHaveLength(60)
  })

  it('rejects a duplicate email with 409', async () => {
    const user = newUser('dupe')
    await request(app).post('/api/auth/register').send(user)

    const res = await request(app).post('/api/auth/register').send(user)

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
  })

  it('treats emails case-insensitively, so one address is one account', async () => {
    // normalizeEmail() in the validator. Without it the UNIQUE index
    // would allow Foo@x.com AND foo@x.com as separate accounts, and
    // the user could not work out which one they had registered.
    const user = newUser('case')
    await request(app).post('/api/auth/register').send(user)

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...user, email: user.email.toUpperCase() })

    expect(res.status).toBe(409)
  })

  it('preserves the email exactly as typed, apart from case', async () => {
    // This test exists because the first version of the validator was
    // WRONG and the suite did not notice. express-validator's
    // normalizeEmail() strips dots from Gmail addresses by default:
    //   Vanshika.Meena@Gmail.com -> vanshikameena@gmail.com
    // Every other test here uses an @test.local address, which that
    // rule does not touch, so the bug was invisible. A gmail.com
    // address is the only thing that exercises it.
    const res = await request(app).post('/api/auth/register').send({
      name: 'Dotted Name',
      email: `${TEST_TAG}.Dotted.Name@Gmail.com`,
      mobile: '9876500000',
      password: 'correct-horse-9',
    })

    expect(res.status).toBe(201)
    // Lowercased, but the dots survive.
    expect(res.body.user.email).toBe(`${TEST_TAG}.dotted.name@gmail.com`)
  })

  it('reports every invalid field at once, not just the first', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: '',
      email: 'not-an-email',
      mobile: '123',
      password: 'short',
    })

    expect(res.status).toBe(400)
    const fields = res.body.details.map((d) => d.field)
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'mobile', 'password']))
  })

  it('rejects a whitespace-only name', async () => {
    // trim() runs before notEmpty(), so '   ' is caught.
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...newUser('blank'), name: '    ' })

    expect(res.status).toBe(400)
  })

  it('rejects a password with no digit', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...newUser('weak'), password: 'onlyletters' })

    expect(res.status).toBe(400)
  })
})

/* ===============================================================
   LOGIN
   =============================================================== */
describe('POST /api/auth/login', () => {
  const user = newUser('login')

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send(user)
  })

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })

    expect(res.status).toBe(200)
    expect(res.body.token.split('.')).toHaveLength(3)
    expect(res.body.user.email).toBe(user.email)
    expect(res.body.user).not.toHaveProperty('password')
  })

  it('lets a Gmail user with dots in their address log back in', async () => {
    // >>> REGRESSION: register and login normalisation must AGREE <<<
    // Gmail treats dots as insignificant, so express-validator's
    // normalizeEmail() strips them BY DEFAULT. Registration switches
    // that off, so the dots are kept -- but if login uses a bare
    // normalizeEmail(), it strips them, searches for a different
    // string, finds nothing and returns 401. The account exists yet
    // can never log in.
    //
    // The existing "preserves the email exactly as typed" test only
    // exercises REGISTER, so it never caught this. This one registers
    // WITH dots and then logs in with the very same address -- the
    // round-trip that actually reproduces the bug.
    const dotted = {
      name: 'Dotted Login',
      email: `${TEST_TAG}.Dot.Ted.Login@Gmail.com`,
      mobile: '9876500000',
      password: 'correct-horse-9',
    }
    await request(app).post('/api/auth/register').send(dotted)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: dotted.email, password: dotted.password })

    expect(res.status).toBe(200)
    expect(res.body.token.split('.')).toHaveLength(3)
    // Lowercased, but the dots survive BOTH register and login.
    expect(res.body.user.email).toBe(`${TEST_TAG}.dot.ted.login@gmail.com`)
  })

  it('rejects a wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'wrong-password-1' })

    expect(res.status).toBe(401)
    expect(res.body.token).toBeUndefined()
  })

  it('gives an IDENTICAL response for unknown email and wrong password', async () => {
    // >>> SECURITY: account enumeration <<<
    // If these differed, an attacker could submit a list of addresses
    // and learn which are registered -- worth having on its own, for
    // phishing or credential stuffing.
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: `${TEST_TAG}.ghost@test.local`, password: 'anything-1' })

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'anything-1' })

    expect(unknownEmail.status).toBe(wrongPassword.status)
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message)
  })

  it('does not accept SQL injection as a password bypass', async () => {
    // >>> SECURITY <<<
    // The classic ' OR '1'='1 login bypass. It fails twice over:
    // prepared statements treat it as a literal string, and bcrypt
    // compares hashes rather than concatenating SQL.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: "' OR '1'='1" })

    expect(res.status).toBe(401)
    expect(res.body.token).toBeUndefined()
  })

  it('refuses a blocked account, even with the correct password', async () => {
    // >>> SECURITY / REGRESSION <<<
    // protect.js rejects a blocked user on every authenticated request,
    // but login used to issue the token FIRST and let protect catch it
    // on the next call -- so the login screen accepted the password,
    // said "Logged in successfully", and the app then behaved as though
    // it were broken. A block must be honest at the door: 403 here, no
    // token, and the same wording protect.js uses mid-session.
    const blocked = newUser('blocked')
    const reg = await request(app).post('/api/auth/register').send(blocked)

    await pool.execute(
      "UPDATE users SET status = 'blocked' WHERE id = ?",
      [reg.body.user.id],
    )

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: blocked.email, password: blocked.password })

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.token).toBeUndefined()
  })

  it('does not reveal the block to someone who lacks the password', async () => {
    // >>> SECURITY: the block adds no new enumeration signal <<<
    // The status check runs AFTER the password check, so a wrong guess
    // against a blocked account is indistinguishable from a wrong guess
    // against any other -- the generic "Invalid email or password", not
    // the "blocked" message. The block is disclosed only to someone who
    // has already proved they hold the credentials.
    const blocked = newUser('blocked-wrong')
    const reg = await request(app).post('/api/auth/register').send(blocked)

    await pool.execute(
      "UPDATE users SET status = 'blocked' WHERE id = ?",
      [reg.body.user.id],
    )

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: blocked.email, password: 'wrong-password-1' })

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password')
  })

  it('stamps last_login_at on a successful login', async () => {
    // >>> REGRESSION: the timestamp the admin "dormant accounts" sort
    //     relies on <<<
    // touchLastLogin shipped from day one with a docblock claiming
    // login called it -- but nothing did. So last_login_at stayed NULL
    // for every account forever, and the admin list's `active` sort had
    // nothing to order by. A fresh account starts NULL; a real login
    // must fill it in.
    const u = newUser('lastlogin')
    const reg = await request(app).post('/api/auth/register').send(u)
    const id = reg.body.user.id

    // A brand-new account has never signed in.
    const [[before]] = await pool.execute(
      'SELECT last_login_at FROM users WHERE id = ?',
      [id],
    )
    expect(before.last_login_at).toBeNull()

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password })
    expect(res.status).toBe(200)

    // The stamp is fire-and-forget (see authController), so the write
    // can land a beat after the response returns -- poll rather than
    // read once and race it.
    const stamped = await waitForLastLogin(id)
    expect(stamped).not.toBeNull()
  })

  it('does not stamp last_login_at when the password is wrong', async () => {
    // >>> the flip side: only a SUCCESSFUL login is recorded <<<
    // The stamp sits after the password and blocked checks, so a failed
    // attempt fires no write at all -- which is why this can read the
    // row immediately, with no poll: there is no in-flight UPDATE to
    // race. Guards against a future refactor that moves the stamp ahead
    // of the checks, which would record attempts that never signed in.
    const u = newUser('nostamp')
    const reg = await request(app).post('/api/auth/register').send(u)
    const id = reg.body.user.id

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: 'wrong-password-1' })
    expect(res.status).toBe(401)

    const [[row]] = await pool.execute(
      'SELECT last_login_at FROM users WHERE id = ?',
      [id],
    )
    expect(row.last_login_at).toBeNull()
  })
})

/* ===============================================================
   TOKEN PROTECTION -- the heart of the phase
   =============================================================== */
describe('GET /api/auth/me', () => {
  const user = newUser('me')
  let token
  let userId

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send(user)
    token = res.body.token
    userId = res.body.user.id
  })

  it('returns the current user for a valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(userId)
    expect(res.body.user).not.toHaveProperty('password')
  })

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('rejects a token missing the Bearer prefix', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', token)
    expect(res.status).toBe(401)
  })

  it('rejects a token whose payload was tampered with', async () => {
    // >>> SECURITY: this is the whole point of a signature <<<
    // Decode the payload, change the id to 1 (another user), and
    // re-encode. The attacker is trying to become someone else.
    // They can freely READ and EDIT the payload -- base64 is not
    // encryption -- but they cannot forge the signature without
    // JWT_SECRET, so verification fails.
    const [header, payload, signature] = token.split('.')
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())

    decoded.id = 1 // impersonate the first seeded user

    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${header}.${forged}.${signature}`)

    expect(res.status).toBe(401)
    expect(res.body.user).toBeUndefined()
  })

  it('rejects a token signed with the wrong secret', async () => {
    // >>> SECURITY <<<
    // A well-formed token built by someone who guessed the structure
    // but not the secret. Proves the secret -- not the shape -- is
    // what grants access.
    const jwt = require('jsonwebtoken')
    const impostor = jwt.sign({ id: userId }, 'not-the-real-secret', { expiresIn: '7d' })

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${impostor}`)

    expect(res.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const jwt = require('jsonwebtoken')
    const config = require('../config/env')
    // Signed with the RIGHT secret, but already expired.
    const stale = jwt.sign({ id: userId }, config.jwt.secret, { expiresIn: '-1s' })

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${stale}`)

    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/expired/i)
  })

  it('rejects a valid token belonging to a deleted account', async () => {
    // >>> SECURITY <<<
    // This is why protect.js queries the database instead of trusting
    // the id in the token. The signature stays valid for 7 days; the
    // account does not.
    const doomed = newUser('deleted')
    const reg = await request(app).post('/api/auth/register').send(doomed)

    await pool.execute('DELETE FROM users WHERE id = ?', [reg.body.user.id])

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`)

    expect(res.status).toBe(401)
  })

  it('rejects a token for a user id that never existed', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signToken(999999)}`)

    expect(res.status).toBe(401)
  })

  it('rejects obvious garbage without crashing', async () => {
    for (const bad of ['Bearer ', 'Bearer abc', 'Bearer a.b.c', 'Basic user:pass']) {
      const res = await request(app).get('/api/auth/me').set('Authorization', bad)
      expect(res.status).toBe(401)
    }
  })
})

/* ===============================================================
   THE TOKEN ITSELF
   =============================================================== */
describe('token contents', () => {
  it('carries only the user id -- no email, no name, no hash', async () => {
    // >>> SECURITY <<<
    // A JWT payload is base64, not encrypted: anyone holding the
    // token can read it. So the test decodes it exactly as an
    // attacker would, and checks nothing sensitive is inside.
    const user = newUser('payload')
    const res = await request(app).post('/api/auth/register').send(user)

    const payload = JSON.parse(
      Buffer.from(res.body.token.split('.')[1], 'base64url').toString(),
    )

    // iat = issued at, exp = expires. Both are standard JWT claims.
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'id'])
    expect(payload.id).toBe(res.body.user.id)

    const decoded = JSON.stringify(payload)
    expect(decoded).not.toMatch(/correct-horse-9/)
    expect(decoded).not.toMatch(/@test\.local/)
    expect(decoded).not.toMatch(/\$2[aby]\$/)
  })

  it('expires, rather than lasting forever', async () => {
    const res = await request(app).post('/api/auth/register').send(newUser('expiry'))
    const payload = JSON.parse(
      Buffer.from(res.body.token.split('.')[1], 'base64url').toString(),
    )

    // A token with no exp claim would be a permanent password.
    expect(payload.exp).toBeGreaterThan(payload.iat)
  })
})
