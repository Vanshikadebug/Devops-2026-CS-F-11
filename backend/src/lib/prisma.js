const { PrismaClient } = require('@prisma/client')
const config = require('../config/env')

// Single client, single pool. A second `new PrismaClient()` opens a second
// pool that nothing closes.
const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  log: ['warn', 'error'],
})

async function testPrismaConnection() {
  await prisma.$queryRaw`SELECT 1`
  return true
}

async function disconnectPrisma() {
  await prisma.$disconnect()
}

module.exports = { prisma, testPrismaConnection, disconnectPrisma }
