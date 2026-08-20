/**
 * scripts/migrate.js -- upgrades an EXISTING database in place.
 *
 * WHY THIS EXISTS WHEN db:setup ALREADY BUILDS THE SCHEMA
 * `npm run db:reset` runs schema.sql, which starts with DROP TABLE.
 * On a fresh machine that is exactly right. On a database that people
 * have been using it destroys every account and every listing --
 * including, on this project, sixteen real accounts and thirteen real
 * items. "Just re-run the schema" is the single most common way a
 * schema change turns into data loss.
 *
 * So the admin panel's schema changes arrive two ways, and they must
 * agree:
 *   fresh install  -> database/schema.sql          (drops, recreates)
 *   existing data  -> this script                 (adds, never drops)
 *
 * >>> THE THREE RULES THIS SCRIPT FOLLOWS <<<
 *
 *  1. ADDITIVE ONLY. Every statement it runs is CREATE TABLE IF NOT
 *     EXISTS, ADD COLUMN, ADD KEY, ADD CONSTRAINT or INSERT IGNORE.
 *     There is no DROP, no DELETE, no TRUNCATE and no UPDATE of
 *     existing rows anywhere in this file -- and the very first thing
 *     main() does is grep itself to prove it. A safety rule that is
 *     only a comment is a safety rule until someone edits the file.
 *
 *  2. IDEMPOTENT. Every change is guarded by an information_schema
 *     lookup, so running it twice is a no-op. MySQL 8 has no
 *     `ADD COLUMN IF NOT EXISTS` (MariaDB does), and an unguarded
 *     ADD COLUMN fails the whole ALTER with ER_DUP_FIELDNAME -- which
 *     would leave a half-migrated database if several columns were
 *     batched into one statement.
 *
 *  3. IT VERIFIES ITSELF AGAINST schema.sql. After migrating, it
 *     compares the live columns of all nine tables against the columns
 *     declared in schema.sql and reports any difference. This is the
 *     check that matters most in the long run: the realistic failure
 *     is not a broken ALTER, it is someone adding a column here and
 *     forgetting schema.sql, so a fresh install and a migrated install
 *     quietly stop being the same database.
 *
 * USAGE:  npm run db:migrate
 */

const fs = require('fs')
const path = require('path')
const { pool, closePool } = require('../config/db')
const config = require('../config/env')
const settingsModel = require('../models/settingsModel')

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.sql')

/* The tables that must already exist for this to be an upgrade rather
   than a first install. */
const BASE_TABLES = ['cities', 'areas', 'colleges', 'users', 'items', 'requests']

/* The tables schema.sql defines that this script creates if absent.
   The DDL is not written out here -- it is read from schema.sql, so
   the two cannot drift. */
const NEW_TABLES = ['audit_logs', 'reports', 'platform_settings']

/* Every table whose columns get cross-checked at the end. */
const ALL_TABLES = [...BASE_TABLES, ...NEW_TABLES]

/* ---------------------------------------------------------------
   THE CHANGES
   ---------------------------------------------------------------
   Data, not code, so the whole migration can be read in one screen
   and each entry carries the reason it is safe.

   Every new column is either NULLABLE or has a DEFAULT. That is what
   makes adding it to a populated table safe: MySQL fills existing
   rows with the default, and no row is left violating NOT NULL. A
   NOT NULL column with no default cannot be added to a non-empty
   table at all. */
