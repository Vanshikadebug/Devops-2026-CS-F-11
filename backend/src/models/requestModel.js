const { prisma } = require('../lib/prisma')
const { formatDates } = require('../utils/sqlDateTime')

const STATUSES = ['Pending', 'Accepted', 'Rejected']
const DECIDABLE = ['Accepted', 'Rejected']

const REQUEST_SELECT = {
  id: true,
  item_id: true,
  requester_id: true,
  message: true,
  status: true,
  created_at: true,
  updated_at: true,
  item: {
    select: {
      user_id: true,
      name: true,
      status: true,
      image_url: true,
      category: true,
      location: true,
      moderation_status: true,
      owner: { select: { name: true, email: true, mobile: true, status: true } },
    },
  },
  requester: { select: { name: true, email: true, mobile: true } },
}

const DATE_FIELDS = ['created_at', 'updated_at']

/** Flattens the nested item/owner/requester relations to the API shape. */
function mapRequest(row) {
  if (!row) return null
  const { item, requester, ...rest } = row
  return formatDates(
    {
      ...rest,
      owner_id: item.user_id,
      item_name: item.name,
      item_status: item.status,
      item_image_url: item.image_url,
      item_category: item.category,
      item_location: item.location,
      item_moderation_status: item.moderation_status,
      owner_name: item.owner.name,
      owner_email: item.owner.email,
      owner_mobile: item.owner.mobile,
      owner_status: item.owner.status,
      requester_name: requester.name,
      requester_email: requester.email,
      requester_mobile: requester.mobile,
    },
    DATE_FIELDS,
  )
}

async function findById(id) {
  return mapRequest(await prisma.request.findUnique({ where: { id }, select: REQUEST_SELECT }))
}

/** Requests THIS user has made, newest first. `itemId` narrows to one listing. */
async function findSent(requesterId, { itemId } = {}) {
  const where = { requester_id: requesterId }
  if (itemId) where.item_id = itemId

  const rows = await prisma.request.findMany({
    where,
    select: REQUEST_SELECT,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  })
  return rows.map(mapRequest)
}

/** Requests OTHER people have made on THIS user's items. */
async function findReceived(ownerId) {
  const rows = await prisma.request.findMany({
    where: { item: { user_id: ownerId } },
    select: REQUEST_SELECT,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  })
  return rows.map(mapRequest)
}

async function findByItemAndRequester(itemId, requesterId) {
  return mapRequest(
    await prisma.request.findUnique({
      where: { item_id_requester_id: { item_id: itemId, requester_id: requesterId } },
      select: REQUEST_SELECT,
    }),
  )
}

/** Inserts a Pending request. A duplicate pair is P2002; the controller maps it to 409. */
async function create({ itemId, requesterId, message = null }) {
  const created = await prisma.request.create({
    data: { item_id: itemId, requester_id: requesterId, message, status: 'Pending' },
    select: { id: true },
  })
  return findById(created.id)
}

async function reopen(id, message = null) {
  const { count } = await prisma.request.updateMany({
    where: { id, status: 'Rejected' },
    data: { status: 'Pending', message },
  })
  return count > 0 ? findById(id) : null
}

/* MySQL types the locked-read columns as BIGINT under $queryRaw, so
   owner_id arrives as a BigInt and `1n !== 1` is TRUE -- an unconverted
   compare would reject the legitimate owner. Number() before comparing. */
async function lockRow(tx, id) {
  const rows = await tx.$queryRaw`
    SELECT r.id, r.status, r.item_id, i.user_id AS owner_id, i.status AS item_status
      FROM requests r JOIN items i ON i.id = r.item_id
     WHERE r.id = ${id}
     FOR UPDATE`
  const row = rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    status: row.status,
    item_id: Number(row.item_id),
    owner_id: Number(row.owner_id),
    item_status: row.item_status,
  }
}

async function accept(id, ownerId) {
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockRow(tx, id)
    if (!row) return { ok: false, reason: 'not_found' }
    if (row.owner_id !== ownerId) return { ok: false, reason: 'not_owner' }
    if (row.status !== 'Pending') return { ok: false, reason: 'not_pending' }
    if (row.item_status !== 'Available') return { ok: false, reason: 'not_available' }

    await tx.request.update({ where: { id }, data: { status: 'Accepted' } })
    await tx.request.updateMany({
      where: { item_id: row.item_id, id: { not: id }, status: 'Pending' },
      data: { status: 'Rejected' },
    })
    await tx.item.update({ where: { id: row.item_id }, data: { status: 'Reserved' } })
    return { ok: true }
  })

  return result.ok ? { ok: true, data: await findById(id) } : result
}

/** Owner rejects one pending request. The item is left alone. */
async function reject(id, ownerId) {
  const result = await prisma.$transaction(async (tx) => {
    const row = await lockRow(tx, id)
    if (!row) return { ok: false, reason: 'not_found' }
    if (row.owner_id !== ownerId) return { ok: false, reason: 'not_owner' }
    if (row.status !== 'Pending') return { ok: false, reason: 'not_pending' }

    await tx.request.update({ where: { id }, data: { status: 'Rejected' } })
    return { ok: true }
  })

  return result.ok ? { ok: true, data: await findById(id) } : result
}

module.exports = {
  findById,
  findSent,
  findReceived,
  findByItemAndRequester,
  create,
  reopen,
  accept,
  reject,
  STATUSES,
  DECIDABLE,
}
