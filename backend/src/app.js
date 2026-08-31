const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const config = require('./config/env')
const notFound = require('./middleware/notFound')
const errorHandler = require('./middleware/errorHandler')
const maintenance = require('./middleware/maintenance')
const { authLimiter, writeLimiter } = require('./middleware/rateLimit')
const redis = require('./lib/redis')
const ApiError = require('./utils/ApiError')
const { prisma } = require('./lib/prisma')
const { UPLOAD_DIR } = require('./controllers/uploadController')

const app = express()

// Behind nginx in Docker, so req.ip must come from X-Forwarded-For for the
// rate limiter to see real client addresses rather than the proxy's.
app.set('trust proxy', 1)

/* Never '*': credentials are allowed and browsers reject the wildcard with
   them. The callback form lets one backend serve several dev origins at once,
   which is what makes a shared/tunnelled backend usable by a team.

   A list rather than one value because the app is reached from more than one
   dev origin: :5173 for the Vite server and :3000 for the Docker build. */

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // No Origin header: curl, a health probe, a same-origin navigation.
      if (!origin) return callback(null, true)

      const clean = origin.replace(/\/+$/, '')
      if (config.corsOrigins.includes(clean)) return callback(null, true)

      // A rejected origin is the caller's misconfiguration, not a server
      // fault, so it must not surface as a 500. The message names the fix.
      return callback(
        ApiError.forbidden(
          `Origin ${origin} is not allowed. Add it to CORS_ORIGINS in the backend .env.`,
        ),
      )
    },
  }),
)

app.use(express.json({ limit: '200kb' }))
app.use(express.urlencoded({ extended: true, limit: '200kb' }))

if (!config.isTest) app.use(morgan('dev'))

/* Always answers 200, even with the database down -- that is what lets it tell
   "server dead" apart from "database dead". Both dependencies are reported
   rather than asserted, so Docker's healthcheck still passes while MySQL is
   restarting and the container is not needlessly killed. */
app.get('/api/health', async (req, res) => {
  const database = await prisma
    .$queryRaw`SELECT 1`
    .then(() => 'connected')
    .catch(() => 'unavailable')

  res.status(200).json({
    success: true,
    message: 'ReuseHub API is running',
    environment: config.nodeEnv,
    database,
    redis: redis.isHealthy() ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  })
})

/* Uploaded listing photos.

   Served with nosniff and a restrictive CSP because these are user-supplied
   bytes coming back from our own origin: if anything ever slipped past the
   signature check in uploadController, these headers stop the browser
   re-interpreting it as HTML or executing script from it.

   Registered before the maintenance gate -- it only guards non-GET, but keeping
   asset serving above the API middleware chain avoids paying for it per image. */
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '30d',
    index: false,
    dotfiles: 'deny',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox")
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    },
  }),
)

// Blocks writes for non-staff while maintenance_mode is on. Registered before
// the routers so it covers every one of them.
app.use('/api', maintenance)

// Tighter budget on auth than on ordinary writes: login is a password oracle.
app.use('/api/auth', authLimiter)
app.use(writeLimiter)

app.use('/api/config', require('./routes/configRoutes'))
app.use('/api', require('./routes/taxonomyRoutes'))
app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/users', require('./routes/userRoutes'))
app.use('/api/items', require('./routes/itemRoutes'))
app.use('/api/locations', require('./routes/locationRoutes'))
app.use('/api/dashboard', require('./routes/dashboardRoutes'))
app.use('/api/requests', require('./routes/requestRoutes'))
app.use('/api/reports', require('./routes/reportRoutes'))
app.use('/api/uploads', require('./routes/uploadRoutes'))
app.use('/api/admin', require('./routes/adminRoutes'))

// Must stay last: notFound answers every unmatched request.
app.use(notFound)
app.use(errorHandler)

module.exports = app
