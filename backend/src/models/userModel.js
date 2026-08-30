const bcrypt = require('bcryptjs')
const { prisma } = require('../lib/prisma')
const { clampLimitOffset } = require('../utils/pagination')
const { formatDates } = require('../utils/sqlDateTime')
const escapeLike = require('../utils/escapeLike')
const config = require('../config/env')

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  mobile: true,
  created_at: true,
  role: true,
  status: true,
  college_id: true,
  college: {
    select: {
      short_name: true,
      area: { select: { name: true, city: { select: { name: true } } } },
    },
  },
}

const ADMIN_SELECT = {
  ...SAFE_SELECT,
  last_login_at: true,
  _count: { select: { items: true } },
}

const ROLES = ['user', 'moderator', 'admin', 'super_admin']
const STATUSES = ['active', 'blocked']

const DATE_FIELDS = ['created_at', 'last_login_at']

function mapUser(row) {
  if (!row) return null
  const { college, _count, ...rest } = row

  const out = {
    ...rest,
    college_name: college?.short_name ?? null,
    area_name: college?.area?.name ?? null,
    city_name: college?.area?.city?.name ?? null,
  }
  if (_count) out.item_count = _count.items

  return formatDates(out, DATE_FIELDS)
}

async function create({ name, email, mobile, password }) {
  const hash = await bcrypt.hash(password, config.bcryptSaltRounds)

  const created = await prisma.user.create({
    data: { name, email, mobile, password: hash },
    select: { id: true },
  })

  // Re-read through the safe query rather than assembling an object by
  // hand, which is where a stray `password` field would sneak in.
  return findById(created.id)
}

/** One user by id, without the password. Used by protect middleware. */
async function findById(id) {
  return mapUser(await prisma.user.findUnique({ where: { id }, select: SAFE_SELECT }))
}

/** One user by email, without the password. */
async function findByEmail(email) {
  return mapUser(await prisma.user.findUnique({ where: { email }, select: SAFE_SELECT }))
}

async function findByEmailWithPassword(email) {
  return mapUser(
    await prisma.user.findUnique({
      where: { email },
      select: { ...SAFE_SELECT, password: true },
    }),
  )
}

async function updateCollege(userId, collegeId) {
  await prisma.user.updateMany({
    where: { id: userId },
    data: { college_id: collegeId },
  })
  return findById(userId)
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

async function touchLastLogin(id) {
  await prisma.$executeRaw`UPDATE users SET last_login_at = NOW() WHERE id = ${id}`
}

const USER_SORTS = {
  newest: [{ created_at: 'desc' }, { id: 'desc' }],
  oldest: [{ created_at: 'asc' }, { id: 'asc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
  items: [{ items: { _count: 'desc' } }, { id: 'asc' }],
  active: [{ last_login_at: { sort: 'desc', nulls: 'last' } }],
}

/** The shared filter for listForAdmin and its count. */
function buildUserWhere(filters) {
  const where = {}

  if (filters.role) where.role = filters.role
  if (filters.status) where.status = filters.status
  if (filters.collegeId) where.college_id = filters.collegeId
  if (filters.search) {
    const term = `%${escapeLike(filters.search)}%`
    where.OR = [
      { name: { contains: term } },
      { email: { contains: term } },
      { mobile: { contains: term } },
    ]
  }

  return where
}

async function listForAdmin({ page, limit, offset }, filters = {}) {
  const where = buildUserWhere(filters)
  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: ADMIN_SELECT,
      orderBy: USER_SORTS[filters.sort] || USER_SORTS.newest,
      take: safeLimit,
      skip: safeOffset,
    }),
    prisma.user.count({ where }),
  ])

  return { rows: rows.map(mapUser), total: Number(total), page, limit: safeLimit }
}

async function findByIdForAdmin(id) {
  const row = await prisma.user.findUnique({ where: { id }, select: ADMIN_SELECT })
  if (!row) return null

  const [available_count, pending_count, requests_sent, requests_received] = await Promise.all([
    prisma.item.count({ where: { user_id: id, status: 'Available' } }),
    prisma.item.count({ where: { user_id: id, moderation_status: 'Pending' } }),
    prisma.request.count({ where: { requester_id: id } }),
    prisma.request.count({ where: { item: { user_id: id } } }),
  ])

  return {
    ...mapUser(row),
    available_count,
    pending_count,
    requests_sent,
    requests_received,
  }
}

async function setRole(id, role) {
  if (!ROLES.includes(role)) {
    throw new Error(`userModel.setRole: "${role}" is not one of ${ROLES.join(', ')}`)
  }
  const { count } = await prisma.user.updateMany({ where: { id }, data: { role } })
  return count > 0 ? findByIdForAdmin(id) : null
}

async function setStatus(id, status) {
  if (!STATUSES.includes(status)) {
    throw new Error(`userModel.setStatus: "${status}" is not one of ${STATUSES.join(', ')}`)
  }
  const { count } = await prisma.user.updateMany({ where: { id }, data: { status } })
  return count > 0 ? findByIdForAdmin(id) : null
}

async function remove(id) {
  const { count } = await prisma.user.deleteMany({ where: { id } })
  return count > 0
}

async function roleAndStatusCounts() {
  const [byRole, byStatus] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  const roles = Object.fromEntries(ROLES.map((r) => [r, 0]))
  for (const row of byRole) roles[row.role] = row._count._all

  const statuses = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const row of byStatus) statuses[row.status] = row._count._all

  return { roles, statuses }
}

module.exports = {
  create,
  findById,
  findByEmail,
  findByEmailWithPassword,
  verifyPassword,
  updateCollege,
  touchLastLogin,
  // admin
  listForAdmin,
  findByIdForAdmin,
  setRole,
  setStatus,
  remove,
  roleAndStatusCounts,
  ROLES,
  STATUSES,
}
