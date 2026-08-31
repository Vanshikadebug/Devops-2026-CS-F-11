const userModel = require('../models/userModel')
const itemModel = require('../models/itemModel')
const reportModel = require('../models/reportModel')
const auditModel = require('../models/auditModel')
const dashboardStatsModel = require('../models/dashboardStatsModel')
const { atLeast, RANK } = require('../middleware/authorize')
const { resolvePagination, paginationMeta } = require('../utils/pagination')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/** Everything the admin dashboard renders, in one snapshot. */
const getDashboard = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: await dashboardStatsModel.dashboard() })
})

const getOverview = asyncHandler(async (req, res) => {
  const [users, items, reports] = await Promise.all([
    userModel.roleAndStatusCounts(),
    itemModel.moderationCounts(),
    reportModel.statusCounts(),
  ])

  res.status(200).json({
    success: true,
    data: { users, items, reports },
  })
})

const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = await resolvePagination(req.query)

  const filters = {
    search: req.query.search,
    role: req.query.role,
    status: req.query.status,
    sort: req.query.sort,
    collegeId: req.query.collegeId,
  }

  const result = await userModel.listForAdmin({ page, limit, offset }, filters)

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
    pagination: paginationMeta({ page: result.page, limit: result.limit }, result.total),
  })
})

const getUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('User id must be a positive whole number')
  }

  const user = await userModel.findByIdForAdmin(id)
  if (!user) {
    throw ApiError.notFound(`No user found with id ${id}`)
  }

  res.status(200).json({ success: true, data: user })
})

async function loadTargetForAction(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('User id must be a positive whole number')
  }

  const target = await userModel.findByIdForAdmin(id)
  if (!target) {
    throw ApiError.notFound(`No user found with id ${id}`)
  }

  if (target.id === req.user.id) {
    throw ApiError.unprocessable('You cannot change your own account from the admin panel')
  }

  if (atLeast(target.role, req.user.role)) {
    throw ApiError.forbidden('You cannot act on an account at or above your own role')
  }

  return target
}

const setUserStatus = asyncHandler(async (req, res) => {
  const target = await loadTargetForAction(req)
  const status = req.body.status // validated to be one of userModel.STATUSES

  if (target.status === status) {
    return res.status(200).json({
      success: true,
      message: `User is already ${status}`,
      data: target,
    })
  }

  const updated = await userModel.setStatus(target.id, status)
  if (!updated) {
    // The row was deleted between the load and the write -- a genuine
    // race, not the no-op case handled above.
    throw ApiError.notFound(`No user found with id ${target.id}`)
  }

  const verb = status === 'blocked' ? 'blocked' : 'unblocked'
  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'user.status_change',
    targetType: 'user',
    targetId: target.id,
    description: `${verb === 'blocked' ? 'Blocked' : 'Unblocked'} ${target.email}`,
    changes: { status: { from: target.status, to: status } },
    ip: req.ip,
  })

  res.status(200).json({
    success: true,
    message: `User ${verb}`,
    data: updated,
  })
})

const setUserRole = asyncHandler(async (req, res) => {
  const target = await loadTargetForAction(req)
  const role = req.body.role // validated to be one of userModel.ROLES

  if (RANK[role] > RANK[req.user.role]) {
    throw ApiError.forbidden('You cannot grant a role above your own')
  }

  // Same no-op reasoning as setUserStatus: no change, no audit row, and
  // no false 404 from setRole's zero-affected-rows return.
  if (target.role === role) {
    return res.status(200).json({
      success: true,
      message: `User is already ${role}`,
      data: target,
    })
  }

  const updated = await userModel.setRole(target.id, role)
  if (!updated) {
    throw ApiError.notFound(`No user found with id ${target.id}`)
  }

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'user.role_change',
    targetType: 'user',
    targetId: target.id,
    description: `Changed role of ${target.email} from ${target.role} to ${role}`,
    changes: { role: { from: target.role, to: role } },
    ip: req.ip,
  })

  res.status(200).json({
    success: true,
    message: 'Role updated',
    data: updated,
  })
})

const listItems = asyncHandler(async (req, res) => {
  const { page, limit, offset } = await resolvePagination(req.query)

  const filters = {
    moderation: req.query.moderation,
    status: req.query.status,
    category: req.query.category,
    userId: req.query.userId,
    college: req.query.college,
    search: req.query.search,
    sort: req.query.sort,
  }

  const result = await itemModel.listForAdmin({ page, limit, offset }, filters)

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
    pagination: paginationMeta({ page: result.page, limit: result.limit }, result.total),
  })
})

