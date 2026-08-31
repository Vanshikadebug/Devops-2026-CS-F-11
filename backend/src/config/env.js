const path = require('path')
const dotenv = require('dotenv')

for (const candidate of [
  path.join(__dirname, '..', '..', '.env'),
  path.join(__dirname, '..', '..', '..', '..', '.env'),
]) {
  dotenv.config({ path: candidate, quiet: true, override: false })
}

const NODE_ENV = process.env.NODE_ENV || 'development'
const isTest = NODE_ENV === 'test'
const isProduction = NODE_ENV === 'production'

function optional(key, fallback) {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

function required(key, testFallback) {
  const value = process.env[key]
  if (value === undefined || value === '') {
    if (isTest && testFallback !== undefined) return testFallback
    console.error(
      `\n[config] FATAL: required environment variable ${key} is missing.\n` +
        `         Copy .env.example to .env and fill it in.\n`,
    )
    process.exit(1)
  }
  return value
}

function number(key, fallback) {
  const raw = optional(key, String(fallback))
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) {
    console.error(`[config] FATAL: ${key} must be a number, got "${raw}"`)
    process.exit(1)
  }
  return parsed
}

function bool(key, fallback) {
  const raw = optional(key, null)
  if (raw === null) return fallback
  return raw === 'true' || raw === '1'
}

const db = {
  host: optional('DB_HOST', 'localhost'),
  port: number('DB_PORT', 3306),
  user: optional('DB_USER', 'root'),
  password: optional('DB_PASSWORD', ''),
  name: optional('DB_NAME', 'reusehub'),
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const user = encodeURIComponent(db.user)
  const password = encodeURIComponent(db.password)
  const name = encodeURIComponent(db.name)
  const credentials = password ? `${user}:${password}` : user
  return `mysql://${credentials}@${db.host}:${db.port}/${name}`
}

const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  isTest,
  port: number('PORT', 5000),

  db,
  databaseUrl: databaseUrl(),

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    // Namespaced so several environments can share one Redis safely.
    prefix: optional('REDIS_PREFIX', 'reusehub'),
    enabled: bool('REDIS_ENABLED', !isTest),
    // Cache lifetimes in seconds. Config is invalidated on write, so it can
    // afford a long TTL; listings are volatile and get a short one.
    ttl: {
      config: number('CACHE_TTL_CONFIG', 300),
      settings: number('CACHE_TTL_SETTINGS', 300),
      taxonomy: number('CACHE_TTL_TAXONOMY', 300),
      locations: number('CACHE_TTL_LOCATIONS', 300),
    },
  },

  jwt: {
    secret: required('JWT_SECRET', 'test-only-secret-not-used-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  // Each +1 doubles hashing time. Tests drop to 4 or the suite takes minutes.
  bcryptSaltRounds: isTest ? 4 : number('BCRYPT_SALT_ROUNDS', 10),

  /* Allowed browser origins, comma-separated.

     A list rather than one value because the app is reached from more than one
     dev origin -- :5173 for the Vite server, :3000 for the Docker build.

     CLIENT_ORIGIN is still read as a fallback so existing .env files keep
     working. Never '*' -- credentials are allowed and browsers reject the
     wildcard combined with them. */
  corsOrigins: (process.env.CORS_ORIGINS || optional('CLIENT_ORIGIN', 'http://localhost:5173'))
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  allowTunnelOrigins: bool('ALLOW_TUNNEL_ORIGINS', !isProduction),

  rateLimit: {
    enabled: bool('RATE_LIMIT_ENABLED', !isTest),
    // Auth is a password oracle, so it gets a much tighter budget than
    // ordinary writes.
    auth: { windowSec: number('RATE_LIMIT_AUTH_WINDOW', 300), max: number('RATE_LIMIT_AUTH_MAX', 20) },
    write: { windowSec: number('RATE_LIMIT_WRITE_WINDOW', 60), max: number('RATE_LIMIT_WRITE_MAX', 60) },
  },

  /* Read only by the seed and scripts/create-admin.js. No defaults on
     purpose: a shipped default admin password is a documented backdoor. */
  seedAdmin: {
    email: optional('ADMIN_EMAIL', ''),
    password: optional('ADMIN_PASSWORD', ''),
    name: optional('ADMIN_NAME', ''),
    mobile: optional('ADMIN_MOBILE', ''),
  },
}

if (!isTest) {
  const safeDbUrl = config.databaseUrl.replace(/\/\/([^:]+):[^@]*@/, '//$1:***@')
  console.log('[config] environment loaded')
  console.log(`         NODE_ENV   : ${config.nodeEnv}`)
  console.log(`         PORT       : ${config.port}`)
  console.log(`         DATABASE   : ${safeDbUrl}`)
  console.log(`         REDIS      : ${config.redis.enabled ? config.redis.url : '[disabled]'}`)
  console.log(`         JWT_SECRET : ${config.jwt.secret ? '[set]' : '[MISSING]'}`)
  console.log(`         CORS       : ${config.corsOrigins.join(', ')}`)
}

module.exports = config
