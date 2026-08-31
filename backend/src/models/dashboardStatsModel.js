const { prisma } = require('../lib/prisma')
const cache = require('../lib/cache')

/* Aggregates for the admin dashboard.

   Everything here is read-only and a little expensive (several grouped counts
   plus a date-bucketed series), so the whole payload is cached briefly rather
   than each piece separately -- the dashboard is one screen and wants one
   consistent snapshot, not six that disagree by a few seconds. */

const DASHBOARD_TTL = 30

/** Start of day, `daysAgo` days back, in server-local time. */
function dayStart(daysAgo = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d
}

const asNumber = (v) => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0))

/**
 * Counts for a window and the window before it, so the dashboard can show a
 * direction of travel instead of a bare number. A percentage needs a baseline,
 * and "new this week" without "last week" is not information.
 */
async function windowCounts(model, days) {
  const now = new Date()
  const start = dayStart(days - 1)
  const prevStart = dayStart(days * 2 - 1)

  const [current, previous] = await Promise.all([
    prisma[model].count({ where: { created_at: { gte: start, lte: now } } }),
    prisma[model].count({ where: { created_at: { gte: prevStart, lt: start } } }),
  ])

  return { current, previous, delta: current - previous }
}

/** One row per day for the last `days` days, zero-filled. */
async function dailySeries(days) {
  const since = dayStart(days - 1)

  const [items, users] = await Promise.all([
    prisma.$queryRaw`
      SELECT DATE(created_at) AS day, COUNT(*) AS n
        FROM items WHERE created_at >= ${since}
       GROUP BY DATE(created_at)`,
    prisma.$queryRaw`
      SELECT DATE(created_at) AS day, COUNT(*) AS n
        FROM users WHERE created_at >= ${since}
       GROUP BY DATE(created_at)`,
  ])

  const key = (d) => new Date(d).toISOString().slice(0, 10)
  const itemsBy = new Map(items.map((r) => [key(r.day), asNumber(r.n)]))
  const usersBy = new Map(users.map((r) => [key(r.day), asNumber(r.n)]))

  // Built forwards from the window start so a day with no rows is a 0 rather
  // than a gap -- a chart that silently skips empty days misreports the trend.
  const out = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = dayStart(i)
    const k = key(d)
    out.push({ day: k, items: itemsBy.get(k) ?? 0, users: usersBy.get(k) ?? 0 })
  }
  return out
}

async function build() {
  const [
    totalItems, availableItems, pendingItems, hiddenItems,
    totalUsers, blockedUsers, staffUsers,
    totalRequests, pendingRequests, acceptedRequests,
    openReports, cities, colleges, categories,
    itemWindow, userWindow, requestWindow,
    series, byCategory, byCollege, recentItems, recentUsers, recentAudit,
  ] = await Promise.all([
    prisma.item.count(),
    prisma.item.count({ where: { status: 'Available', moderation_status: 'Approved' } }),
    prisma.item.count({ where: { moderation_status: 'Pending' } }),
    prisma.item.count({ where: { moderation_status: { in: ['Hidden', 'Rejected'] } } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: 'blocked' } }),
    prisma.user.count({ where: { role: { in: ['moderator', 'admin', 'super_admin'] } } }),
    prisma.request.count(),
    prisma.request.count({ where: { status: 'Pending' } }),
    prisma.request.count({ where: { status: 'Accepted' } }),
    // Under_Review, not 'Under Review': the schema maps the enum member to a
    // spaced string in MySQL, but the Prisma client speaks the member name.
    prisma.report.count({ where: { status: { in: ['Open', 'Under_Review'] } } }),
    prisma.city.count(),
    prisma.college.count(),
    prisma.category.count({ where: { is_active: true } }),

    windowCounts('item', 7),
    windowCounts('user', 7),
    windowCounts('request', 7),

    dailySeries(14),

    prisma.item.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { _count: { category: 'desc' } }, take: 8 }),

    prisma.$queryRaw`
      SELECT c.short_name AS name, COUNT(i.id) AS n
        FROM colleges c LEFT JOIN items i ON i.college_id = c.id
       GROUP BY c.id ORDER BY n DESC LIMIT 5`,

    prisma.item.findMany({
      select: {
        id: true, name: true, category: true, status: true, moderation_status: true,
        created_at: true, owner: { select: { name: true } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 6,
    }),

    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, created_at: true, college: { select: { short_name: true } } },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 6,
    }),

    prisma.auditLog.findMany({
      select: { id: true, action: true, target_type: true, description: true, admin_email: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 8,
    }),
  ])

  return {
    totals: {
      items: totalItems,
      available: availableItems,
      pending: pendingItems,
      hidden: hiddenItems,
      users: totalUsers,
      blocked: blockedUsers,
      staff: staffUsers,
      requests: totalRequests,
      pendingRequests,
      acceptedRequests,
      openReports,
      cities,
      colleges,
      categories,
    },
    trend: { items: itemWindow, users: userWindow, requests: requestWindow },
    series,
    byCategory: byCategory.map((r) => ({ label: r.category, count: r._count._all })),
    byCollege: byCollege.map((r) => ({ label: r.name, count: asNumber(r.n) })),
    recent: {
      items: recentItems.map(({ owner, ...i }) => ({ ...i, owner_name: owner?.name ?? null })),
      users: recentUsers.map(({ college, ...u }) => ({ ...u, college_name: college?.short_name ?? null })),
      audit: recentAudit,
    },
  }
}

/** The dashboard payload, cached for DASHBOARD_TTL seconds. */
async function dashboard() {
  return cache.wrap('admin:dashboard', DASHBOARD_TTL, build)
}

module.exports = { dashboard }
