const { prisma } = require('../lib/prisma')

function tally(groups) {
  const counts = {}
  let total = 0
  for (const g of groups) {
    const n = g._count._all
    counts[g.status] = n
    total += n
  }
  return { counts, total }
}

/** How many items this user has listed, broken down by status. */
async function itemCounts(userId) {
  const { counts, total } = tally(
    await prisma.item.groupBy({
      by: ['status'],
      where: { user_id: userId },
      _count: { _all: true },
    }),
  )

  return {
    total,
    available: counts.Available ?? 0,
    reserved: counts.Reserved ?? 0,
    unavailable: counts.Unavailable ?? 0,
  }
}

async function requestsReceived(userId) {
  const { counts, total } = tally(
    await prisma.request.groupBy({
      by: ['status'],
      where: { item: { user_id: userId } },
      _count: { _all: true },
    }),
  )

  return { total, pending: counts.Pending ?? 0 }
}

async function requestsSent(userId) {
  const { counts, total } = tally(
    await prisma.request.groupBy({
      by: ['status'],
      where: { requester_id: userId },
      _count: { _all: true },
    }),
  )

  return {
    total,
    pending: counts.Pending ?? 0,
    accepted: counts.Accepted ?? 0,
  }
}

async function getUserStats(userId) {
  const [items, received, sent] = await Promise.all([
    itemCounts(userId),
    requestsReceived(userId),
    requestsSent(userId),
  ])

  return { items, requestsReceived: received, requestsSent: sent }
}

module.exports = { getUserStats }
