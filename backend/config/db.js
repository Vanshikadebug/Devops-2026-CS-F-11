/**
 * config/db.js -- the MySQL connection pool.
 *
 * WHAT IS A CONNECTION POOL, AND WHY NOT JUST CONNECT EACH TIME?
 *
 * Opening a database connection is expensive: a TCP handshake, then
 * authentication, then session setup -- typically 20-50ms. If every
 * API request opened its own connection, that cost would be paid on
 * every single request, and a burst of traffic would open hundreds
 * of connections at once until MySQL refused them
 * ("Too many connections").
 *
 * A pool opens a small set of connections ONCE and lends them out:
 *
 *     request  ->  borrow connection  ->  query  ->  return to pool
 *
 * Borrowing is instant. If all connections are busy, the next
 * request waits in a queue rather than overwhelming the server.
 *
 * WHY mysql2 AND NOT mysql?
 * mysql2 supports Promises (so we can use async/await instead of
 * callback pyramids) and, crucially, PREPARED STATEMENTS via
 * pool.execute() -- which is our defence against SQL injection.
 */

const mysql = require('mysql2/promise')
const config = require('./env')

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,

  // Queue requests instead of erroring when every connection is busy.
  waitForConnections: true,

  // Maximum simultaneous connections. 10 is comfortable for a
  // college project; MySQL's own default ceiling is 151 total.
  connectionLimit: 10,

  // 0 = unlimited queue. A request waits rather than being rejected.
  queueLimit: 0,

  // Must match the schema, or text stored correctly still reads back
  // as mojibake (garbled characters).
  charset: 'utf8mb4',

  // Return DATE/DATETIME columns as strings rather than JS Date
  // objects. JS Dates silently apply the server's timezone, which
  // makes a timestamp shift depending on where the code runs -- a
  // genuinely painful bug to track down. Strings stay exactly as
  // MySQL stored them.
  dateStrings: true,

  // Fail fast if MySQL is unreachable, instead of hanging.
  connectTimeout: 10_000,
})

/**
 * Verifies the database is actually reachable.
 *
 * Called once at startup so a misconfigured password fails
 * IMMEDIATELY with a clear message, rather than at 2am when the
 * first user tries to register. Fail loudly, fail early.
 */
async function testConnection() {
  let connection
  try {
    connection = await pool.getConnection()
    await connection.ping()

    const [rows] = await connection.query(
      'SELECT DATABASE() AS db, VERSION() AS version',
    )

    console.log('[db] connected to MySQL')
    console.log(`     database : ${rows[0].db}`)
    console.log(`     version  : ${rows[0].version}`)
    return true
  } catch (err) {
    // Translate the driver's cryptic codes into instructions.
    console.error('\n[db] FATAL: could not connect to MySQL.')

    switch (err.code) {
      case 'ER_ACCESS_DENIED_ERROR':
        console.error('     Wrong username or password.')
        console.error('     Check DB_USER and DB_PASSWORD in backend/.env')
        break
      case 'ER_BAD_DB_ERROR':
        console.error(`     Database "${config.db.database}" does not exist.`)
        console.error('     Create it by running database/schema.sql')
        break
      case 'ECONNREFUSED':
        console.error(`     Nothing is listening on ${config.db.host}:${config.db.port}.`)
        console.error('     Is the MySQL service running?')
        console.error('     Windows: check the MySQL80 service in services.msc')
        break
      case 'ETIMEDOUT':
        console.error('     Connection timed out. Check the host and any firewall.')
        break
      default:
        console.error(`     ${err.code || err.name}: ${err.message}`)
    }
    console.error('')
    return false
  } finally {
    // ALWAYS return the connection to the pool, even if the query
    // threw. Forgetting this "leaks" a connection: the pool believes
    // it is still in use and never lends it out again. Leak all ten
    // and the app hangs forever, waiting for one to free up.
    if (connection) connection.release()
  }
}

/** Closes every pooled connection. Used on graceful shutdown. */
async function closePool() {
  await pool.end()
  console.log('[db] connection pool closed')
}

module.exports = { pool, testConnection, closePool }
