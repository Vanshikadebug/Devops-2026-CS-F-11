/**
 * scripts/setup-db.js -- creates the database from database/schema.sql
 *
 * WHY A SCRIPT INSTEAD OF RUNNING mysql.exe BY HAND?
 *
 *  1. NO PASSWORD ON THE COMMAND LINE. Typing
 *       mysql -u root -pMyPassword < schema.sql
 *     puts the password in your shell history and, on some systems,
 *     in the process list where any other user can read it. This
 *     script reads it from backend/.env, which is gitignored.
 *
 *  2. NO DEPENDENCE ON PATH. The mysql client is not on PATH on this
 *     machine. We use the mysql2 driver the app already depends on,
 *     so this works anywhere Node works -- including inside Docker
 *     in Phase 13, where the mysql CLI may not be installed at all.
 *
 *  3. IT REPORTS WHAT IT DID, and verifies the result instead of
 *     assuming success.
 *
 * USAGE:  npm run db:setup
 */

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const config = require('../config/env')

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.sql')

async function main() {
  console.log('\n=== ReuseHub database setup ===\n')

  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`[setup] FATAL: schema file not found at ${SCHEMA_PATH}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8')
  console.log(`[setup] loaded schema (${(sql.length / 1024).toFixed(1)} kB)`)

  let connection
  try {
    // Connect WITHOUT selecting a database -- the schema file
    // creates it. Connecting to a database that does not exist yet
    // would fail with ER_BAD_DB_ERROR.
    //
    // multipleStatements is required because schema.sql contains
    // many statements separated by semicolons. It is enabled ONLY
    // here: the application pool leaves it off, because combined
    // with string concatenation it turns a SQL injection into a
    // catastrophic one (an attacker could append `; DROP TABLE`).
    connection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      multipleStatements: true,
      charset: 'utf8mb4',
    })

    console.log(`[setup] connected to MySQL at ${config.db.host}:${config.db.port}`)
    console.log('[setup] running schema.sql …')

    await connection.query(sql)

    console.log('[setup] schema applied\n')

    // --- Verify, do not assume ---------------------------------
    await connection.changeUser({ database: config.db.database })

    const [tables] = await connection.query('SHOW TABLES')
    const tableNames = tables.map((row) => Object.values(row)[0])
    console.log(`[setup] tables created: ${tableNames.join(', ')}`)

    for (const table of ['users', 'items', 'requests']) {
      const [cols] = await connection.query(`SHOW COLUMNS FROM \`${table}\``)
      console.log(`         ${table.padEnd(9)} ${cols.length} columns`)
    }

    const [fks] = await connection.query(
      `SELECT COUNT(*) AS n
         FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ?
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [config.db.database],
    )
    console.log(`[setup] foreign keys: ${fks[0].n}`)

    console.log('\n[setup] done. Next: npm run db:seed\n')
  } catch (err) {
    console.error('\n[setup] FAILED')

    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('        MySQL rejected the credentials.')
      console.error('        Set DB_PASSWORD in backend/.env to your MySQL root password.')
      console.error('        (The value is never printed and is gitignored.)')
    } else if (err.code === 'ECONNREFUSED') {
      console.error(`        Nothing is listening on ${config.db.host}:${config.db.port}.`)
      console.error('        Start the MySQL80 service and try again.')
    } else {
      console.error(`        ${err.code || err.name}: ${err.message}`)
    }
    console.error('')
    process.exit(1)
  } finally {
    if (connection) await connection.end()
  }
}

main()
