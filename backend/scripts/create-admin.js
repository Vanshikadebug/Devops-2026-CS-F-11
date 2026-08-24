/**
 * scripts/create-admin.js -- creates (or promotes) the first admin.
 *
 * WHY A SCRIPT AND NOT A SIGN-UP OPTION
 * There is no "register as admin" form, and there is no code path that
 * lets a registration body choose a role -- see the comment on
 * users.role in schema.sql. That is what makes privilege escalation
 * structurally impossible rather than merely filtered. The consequence
 * is that the FIRST admin cannot be created through the application at
 * all, and has to be created by someone with access to the server and
 * its .env file. That is the correct trade: the bootstrap step is the
 * one place where "has shell access" is the right authorisation, and
 * it happens once.
 *
 * >>> THE PASSWORD IS NEVER IN THIS FILE, AND NEVER IN THE OUTPUT <<<
 * It comes from ADMIN_PASSWORD in backend/.env (gitignored), is hashed
 * with bcrypt before it touches the database, and is not printed, not
 * logged, and not echoed back on error. The only thing this script
 * ever says about it is whether it was accepted.
 *
 * USAGE:
 *   1. Put these in backend/.env  (NOT in .env.example, NOT in git):
 *        ADMIN_EMAIL=you@yourdomain.com
 *        ADMIN_PASSWORD=<a long password you have not used elsewhere>
 *        ADMIN_NAME=Your Name
 *        ADMIN_MOBILE=9876543210
 *   2. npm run db:admin
 *   3. DELETE ADMIN_PASSWORD from .env. It is not needed again, and a
 *      password sitting in a file is a password waiting to be copied.
 */

const bcrypt = require('bcryptjs')
const { pool, closePool } = require('../config/db')
const config = require('../config/env')
const auditModel = require('../models/auditModel')

/* The bootstrap account is super_admin, not admin.
   Only super_admin may change roles (middleware/authorize.js), so an
   `admin` bootstrap would leave a system in which nobody can ever
   appoint a second administrator -- a locked door with the key inside.
   Everyone else is promoted from the panel by this account. */
const BOOTSTRAP_ROLE = 'super_admin'

/* Admin passwords are held to a higher bar than the 8 characters
   registration asks of an ordinary user, because this credential opens
   every account on the site rather than one. 12 is the shortest length
   at which a mixed password is meaningfully out of reach of offline
   brute force. */
const MIN_PASSWORD_LENGTH = 12

/* Values that must be refused outright. The realistic mistake is not
   someone inventing 'admin123' -- it is copying the demo password out
   of the README into ADMIN_PASSWORD, because it is right there and it
   works. That one is first in the list. */
const FORBIDDEN_PASSWORDS = [
  'password123', 'password', 'admin', 'admin123', 'administrator',
  'reusehub', 'reusehub123', 'changeme', 'letmein', '123456789012',
  'qwertyuiop', 'passw0rd', 'welcome1234',
]

function fail(lines) {
  console.error('\n[admin] REFUSED\n')
  for (const line of lines) console.error(`        ${line}`)
  console.error('')
  process.exit(1)
}

/**
 * Everything that can be checked before touching the database.
 * Collected into one list and reported together, so a misconfigured
 * .env is fixed in one pass instead of one error per run.
 */