const getItem = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Item id must be a positive whole number')
  }

  const item = await itemModel.findByIdForAdmin(id)
  if (!item) {
    throw ApiError.notFound(`No item found with id ${id}`)
  }

  res.status(200).json({ success: true, data: item })
})

const setItemModeration = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Item id must be a positive whole number')
  }

  const item = await itemModel.findByIdForAdmin(id)
  if (!item) {
    throw ApiError.notFound(`No item found with id ${id}`)
  }

  const status = req.body.moderation_status // one of MODERATION_STATUSES
  // required-on-reject is enforced by the validator; falsy -> null so a
  // blank note on an approve/hide is stored as NULL, not ''.
  const reason = req.body.reason || null

  const updated = await itemModel.setModeration(id, {
    status,
    moderatorId: req.user.id,
    reason,
  })
  if (!updated) {
    throw ApiError.notFound(`No item found with id ${id}`)
  }

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'item.moderation_change',
    targetType: 'item',
    targetId: id,
    description: `Set "${item.name}" moderation to ${status}${reason ? ` (${reason})` : ''}`,
    changes: {
      moderation_status: { from: item.moderation_status, to: status },
      ...(reason ? { reason } : {}),
    },
    ip: req.ip,
  })

  res.status(200).json({
    success: true,
    message: `Item moderation set to ${status}`,
    data: updated,
  })
})

const listReports = asyncHandler(async (req, res) => {
  const { page, limit, offset } = await resolvePagination(req.query)

  const filters = {
    status: req.query.status,
    reason: req.query.reason,
    target: req.query.target,
    search: req.query.search,
    sort: req.query.sort,
  }

  const result = await reportModel.list({ page, limit, offset }, filters)

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
    pagination: paginationMeta({ page: result.page, limit: result.limit }, result.total),
  })
})

const getReport = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Report id must be a positive whole number')
  }

  const report = await reportModel.findById(id)
  if (!report) {
    throw ApiError.notFound(`No report found with id ${id}`)
  }

  res.status(200).json({ success: true, data: report })
})

const reviewReport = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Report id must be a positive whole number')
  }

  const report = await reportModel.findById(id)
  if (!report) {
    throw ApiError.notFound(`No report found with id ${id}`)
  }

  const status = req.body.status // one of REVIEWABLE
  // falsy -> null so a blank note is stored as NULL, not ''.
  const note = req.body.note || null

  const updated = await reportModel.review(id, {
    status,
    reviewerId: req.user.id,
    note,
  })
  if (!updated) {
    throw ApiError.notFound(`No report found with id ${id}`)
  }

  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: 'report.review',
    targetType: 'report',
    targetId: id,
    description: `Reviewed report #${id} as ${status}${note ? ` (${note})` : ''}`,
    changes: {
      status: { from: report.status, to: status },
      ...(note ? { note } : {}),
    },
    ip: req.ip,
  })

  res.status(200).json({
    success: true,
    message: `Report marked ${status}`,
    data: updated,
  })
})

const listAudit = asyncHandler(async (req, res) => {
  const { page, limit, offset } = await resolvePagination(req.query)

  const filters = {
    adminId: req.query.admin ? Number(req.query.admin) : undefined,
    action: req.query.action || undefined,
    targetType: req.query.targetType || undefined,
    search: typeof req.query.search === 'string' && req.query.search.trim()
      ? req.query.search.trim()
      : undefined,
    from: req.query.from || undefined,
    to: req.query.to || undefined,
    sort: req.query.sort || undefined,
  }

  if (filters.targetType && !auditModel.TARGET_TYPES.includes(filters.targetType)) {
    throw ApiError.badRequest(
      `targetType must be one of: ${auditModel.TARGET_TYPES.join(', ')}`,
    )
  }

  const [result, actions] = await Promise.all([
    auditModel.list({ page, limit, offset }, filters),
    auditModel.distinctActions(),
  ])

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
    actions,
    targetTypes: auditModel.TARGET_TYPES,
    pagination: paginationMeta({ page: result.page, limit: result.limit }, result.total),
  })
})

module.exports = {
  getDashboard,
  getOverview,
  listUsers,
  getUser,
  setUserStatus,
  setUserRole,
  listItems,
  getItem,
  setItemModeration,
  listReports,
  getReport,
  reviewReport,
  listAudit,
}