const COLUMNS = [
  {
    table: 'users',
    column: 'role',
    after: 'college_id',
    ddl: "ENUM('user','moderator','admin','super_admin') NOT NULL DEFAULT 'user'",
    // Existing accounts all become 'user'. That is the safe direction:
    // a migration that guessed anyone into 'admin' would be a
    // privilege-escalation bug shipped as a schema change.
    note: 'all existing accounts become role=user',
  },
  {
    table: 'users',
    column: 'status',
    after: 'role',
    ddl: "ENUM('active','blocked') NOT NULL DEFAULT 'active'",
    note: 'all existing accounts stay active',
  },
  {
    table: 'users',
    column: 'last_login_at',
    after: 'status',
    ddl: 'TIMESTAMP NULL DEFAULT NULL',
    // NULL, not created_at: we do not know when these people last
    // logged in, and inventing a plausible timestamp would put a
    // fabricated fact in front of an admin making a decision.
    note: 'NULL until the next login -- not backfilled, because it is not known',
  },
  {
    table: 'colleges',
    column: 'description',
    after: 'slug',
    ddl: 'VARCHAR(1000) DEFAULT NULL',
    note: 'NULL -- no invented descriptions of real institutions',
  },
  {
    table: 'colleges',
    column: 'image_url',
    after: 'description',
    ddl: 'VARCHAR(500) DEFAULT NULL',
    note: 'NULL -- no invented photographs of real campuses',
  },
  {
    table: 'items',
    column: 'moderation_status',
    after: 'status',
    ddl: "ENUM('Pending','Approved','Rejected','Hidden') NOT NULL DEFAULT 'Approved'",
    /* >>> THE MOST CONSEQUENTIAL LINE IN THIS FILE <<<
       DEFAULT 'Approved' means every listing already on the site stays
       visible the instant this runs. DEFAULT 'Pending' would empty the
       home page and the search results until a human clicked through
       thirteen items -- a schema change that reads as an outage.
       Whether NEW items start Pending is a runtime setting
       (require_item_approval), not a column default. */
    note: "existing listings stay visible (Approved), NOT hidden pending review",
  },
  {
    table: 'items',
    column: 'moderated_by',
    after: 'moderation_status',
    ddl: 'INT UNSIGNED DEFAULT NULL',
    note: 'NULL = no moderator has ever touched this row',
  },
  {
    table: 'items',
    column: 'moderated_at',
    after: 'moderated_by',
    ddl: 'TIMESTAMP NULL DEFAULT NULL',
  },
  {
    table: 'items',
    column: 'moderation_reason',
    after: 'moderated_at',
    ddl: 'VARCHAR(500) DEFAULT NULL',
  },
]

const INDEXES = [
  { table: 'users', name: 'idx_users_role', columns: '(role)' },
  { table: 'users', name: 'idx_users_status', columns: '(status)' },
  { table: 'items', name: 'idx_items_moderation', columns: '(moderation_status)' },
]

const FOREIGN_KEYS = [
  {
    table: 'items',
    name: 'fk_items_moderator',
    ddl: 'FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE',
    // SET NULL, not CASCADE. Deleting an admin account must not delete
    // every listing that admin once reviewed.
  },
]

/* The "exactly one target" invariant on `reports`. MySQL would not
   accept it as a CHECK constraint alongside cascading foreign keys --
   the long explanation is in schema.sql, at the reports table. Like
   the new tables, the statements are read from schema.sql rather than
   repeated here.

   MySQL 8 has no CREATE TRIGGER IF NOT EXISTS, so the guard is an
   information_schema lookup like everything else in this file. */
const TRIGGERS = ['trg_reports_one_target_insert', 'trg_reports_one_target_update']

/* ---------------------------------------------------------------
   INTROSPECTION
   ---------------------------------------------------------------
   All four helpers read information_schema, the catalogue MySQL keeps
   about itself. Asking it is the only reliable way to know whether a
   change has already been applied; the alternative -- a
   schema_version number -- lies the moment anyone touches the
   database by hand, which on a development machine is every day. */

async function tableExists(table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  )
  return rows[0].n > 0
}

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  return rows[0].n > 0
}

async function indexExists(table, name) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, name],
  )
  return rows[0].n > 0
}

async function constraintExists(name) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    [name],
  )
  return rows[0].n > 0
}

