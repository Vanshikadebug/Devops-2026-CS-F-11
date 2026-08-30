#!/usr/bin/env node
/**
 * Runs the Prisma CLI with DATABASE_URL guaranteed to be set.
 *
 * The app never needs DATABASE_URL in the environment: lib/prisma.js passes
 * config.databaseUrl to PrismaClient directly, and config/env.js derives that
 * from DB_HOST/DB_USER/... when DATABASE_URL is absent.
 *
 * The Prisma CLI is a different process. It reads DATABASE_URL itself and fails
 * with "Unable to run script" / "Environment variable not found" when only the
 * DB_* variables exist. This wrapper closes that gap, so `db:studio` and
 * `db:migrate` work with either style of .env.
 *
 *   node scripts/prisma.js studio
 */

const { spawnSync } = require('child_process')
const config = require('./../src/config/env')

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('[prisma] no arguments, e.g. `node scripts/prisma.js migrate status`')
  process.exit(1)
}

const result = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  // Required on Windows for npx to resolve.
  shell: true,
  env: { ...process.env, DATABASE_URL: config.databaseUrl },
})

process.exit(result.status ?? 1)