function validate({ email, password, name, mobile }) {
  const problems = []

  if (!email) problems.push('ADMIN_EMAIL is not set in backend/.env')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    problems.push(`ADMIN_EMAIL "${email}" is not a valid email address`)
  }

  if (!name) problems.push('ADMIN_NAME is not set in backend/.env')
  else if (name.length < 2 || name.length > 100) {
    problems.push('ADMIN_NAME must be 2 to 100 characters')
  }

  /* No default mobile. users.mobile is NOT NULL, so something has to
     go in it -- and a placeholder like 9999999999 would be a fake
     phone number sitting in a real database, shown to real users on a
     real listing page. Asking for one is the honest option. */
  if (!mobile) problems.push('ADMIN_MOBILE is not set in backend/.env')
  else if (!/^(\+91[- ]?)?[6-9]\d{9}$/.test(mobile)) {
    problems.push('ADMIN_MOBILE must be a 10-digit Indian mobile number starting 6-9')
  }

  /* Password problems are described WITHOUT quoting the value. Printing
     it would put the credential in the terminal scrollback, in CI logs,
     and in any screenshot of this run. */
  if (!password) problems.push('ADMIN_PASSWORD is not set in backend/.env')
  else {
    if (password.length < MIN_PASSWORD_LENGTH) {
      problems.push(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters (it is ${password.length})`)
    }
    // bcrypt silently ignores bytes past 72, so a longer password would
    // be quietly truncated -- and a DIFFERENT password sharing the first
    // 72 bytes would also unlock the account.
    if (password.length > 72) {
      problems.push('ADMIN_PASSWORD must be at most 72 characters (a bcrypt limit, not a style choice)')
    }
    if (!/[a-zA-Z]/.test(password)) problems.push('ADMIN_PASSWORD must contain a letter')
    if (!/\d/.test(password)) problems.push('ADMIN_PASSWORD must contain a number')
    if (FORBIDDEN_PASSWORDS.includes(password.toLowerCase())) {
      problems.push('ADMIN_PASSWORD is a well-known value and is refused. Choose something else.')
    }
    if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase())) {
      problems.push('ADMIN_PASSWORD must not contain the email name')
    }
  }

  return problems
}

async function main() {
  console.log('\n=== ReuseHub admin bootstrap ===\n')

  const email = config.seedAdmin.email.trim().toLowerCase()
  const name = config.seedAdmin.name.trim()
  const mobile = config.seedAdmin.mobile.trim()
  const { password } = config.seedAdmin

  const problems = validate({ email, password, name, mobile })
  if (problems.length) {
    fail([
      ...problems,
      '',
      'Set these in backend/.env (which is gitignored) and run again:',
      '  ADMIN_EMAIL=you@yourdomain.com',
      '  ADMIN_PASSWORD=<12+ characters, with a letter and a digit>',
      '  ADMIN_NAME=Your Name',
      '  ADMIN_MOBILE=9876543210',
    ])
  }
  console.log('[admin] configuration accepted (the password is not printed anywhere)')

  /* --- Does the account already exist? --------------------------
     Reading `role` and `status`, deliberately NOT `password`. There is
     no reason for this script to load a hash, so it does not.

     Re-running must be safe, because it will be re-run: someone will
     forget whether they already did it. */
  const [existing] = await pool.execute(
    'SELECT id, name, role, status FROM users WHERE email = ?',
    [email],
  )

  if (existing.length > 0) {
    const user = existing[0]

    if (user.role === BOOTSTRAP_ROLE && user.status === 'active') {
      console.log(`[admin] ${email} is already an active ${BOOTSTRAP_ROLE} (id ${user.id})`)
      console.log('[admin] nothing to do. The password was NOT changed.\n')
      return
    }

    /* PROMOTE, and do not touch the password.
       >>> WHY NOT RESET IT WHILE WE ARE HERE? <<<
       Because that turns this script into a password-reset tool for any
       account on the site: put someone else's email in ADMIN_EMAIL, run
       it, and you own their account -- including all their items. It
       would also mean re-running the script after a routine password
       change silently reverted it to whatever is still in .env.
       Promotion changes authorisation; it must not change credentials. */
    await pool.execute(
      "UPDATE users SET role = ?, status = 'active' WHERE id = ?",
      [BOOTSTRAP_ROLE, user.id],
    )

    await auditModel.record({
      adminId: user.id,
      adminEmail: email,
      action: 'user.role_change',
      targetType: 'user',
      targetId: user.id,
      description: `Promoted ${email} from ${user.role} to ${BOOTSTRAP_ROLE} via scripts/create-admin.js`,
      changes: { role: [user.role, BOOTSTRAP_ROLE], status: [user.status, 'active'] },
    })

    console.log(`[admin] existing account ${email} (id ${user.id})`)
    console.log(`[admin] role ${user.role} -> ${BOOTSTRAP_ROLE}, status -> active`)
    console.log('[admin] the password was NOT changed. Sign in with the one you already had.\n')
    return
  }

  // --- Create ---------------------------------------------------
  // Hashed here, before the INSERT. The plain value never reaches SQL,
  // so it cannot appear in a query log either.
  const hash = await bcrypt.hash(password, config.bcryptSaltRounds)

  const [result] = await pool.execute(
    `INSERT INTO users (name, email, mobile, password, role, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [name, email, mobile, hash, BOOTSTRAP_ROLE],
  )

  /* The log's first entry, written by the account it describes. That is
     honest -- nobody else existed to authorise this -- and it means
     /admin/activity has a real row from the very first page load
     instead of needing a seeded fake one. */
  await auditModel.record({
    adminId: result.insertId,
    adminEmail: email,
    action: 'admin.bootstrap',
    targetType: 'user',
    targetId: result.insertId,
    description: `Created the first ${BOOTSTRAP_ROLE} account ${email} via scripts/create-admin.js`,
    changes: { role: [null, BOOTSTRAP_ROLE] },
  })

  // Read back rather than trusting the insert, and confirm the hash is
  // a hash -- the one check worth making about a password column.
  const [[check]] = await pool.execute(
    `SELECT id, name, email, role, status,
            LEFT(password, 4) AS hash_prefix, LENGTH(password) AS hash_length
       FROM users WHERE id = ?`,
    [result.insertId],
  )

  console.log(`[admin] created ${check.email} (id ${check.id})`)
  console.log(`        name   : ${check.name}`)
  console.log(`        role   : ${check.role}`)
  console.log(`        status : ${check.status}`)
  console.log(`        stored : bcrypt hash, ${check.hash_length} chars, starts "${check.hash_prefix}"`)

  // `LEFT(password, 4)` is the full bcrypt version tag INCLUDING its
  // closing '$' -- "$2b$". The pattern has to match all four.
  if (!/^\$2[aby]\$$/.test(check.hash_prefix) || check.hash_length !== 60) {
    fail(['the stored password does not look like a bcrypt hash. Investigate before using this account.'])
  }

  console.log('\n[admin] done. Sign in at http://localhost:5173/login, then open /admin')
  console.log('[admin] now REMOVE ADMIN_PASSWORD from backend/.env -- it is not needed again.\n')
}

main()
  .catch((err) => {
    console.error('\n[admin] FAILED')
    if (err.code === 'ER_DUP_ENTRY') {
      console.error('        That email or mobile number is already registered.')
    } else if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') {
      console.error('        The database has not been migrated yet. Run: npm run db:migrate')
    } else {
      console.error(`        ${err.code || err.name}: ${err.message}`)
    }
    console.error('')
    process.exitCode = 1
  })
  .finally(closePool)
