/**
 * tests/health.test.js -- the first automated test.
 *
 * WHY WRITE A TEST NOW, IN PHASE 3?
 * To prove the Jest + Supertest setup works while the app is still
 * tiny. If `npm test` breaks in Phase 11 with fifteen tests written,
 * you cannot tell whether the tests, the app, or the tooling is at
 * fault. Getting one green test now removes that doubt permanently.
 *
 * WHAT IS SUPERTEST?
 * It sends real HTTP requests to an Express app WITHOUT opening a
 * network port -- it wires itself directly to the app object. This
 * is exactly why app.js does not call listen(): Supertest needs the
 * app, not a running server. No port means no clashes, and tests can
 * run anywhere, including in Jenkins.
 *
 * JEST VOCABULARY
 *   describe(...) -- groups related tests
 *   it(...)       -- one test case; the name states expected behaviour
 *   expect(...)   -- the assertion
 */

const request = require('supertest')
const app = require('../app')

describe('GET /api/health', () => {
  it('returns 200 and confirms the API is running', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toMatch(/running/i)
  })

  it('reports the test environment', async () => {
    const res = await request(app).get('/api/health')
    expect(res.body.environment).toBe('test')
  })
})

describe('unknown routes', () => {
  it('returns 404 as JSON, never HTML', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    // The frontend calls response.json() on every reply. If Express
    // sent its default HTML error page, that call would throw a
    // confusing parse error instead of showing a clean message.
    expect(res.headers['content-type']).toMatch(/json/)
  })
})

describe('malformed request bodies', () => {
  it('returns 400 instead of crashing the server', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"unclosed": ')

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('error responses never leak internals', () => {
  it('does not expose file paths or stack traces to the client in production', async () => {
    // This is a SECURITY test, not a feature test. It guards the
    // rule in errorHandler.js: unexpected errors must produce a
    // generic message, because raw errors can contain database
    // credentials and server file paths.
    const express = require('express')

    // Silence the console BEFORE anything noisy runs. Order matters:
    //   - console.log  : re-requiring env.js below reprints the
    //                    startup banner, because reloading it in
    //                    production mode re-runs its summary.
    //   - console.error: errorHandler correctly logs unexpected 500s,
    //                    and this test triggers one ON PURPOSE. Without
    //                    the spy, a PASSING suite prints a scary stack
    //                    trace that looks like a failure.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    // Temporarily behave as production, where stacks are stripped.
    const originalEnv = process.env.NODE_ENV
    jest.resetModules()
    process.env.NODE_ENV = 'production'
    const prodErrorHandler = require('../middleware/errorHandler')

    const probe = express()
    probe.get('/boom', (req, res, next) => {
      const err = new Error(
        "ER_ACCESS_DENIED_ERROR: Access denied for user 'root'@'localhost' (using password: YES)",
      )
      next(err)
    })
    probe.use(prodErrorHandler)

    const res = await request(probe).get('/boom')
    const body = JSON.stringify(res.body)

    // Restore global state BEFORE asserting. If an expect() fails,
    // it throws immediately -- and any cleanup written after it
    // would never run, breaking every later test.
    errorSpy.mockRestore()
    logSpy.mockRestore()
    process.env.NODE_ENV = originalEnv
    jest.resetModules()

    expect(res.status).toBe(500)
    expect(body).not.toMatch(/root/)
    expect(body).not.toMatch(/localhost/)
    expect(body).not.toMatch(/password/i)
    expect(body).not.toMatch(/stack/)
    expect(res.body.message).toBe('Internal server error')
  })
})
