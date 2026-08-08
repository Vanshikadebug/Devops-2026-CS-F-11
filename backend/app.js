/**
 * app.js -- builds and configures the Express application.
 *
 * >>> WHY IS THIS SEPARATE FROM server.js? <<<
 * This is the single most important structural decision in the
 * backend, and it exists for testing.
 *
 * This file CREATES the app but never calls app.listen(). server.js
 * imports it and does the listening. That gives us two entry points:
 *
 *   npm run dev  -> server.js -> app.listen(5000)   real server
 *   npm test     -> app.js only, no port opened     tests
 *
 * Supertest (Phase 11) can drive an Express app object directly,
 * without a network socket. If listen() lived in this file, then
 * importing it from a test would boot a real server -- and running
 * several test files in parallel would produce EADDRINUSE, because
 * they would all fight over port 5000. Tests would fail randomly
 * depending on timing, which is the worst kind of failure.
 *
 * MIDDLEWARE ORDER MATTERS ENORMOUSLY.
 * Express runs middleware top to bottom, like a checklist. Each one
 * either responds, or calls next() to pass the request along:
 *
 *   1. CORS          -- may the browser talk to us at all?
 *   2. Body parsing  -- turn the raw JSON body into req.body
 *   3. Logging       -- record the request
 *   4. Routes        -- the actual application
 *   5. notFound      -- nothing matched
 *   6. errorHandler  -- anything above threw
 *
 * Putting body parsing AFTER the routes, for instance, would leave
 * req.body permanently undefined -- a very common beginner bug.
 */

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const config = require('./config/env')
const notFound = require('./middleware/notFound')
const errorHandler = require('./middleware/errorHandler')

const app = express()

/* ---------------------------------------------------------------
   1. CORS -- Cross-Origin Resource Sharing
   ---------------------------------------------------------------
   Browsers block a page on one origin from calling an API on
   another. Our frontend is http://localhost:5173, our API is
   http://localhost:5000 -- different ports means different origins,
   so without this header the browser refuses every request.

   SECURITY: we name the exact allowed origin. The lazy alternative,
   `cors()` with no options, sends Access-Control-Allow-Origin: *,
   which lets ANY website on the internet call this API using a
   visitor's browser. Never do that for an authenticated API.

   `credentials: true` permits cookies/auth headers on cross-origin
   requests -- and is precisely why the wildcard is not allowed here:
   browsers reject `*` combined with credentials.
--------------------------------------------------------------- */
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  }),
)

/* ---------------------------------------------------------------
   2. Body parsing
   ---------------------------------------------------------------
   An incoming POST body arrives as a raw stream of bytes.
   express.json() reads it, parses it as JSON, and puts the result
   on req.body. Without it, req.body is undefined.

   `limit` caps the body size. The default is 100kb; we allow a
   little more for long descriptions, but a cap must exist -- an
   unbounded body is a denial-of-service vector (someone POSTs a
   2 GB payload and exhausts server memory).
--------------------------------------------------------------- */
app.use(express.json({ limit: '200kb' }))
app.use(express.urlencoded({ extended: true, limit: '200kb' }))

/* ---------------------------------------------------------------
   3. Request logging
   ---------------------------------------------------------------
   morgan prints one line per request:
     GET /api/health 200 4.312 ms - 62
   Invaluable when the frontend says "it didn't work" -- you can see
   instantly whether the request even arrived, and what was returned.

   Silenced during tests, where it would bury the actual results.
--------------------------------------------------------------- */
if (!config.isTest) {
  app.use(morgan('dev'))
}

/* ---------------------------------------------------------------
   4. Routes
   ---------------------------------------------------------------
   HEALTH CHECK: a tiny endpoint that answers "is this server
   alive?". It is not decoration -- it is used by:
     - us, right now, to prove the server works
     - Docker's HEALTHCHECK (Phase 13), to know when the container
       is genuinely ready rather than merely started
     - Jenkins (Phase 14), to verify a deployment succeeded
   Deliberately requires no database, so it still answers when
   MySQL is down -- distinguishing "server dead" from "DB dead".
--------------------------------------------------------------- */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ReuseHub API is running',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  })
})

// A friendly index so hitting the bare URL is not a 404.
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ReuseHub API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      // Filled in as each phase lands:
      // auth:     POST /api/auth/register, POST /api/auth/login   (Phase 6)
      // items:    GET|POST /api/items, GET|PUT|DELETE /api/items/:id (Phase 8)
      // requests: GET|POST /api/requests, PUT /api/requests/:id   (Phase 10)
    },
  })
})

// Feature routers are mounted here in later phases, e.g.
//   app.use('/api/auth', require('./routes/authRoutes'))

/* ---------------------------------------------------------------
   5 & 6. Fallbacks -- MUST be registered last.
   Anything added below these two lines would be unreachable,
   because notFound() answers every unmatched request first.
--------------------------------------------------------------- */
app.use(notFound)
app.use(errorHandler)

module.exports = app
