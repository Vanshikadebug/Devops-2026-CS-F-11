const { prisma } = require('../lib/prisma')
const cache = require('../lib/cache')

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

/* --- Public community numbers (home page "Live index") ------------------ */

// Same visibility rule as the public item list, so the numbers match it.
const VISIBLE = { moderation_status: 'Approved', owner: { status: 'active' } }
const SERIES_DAYS = 30

function dayKey(d) {
  const x = new Date(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

async function buildPublicStats() {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (SERIES_DAYS - 1))

  const [listed, available, rehomed, members, campuses, cities, byCategory, byCollege, recent] =
    await Promise.all([
      prisma.item.count({ where: VISIBLE }),
      prisma.item.count({ where: { ...VISIBLE, status: 'Available' } }),
      prisma.request.count({ where: { status: 'Accepted' } }),
      prisma.user.count({ where: { status: 'active' } }),
      prisma.college.count(),
      prisma.city.count(),
      prisma.item.groupBy({ by: ['category'], where: VISIBLE, _count: { _all: true } }),
      prisma.item.groupBy({
        by: ['college_id'],
        where: { ...VISIBLE, college_id: { not: null } },
        _count: { _all: true },
      }),
      prisma.item.findMany({ where: { ...VISIBLE, created_at: { gte: since } }, select: { created_at: true } }),
    ])

  const colleges = await prisma.college.findMany({
    where: { id: { in: byCollege.map((r) => r.college_id) } },
    select: { id: true, short_name: true },
  })
  const collegeName = new Map(colleges.map((c) => [c.id, c.short_name]))

  const perDay = new Map()
  for (const r of recent) perDay.set(dayKey(r.created_at), (perDay.get(dayKey(r.created_at)) ?? 0) + 1)
  const daily = []
  for (let i = 0; i < SERIES_DAYS; i += 1) {
    const d = new Date(since)
    d.setDate(since.getDate() + i)
    daily.push({ day: dayKey(d), count: perDay.get(dayKey(d)) ?? 0 })
  }

  const desc = (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  return {
    totals: { listed, available, rehomed, members, campuses, cities },
    byCategory: byCategory.map((r) => ({ label: r.category, count: r._count._all })).sort(desc),
    byCampus: byCollege
      .map((r) => ({ label: collegeName.get(r.college_id) ?? 'Unknown', count: r._count._all }))
      .sort(desc)
      .slice(0, 6),
    daily,
  }
}

/** Cached briefly: it is on the home page and changes slowly. */
function getPublicStats() {
  return cache.wrap('public:stats', 60, buildPublicStats)
}

module.exports.getPublicStats = getPublicStats
