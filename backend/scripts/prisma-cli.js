/**
 * scripts/prisma-cli.js -- runs the Prisma CLI with DATABASE_URL derived
 * from the DB_* variables in backend/.env.
 *
 * >>> WHY NOT JUST PUT DATABASE_URL IN .env? <<<
 * Because then the password lives in two places. The day someone
 * changes DB_PASSWORD and not DATABASE_URL, the app keeps working and
 * every migration silently targets the old credentials -- or fails with
 * an access-denied error that points at nothing. config/env.js is
 * already the single place this project reads configuration from, and
 * it encodes the URL components correctly (see config.databaseUrl).
 *
 * Usage:  node scripts/prisma-cli.js <any prisma args>
 *   e.g.  node scripts/prisma-cli.js migrate deploy
 */

const { spawnSync } = require('child_process')
const config = require('../config/env')

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('[prisma] no arguments given, e.g. `node scripts/prisma-cli.js migrate status`')
  process.exit(1)
}

const result = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  // shell: true is required on Windows for npx to resolve.
  shell: true,
  env: { ...process.env, DATABASE_URL: config.databaseUrl },
})

process.exit(result.status ?? 1)
