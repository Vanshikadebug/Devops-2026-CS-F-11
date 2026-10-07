const { PrismaClient } = require('@prisma/client')
const config = require('../config/env')

// Single client, single pool. A second `new PrismaClient()` opens a second
// pool that nothing closes.
const base = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  log: ['warn', 'error'],
})

/* MongoDB has no AUTO_INCREMENT. Every model except PlatformSetting (keyed by
   setting_key) keeps a numeric id so URLs, validators and the frontend stay
   unchanged; ids come from one atomic $inc per model in `counters`. */
const NO_SEQUENCE = new Set(['PlatformSetting'])

async function nextIds(model, count) {
  const res = await base.$runCommandRaw({
    findAndModify: 'counters',
    query: { _id: model },
    update: { $inc: { seq: count } },
    new: true,
    upsert: true,
  })
  const raw = res.value.seq
  const end = Number(raw?.$numberLong ?? raw?.$numberInt ?? raw)
  return Array.from({ length: count }, (_, i) => end - count + 1 + i)
}

const prisma = base.$extends({
  query: {
    $allModels: {
      async create({ model, args, query }) {
        if (!NO_SEQUENCE.has(model) && args.data.id == null) {
          ;[args.data.id] = await nextIds(model, 1)
        }
        return query(args)
      },
      async createMany({ model, args, query }) {
        const rows = Array.isArray(args.data) ? args.data : [args.data]
        const missing = NO_SEQUENCE.has(model) ? [] : rows.filter((r) => r.id == null)
        if (missing.length) {
          const ids = await nextIds(model, missing.length)
          missing.forEach((row, i) => { row.id = ids[i] })
        }
        return query(args)
      },
      async upsert({ model, args, query }) {
        // Allocated even when the upsert ends up updating -- a gap in the
        // sequence is harmless, a duplicate _id is not.
        if (!NO_SEQUENCE.has(model) && args.create.id == null) {
          ;[args.create.id] = await nextIds(model, 1)
        }
        return query(args)
      },
    },
  },
})

async function testPrismaConnection() {
  await base.$runCommandRaw({ ping: 1 })
  return true
}

async function disconnectPrisma() {
  await base.$disconnect()
}

module.exports = { prisma, testPrismaConnection, disconnectPrisma }
