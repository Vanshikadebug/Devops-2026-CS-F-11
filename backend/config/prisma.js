/**
 * config/prisma.js -- the Prisma client, created once.
 *
 * >>> WHY A SINGLETON <<<
 * PrismaClient owns a connection pool. Constructing a second one opens
 * a second pool, and nothing closes the first -- the same "leak all ten
 * and the app hangs" failure documented in config/db.js, except harder
 * to see because each `new PrismaClient()` looks harmless on its own.
 * One instance, imported everywhere.
 *
 * The URL is passed explicitly rather than read from DATABASE_URL in the
 * environment, because DB_* in .env is this project's single source of
 * truth (see config/env.js databaseUrl). That also means the running app
 * needs no DATABASE_URL set at all -- only the Prisma CLI does, and
 * scripts/prisma-cli.js supplies it there.
 */

const { PrismaClient } = require('@prisma/client')
const config = require('./env')

const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  // Query logging in development only. In tests it buries the results;
  // in production it would write every query -- and every argument,
  // including hashed passwords and emails -- into the logs.
  log: config.isProduction || config.isTest ? ['warn', 'error'] : ['warn', 'error'],
})

/** Confirms the database is reachable. Mirrors db.js testConnection. */
async function testPrismaConnection() {
  await prisma.$queryRaw`SELECT 1`
  return true
}

/** Closes the pool. Used on graceful shutdown and by test teardown. */
async function disconnectPrisma() {
  await prisma.$disconnect()
}

module.exports = { prisma, testPrismaConnection, disconnectPrisma }