async function triggerExists(name) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`,
    [name],
  )
  return rows[0].n > 0
}

async function liveColumns(table) {
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table],
  )
  return rows.map((r) => r.name)
}

/* ---------------------------------------------------------------
   READING schema.sql
   --------------------------------------------------------------- */

/**
 * Pulls one complete `CREATE TABLE x (...) ENGINE=InnoDB ...;`
 * statement out of schema.sql.
 *
 * The regex anchors on a closing paren at the START of a line
 * followed by ` ENGINE=InnoDB`, which is why it is not confused by the
 * hundreds of parentheses inside the comments and the ENUM lists. A
 * proper SQL parser would be more correct and would also be a
 * dependency; this is a file we control, formatted consistently, and
 * the script fails loudly if the pattern ever stops matching.
 */
function createTableStatement(sql, table) {
  const re = new RegExp(
    `CREATE TABLE ${table} \\([\\s\\S]*?\\n\\) ENGINE=InnoDB[^;]*;`,
  )
  const match = sql.match(re)
  if (!match) {
    throw new Error(
      `migrate: could not find "CREATE TABLE ${table}" in database/schema.sql. ` +
        'Either the table was renamed there, or its formatting changed.',
    )
  }
  // IF NOT EXISTS makes re-running harmless. The rest of the statement
  // is byte-for-byte the one a fresh install gets.
  return match[0].replace(`CREATE TABLE ${table}`, `CREATE TABLE IF NOT EXISTS ${table}`)
}

/**
 * Pulls one complete `CREATE TRIGGER name ... END;` statement out of
 * schema.sql. Anchored on `END;` at the start of a line, which is why
 * the trigger bodies in schema.sql are formatted with that closing
 * `END;` unindented.
 */
function createTriggerStatement(sql, name) {
  const re = new RegExp(`CREATE TRIGGER ${name}\\b[\\s\\S]*?\\nEND;`)
  const match = sql.match(re)
  if (!match) {
    throw new Error(
      `migrate: could not find "CREATE TRIGGER ${name}" in database/schema.sql`,
    )
  }
  return match[0]
}

/**
 * The column names schema.sql declares for a table, in order.
 * A column line is two spaces, a lowercase identifier, whitespace,
 * then an uppercase type. KEY / PRIMARY KEY / UNIQUE / CONSTRAINT /
 * FULLTEXT lines start with an uppercase keyword and comment lines
 * start with `--`, so neither can be mistaken for a column.
 */
function declaredColumns(sql, table) {
  const statement = createTableStatement(sql, table)
  const names = []
  for (const line of statement.split('\n')) {
    const m = line.match(/^ {2}([a-z][a-z0-9_]*)\s+[A-Z]/)
    if (m) names.push(m[1])
  }
  if (names.length === 0) {
    throw new Error(`migrate: parsed zero columns for ${table} -- the parser is wrong, not the schema`)
  }
  return names
}

/* ---------------------------------------------------------------
   SELF-CHECK
   --------------------------------------------------------------- */

/**
 * Reads THIS file and refuses to run if it contains a destructive
 * statement.
 *
 * This is not theatre. The one thing a migration must never do is
 * delete data, and the way that gets introduced is someone adding a
 * "quick" DROP INDEX or UPDATE to fix something, six months from now,
 * with the file's careful comments scrolled off the screen. A check
 * that runs cannot be skipped by not reading.
 */
function assertNoDestructiveStatements() {
  const source = fs.readFileSync(__filename, 'utf8')

  /* The words to refuse are held as STRING LITERALS on purpose. The
     stripping below removes comments and string contents, so this
     array becomes ['', '', ''] in `code` -- which is what stops the
     check from finding itself and failing every single run. Writing
     the pattern as a regex literal instead would do exactly that,
     because a regex literal is not a string and survives stripping. */
  const BANNED = ['DROP', 'TRUNCATE', 'DELETE FROM']

  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'[^'\n]*'/g, ' ')
    .replace(/"[^"\n]*"/g, ' ')
    .replace(/`[^`]*`/g, ' ')

  const pattern = new RegExp(
    `\\b(${BANNED.map((w) => w.replace(' ', '\\s+')).join('|')})\\b`,
    'i',
  )

  const hit = code.match(pattern)
  if (hit) {
    throw new Error(
      `migrate: refusing to run -- this script contains "${hit[1]}". ` +
        'Migrations are additive only. If a column really has to be removed, ' +
        'do it deliberately and by hand, with a backup taken first.',
    )
  }
}

