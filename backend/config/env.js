/**
 * config/env.js -- loads and VALIDATES environment variables.
 *
 * WHAT IS THIS FILE?
 * The single place the app reads process.env. Everywhere else
 * imports from here instead of touching process.env directly.
 *
 * WHY BOTHER? WHY NOT JUST USE process.env EVERYWHERE?
 * Three reasons, all learned the hard way:
 *
 *  1. FAIL FAST, LOUDLY.
 *     If JWT_SECRET is missing, `process.env.JWT_SECRET` is simply
 *     `undefined` -- no error. The app starts happily, and then
 *     every login silently produces a broken token. The bug shows
 *     up hours later, far from its cause. Here we check at startup
 *     and refuse to boot with a clear message.
 *
 *  2. TYPES.
 *     Environment variables are ALWAYS strings. `process.env.PORT`
 *     is "5000", not 5000. Converting in one place stops subtle
 *     bugs like "5000" + 1 === "50001".
 *
 *  3. ONE PLACE TO LOOK.
 *     Want to know every setting this app has? Read this file.
 *
 * SECURITY: this file reads secrets but NEVER logs them. Note the
 * summary at the bottom prints whether JWT_SECRET is set, not what
 * it is.
 */

const path = require('path')
const dotenv = require('dotenv')

// Load backend/.env into process.env.
// `path.join(__dirname, '..')` resolves relative to THIS file, not
// to wherever `npm start` happened to be run from. Without that,
// starting the server from the project root would silently find no
// .env file at all.
//
// `quiet: true` suppresses dotenv's own promotional startup banner.
// It is harmless, but it clutters test output and Jenkins logs --
// and noisy logs are logs nobody reads.
dotenv.config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
})

const NODE_ENV = process.env.NODE_ENV || 'development'
const isTest = NODE_ENV === 'test'
const isProduction = NODE_ENV === 'production'

/**
 * Reads a required variable, or exits with a helpful message.
 * In test mode we substitute a dummy value so the test suite can
 * run on a machine (or in CI) that has no .env file at all.
 */
function required(key, testFallback) {
  const value = process.env[key]

  if (value === undefined || value === '') {
    if (isTest && testFallback !== undefined) return testFallback

    console.error(
      `\n[config] FATAL: required environment variable ${key} is missing.\n` +
        `         Copy backend/.env.example to backend/.env and fill it in.\n`,
    )
    // Exit code 1 means "failed". Jenkins (Phase 14) treats a
    // non-zero exit as a failed build stage, which is exactly what
    // we want -- a misconfigured app must never be deployed.
    process.exit(1)
  }

  return value
}

/** Reads an optional variable, falling back to a default. */
function optional(key, fallback) {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

/** Reads a variable that must be a number. */
function number(key, fallback) {
  const raw = optional(key, String(fallback))
  const parsed = Number(raw)

  if (Number.isNaN(parsed)) {
    console.error(`[config] FATAL: ${key} must be a number, got "${raw}"`)
    process.exit(1)
  }
  return parsed
}

const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  isTest,

  // 5000, NOT 8080 -- Jenkins occupies 8080 on this machine.
  port: number('PORT', 5000),

  db: {
    host: optional('DB_HOST', 'localhost'),
    port: number('DB_PORT', 3306),
    user: optional('DB_USER', 'root'),
    // Allowed to be empty: some local MySQL installs use a blank
    // root password. But it must be DELIBERATE, so we read it with
    // optional() rather than pretending it does not exist.
    password: optional('DB_PASSWORD', ''),
    database: optional('DB_NAME', 'reusehub'),
  },

  jwt: {
    // No fallback in development on purpose. A default secret is
    // worse than no secret: it looks fine and is trivially forged.
    secret: required('JWT_SECRET', 'test-only-secret-not-used-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  // bcrypt "cost factor": each +1 doubles hashing time.
  // 10 is a good production default. Tests drop to 4, because
  // hashing at cost 10 in every test adds minutes to the suite.
  bcryptSaltRounds: isTest ? 4 : number('BCRYPT_SALT_ROUNDS', 10),

  clientOrigin: optional('CLIENT_ORIGIN', 'http://localhost:5173'),

  /* Prisma needs a single connection URL, but DB_* above stays the one
     source of truth -- a second copy of the password in DATABASE_URL
     would drift the day someone changes one and not the other.

     >>> WHY THE COMPONENTS ARE ENCODED <<<
     A URL treats % : / ? # @ as syntax. A password of "99295%Yash"
     spliced in raw makes "%Ya" an invalid percent-escape, and the
     driver either throws or silently connects with a mangled password.
     encodeURIComponent on the credentials is what makes any password
     safe to embed. The database NAME is a path segment, so it is
     encoded too. */
  get databaseUrl() {
    const user = encodeURIComponent(this.db.user)
    const password = encodeURIComponent(this.db.password)
    const name = encodeURIComponent(this.db.database)
    const credentials = password ? `${user}:${password}` : user
    return `mysql://${credentials}@${this.db.host}:${this.db.port}/${name}`
  },

  /* ---------------------------------------------------------------
     THE BOOTSTRAP ADMIN
     ---------------------------------------------------------------
     Read by scripts/create-admin.js and by NOTHING that handles a
     request. It is here rather than in that script because this file
     is the answer to "what settings does this app have?", and a
     credential that lives somewhere undocumented is a credential
     nobody rotates.

     >>> WHY THERE ARE NO DEFAULTS <<<
     Every field falls back to '' and the script refuses to run
     without them. A default admin password is the single most
     exploited weakness in self-hosted software: it ships, it is
     documented, nobody changes it, and it is the first thing every
     scanner tries. An empty string that stops the script is safe; a
     convenient 'admin123' is a backdoor with a manual.

     These values are never logged, never returned by an endpoint, and
     never written to .env.example -- only their NAMES are. */
  seedAdmin: {
    email: optional('ADMIN_EMAIL', ''),
    password: optional('ADMIN_PASSWORD', ''),
    name: optional('ADMIN_NAME', ''),
    mobile: optional('ADMIN_MOBILE', ''),
  },
}

// A startup summary, so a misconfigured environment is visible
// immediately. Note what is NOT printed: the password and the JWT
// secret. Logging a secret puts it in log files, in CI output, and
// in screenshots -- treat "is it set?" as the only safe question.
if (!isTest) {
  console.log('[config] environment loaded')
  console.log(`         NODE_ENV   : ${config.nodeEnv}`)
  console.log(`         PORT       : ${config.port}`)
  console.log(`         DB         : ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`)
  console.log(`         DB_PASSWORD: ${config.db.password ? '[set]' : '[empty]'}`)
  console.log(`         JWT_SECRET : ${config.jwt.secret ? '[set]' : '[MISSING]'}`)
  console.log(`         CORS origin: ${config.clientOrigin}`)
}

module.exports = config
