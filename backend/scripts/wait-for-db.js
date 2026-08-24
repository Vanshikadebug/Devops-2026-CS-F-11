/**
 * scripts/wait-for-db.js -- blocks until MySQL is ready to accept queries.
 *
 * WHY THIS EXISTS
 * A freshly-started MySQL server -- especially one that has just been
 * launched inside a Docker container by the Jenkins pipeline (Phase 14)
 * -- is NOT ready the instant `docker run` returns. The container is up,
 * but the MySQL process inside it is still initialising: creating the
 * data directory, the system tables, the root account. For a few seconds
 * every connection is refused with ECONNREFUSED or ER_ACCESS_DENIED.
 *
 * If the pipeline runs `npm run db:setup` during that window, setup-db.js
 * connects too early, fails, and the whole build goes red -- not because
 * anything is broken, but because we did not wait. This script is the
 * "wait" step: it polls the database until it answers, THEN exits 0 so
 * the next stage may run.
 *
 * WHY NODE + mysql2 INSTEAD OF `mysqladmin ping` OR A BATCH LOOP
 * Same reasoning setup-db.js gives: the mysql client is not guaranteed to
 * be on PATH (on this machine it is not), but the mysql2 driver the app
 * already depends on works anywhere Node works -- on the host, and inside
 * a container. One readiness check that behaves identically everywhere.
 *
 * USAGE
 *   node scripts/wait-for-db.js
 *
 * It reads the SAME connection settings the app uses (config/env.js), so
 * pointing it at the CI database is just a matter of setting DB_HOST /
 * DB_PORT / DB_PASSWORD in the environment -- exactly what the Jenkinsfile
 * does. Two optional knobs, both with sane defaults:
 *   DB_WAIT_RETRIES   how many attempts before giving up   (default 30)
 *   DB_WAIT_INTERVAL  seconds to sleep between attempts     (default 2)
 * 30 * 2s = up to 60s, comfortably longer than a MySQL 8 cold start.
 */

const mysql = require('mysql2/promise')
const config = require('../config/env')

// Environment variables are always strings; Number() them, and fall back
// to the defaults if unset or nonsense.
const RETRIES = Number(process.env.DB_WAIT_RETRIES) || 30
const INTERVAL = Number(process.env.DB_WAIT_INTERVAL) || 2

/** Sleep helper -- a promise that resolves after `seconds`. */
function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

/**
 * One connection attempt. Returns true if MySQL answered a trivial query,
 * false otherwise. We connect WITHOUT selecting a database: at the moment
 * this runs the `reusehub` schema does not exist yet (db:setup creates it
 * in the next stage), so asking for it would fail for the wrong reason.
 * All we are testing here is "is the server up and are the credentials
 * accepted?".
 */
async function tryOnce() {
  let connection
  try {
    connection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      // Do NOT wait forever on a single attempt -- fail fast and let the
      // retry loop decide, so a wedged socket cannot hang the build.
      connectTimeout: 5000,
    })
    await connection.query('SELECT 1')
    return true
  } catch (err) {
    // Store the last error only for the final give-up message. During the
    // loop these are expected and are logged compactly, not as stack traces.
    tryOnce.lastError = err
    return false
  } finally {
    if (connection) await connection.end()
  }
}

async function main() {
  console.log(
    `[wait-for-db] waiting for MySQL at ${config.db.host}:${config.db.port} ` +
      `(up to ${RETRIES} tries, ${INTERVAL}s apart)`,
  )

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    if (await tryOnce()) {
      console.log(`[wait-for-db] MySQL is ready (attempt ${attempt}). Proceeding.`)
      process.exit(0)
    }
    const err = tryOnce.lastError
    console.log(
      `[wait-for-db] attempt ${attempt}/${RETRIES} -- not ready yet ` +
        `(${err ? err.code || err.message : 'unknown'}); retrying in ${INTERVAL}s`,
    )
    await sleep(INTERVAL)
  }

  // Exhausted every attempt. Exit non-zero so Jenkins marks the stage
  // failed -- a build that cannot reach its database must not pretend the
  // tests passed.
  console.error(
    `\n[wait-for-db] FATAL: MySQL did not become ready after ` +
      `${RETRIES} attempts (~${RETRIES * INTERVAL}s).`,
  )
  const err = tryOnce.lastError
  if (err) console.error(`              last error: ${err.code || err.name}: ${err.message}`)
  console.error('              Is the database container running and healthy?\n')
  process.exit(1)
}

main()