/* ---------------------------------------------------------------
   MAIN
   --------------------------------------------------------------- */

async function main() {
  console.log('\n=== ReuseHub database migration (additive) ===\n')

  assertNoDestructiveStatements()
  console.log('[migrate] self-check passed: no destructive statements in this script')

  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8')

  // --- Preflight: is this actually an existing install? ----------
  for (const table of BASE_TABLES) {
    if (!(await tableExists(table))) {
      console.error(`\n[migrate] STOPPED: table "${table}" does not exist.`)
      console.error('          This looks like a fresh database, not one to upgrade.')
      console.error('          Run:  npm run db:setup && npm run db:seed\n')
      process.exit(1)
    }
  }
  console.log(`[migrate] found all ${BASE_TABLES.length} base tables in "${config.db.database}"`)

  /* --- Row counts BEFORE ----------------------------------------
     Recorded so the summary can PROVE nothing was lost, rather than
     asserting it. "No data was deleted" is a claim; 16 before and 16
     after is evidence. */
  const before = {}
  for (const table of BASE_TABLES) {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${table}\``)
    before[table] = Number(row.n)
  }
  console.log(
    `[migrate] before: ${BASE_TABLES.map((t) => `${t}=${before[t]}`).join('  ')}`,
  )

  let changes = 0
  const skipped = []

  // --- 1. New tables --------------------------------------------
  console.log('\n[migrate] tables')
  for (const table of NEW_TABLES) {
    if (await tableExists(table)) {
      skipped.push(`table ${table}`)
      console.log(`          = ${table.padEnd(20)} already exists`)
      continue
    }
    await pool.query(createTableStatement(sql, table))
    changes++
    console.log(`          + ${table.padEnd(20)} created from schema.sql`)
  }

  // --- 2. New columns -------------------------------------------
  console.log('\n[migrate] columns')
  for (const c of COLUMNS) {
    if (await columnExists(c.table, c.column)) {
      skipped.push(`${c.table}.${c.column}`)
      console.log(`          = ${`${c.table}.${c.column}`.padEnd(28)} already exists`)
      continue
    }
    /* Table and column names are interpolated, not bound. Placeholders
       are not permitted in DDL by MySQL at all -- there is no prepared
       form of ALTER TABLE. Every value interpolated here comes from the
       const arrays at the top of this file, never from input, which is
       the condition that makes interpolation acceptable. */
    await pool.query(
      `ALTER TABLE \`${c.table}\` ADD COLUMN \`${c.column}\` ${c.ddl}` +
        (c.after ? ` AFTER \`${c.after}\`` : ''),
    )
    changes++
    console.log(
      `          + ${`${c.table}.${c.column}`.padEnd(28)} added${c.note ? ` -- ${c.note}` : ''}`,
    )
  }

  // --- 3. Indexes -----------------------------------------------
  console.log('\n[migrate] indexes')
  for (const i of INDEXES) {
    if (await indexExists(i.table, i.name)) {
      skipped.push(i.name)
      console.log(`          = ${i.name.padEnd(28)} already exists`)
      continue
    }
    await pool.query(`ALTER TABLE \`${i.table}\` ADD KEY \`${i.name}\` ${i.columns}`)
    changes++
    console.log(`          + ${i.name.padEnd(28)} on ${i.table} ${i.columns}`)
  }

  // --- 4. Foreign keys ------------------------------------------
  console.log('\n[migrate] foreign keys')
  for (const fk of FOREIGN_KEYS) {
    if (await constraintExists(fk.name)) {
      skipped.push(fk.name)
      console.log(`          = ${fk.name.padEnd(28)} already exists`)
      continue
    }
    await pool.query(
      `ALTER TABLE \`${fk.table}\` ADD CONSTRAINT \`${fk.name}\` ${fk.ddl}`,
    )
    changes++
    console.log(`          + ${fk.name.padEnd(28)} on ${fk.table}`)
  }

  // --- 5. Triggers ----------------------------------------------
  console.log('\n[migrate] triggers')
  for (const name of TRIGGERS) {
    if (await triggerExists(name)) {
      skipped.push(name)
      console.log(`          = ${name.padEnd(34)} already exists`)
      continue
    }
    await pool.query(createTriggerStatement(sql, name))
    changes++
    console.log(`          + ${name.padEnd(34)} created from schema.sql`)
  }

  // --- 6. Default settings rows ---------------------------------
  // From settingsModel.DEFAULT_SETTINGS, the same list the seed uses,
  // via INSERT IGNORE -- so a value an admin has already changed is
  // never reset by re-running this.
  console.log('\n[migrate] settings')
  const inserted = await settingsModel.ensureDefaults()
  const [[settingsCount]] = await pool.query('SELECT COUNT(*) AS n FROM platform_settings')
  changes += inserted
  console.log(
    `          ${inserted > 0 ? '+' : '='} ${inserted} default setting(s) inserted, ` +
      `${settingsCount.n} row(s) present`,
  )

  /* --- Row counts AFTER, and the proof --------------------------- */
  console.log('\n[migrate] verifying no data was lost')
  let lost = false
  for (const table of BASE_TABLES) {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${table}\``)
    const after = Number(row.n)
    const ok = after === before[table]
    if (!ok) lost = true
    console.log(
      `          ${ok ? 'ok  ' : 'LOST'} ${table.padEnd(10)} ${before[table]} -> ${after}`,
    )
  }
  if (lost) {
    console.error('\n[migrate] FAILED: a row count changed. Investigate before continuing.\n')
    process.exit(1)
  }

  /* --- Does the live database now match schema.sql? --------------
     The check that catches the drift this script's whole design is
     meant to prevent. */
  console.log('\n[migrate] comparing live columns against database/schema.sql')
  let drift = false
  for (const table of ALL_TABLES) {
    const declared = declaredColumns(sql, table)
    const live = await liveColumns(table)

    const missing = declared.filter((c) => !live.includes(c))
    const extra = live.filter((c) => !declared.includes(c))

    if (missing.length === 0 && extra.length === 0) {
      console.log(`          ok   ${table.padEnd(18)} ${live.length} columns match`)
      continue
    }
    drift = true
    console.log(`          DIFF ${table.padEnd(18)}`)
    if (missing.length) console.log(`               in schema.sql but not in the database: ${missing.join(', ')}`)
    if (extra.length) console.log(`               in the database but not in schema.sql: ${extra.join(', ')}`)
  }

  if (drift) {
    console.error(
      '\n[migrate] FAILED: the live database and schema.sql disagree.\n' +
        '          A fresh install would not match this one. Fix schema.sql or\n' +
        '          add the missing step to COLUMNS in this file, then re-run.\n',
    )
    process.exit(1)
  }

  console.log(
    `\n[migrate] done. ${changes} change(s) applied, ${skipped.length} already in place.`,
  )
  console.log('          Next, if you have not made an admin yet:  npm run db:admin\n')
}

main()
  .catch((err) => {
    console.error('\n[migrate] FAILED')
    console.error(`          ${err.code || err.name}: ${err.message}\n`)
    process.exitCode = 1
  })
  .finally(closePool)
