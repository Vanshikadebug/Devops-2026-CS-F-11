/**
 * controllers/adminController.js -- the admin panel's first surface:
 * an at-a-glance overview, and the account-management actions.
 *
 * WHERE THE SECURITY ACTUALLY LIVES
 * Not here. Every function below assumes the caller has already cleared
 * protect (a valid, non-blocked login) and the right authorize guard
 * (requireStaff / requireAdmin / requireSuperAdmin) in adminRoutes.js.
 * This file holds the decisions those guards CANNOT make -- the ones
 * that depend on WHO the target is relative to the caller, which a
 * route-level "is at least an admin" check knows nothing about:
 *
 *   - you cannot act on your own account from the panel
 *   - you cannot act on a peer or a superior
 *   - you cannot grant a role above your own
 *
 * WHY EVERY MUTATION WRITES AN AUDIT ROW
 * Blocking an account and changing a role are exactly the actions that,
 * three months from now, someone will need to explain. auditModel.record
 * is awaited AFTER the change commits (see the note in that file on why
 * it truncates rather than throws): the row is not optional bookkeeping,
 * it is the point of having an admin panel instead of a MySQL prompt.
 */

const userModel = require('../models/userModel')
const itemModel = require('../models/itemModel')
const reportModel = require('../models/reportModel')
const auditModel = require('../models/auditModel')
const { atLeast, RANK } = require('../middleware/authorize')
const { resolvePagination, paginationMeta } = require('../utils/pagination')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/**
 * GET /api/admin/overview  (requireStaff)
 *
 * The dashboard's numbers: how accounts, listings and reports break
 * down. Three GROUP BY snapshots, run in parallel because none depends
 * on the others.
 *
 * >>> WHY A MODERATOR MAY SEE THIS, THOUGH THEY MAY NOT MANAGE ACCOUNTS <<<
 * These are AGGREGATE COUNTS -- "3 admins, 40 users, 2 blocked" -- with
 * no name, email or id among them. Seeing that the queue has 5 pending
 * items is a moderator's job; being able to BLOCK one of those 40 users
 * is not, and that power stays on the requireAdmin routes below. Showing
 * the counts to staff while gating the actions is the same split the
 * whole app runs on: what you SEE is a convenience, what you can DO is
 * enforced separately (see authorize.js).
 */
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

/**
 * GET /api/admin/users  (requireAdmin)
 *
 * One filtered, paginated page of accounts.
 *
 * The filters (search / role / status / sort / collegeId) are passed
 * straight to the model, which treats an unknown value leniently -- an
 * unrecognised ?sort= falls back to newest rather than erroring, so a
 * stale bookmark shows a page instead of a 500. The one value that
 * reaches SQL by interpolation, the page size, is clamped to a safe
 * integer inside the model regardless of what arrives here.
 *
 * resolvePagination, not parsePagination: the admin's `default_page_size`
 * setting is meant to decide how many rows a page holds when the request
 * does not say. This is the reader that makes that setting real -- until
 * an admin list called it, it was a switch that changed nothing.
 */
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
    // count is the length of THIS page; pagination.total is the size of
    // the whole filtered set. The frontend needs both -- one to render
    // the rows, the other to draw the pager -- and conflating them is
    // how "Showing 20 of 20" ends up above a table that has 8 more pages.
    count: result.rows.length,
    data: result.rows,
    pagination: paginationMeta({ page: result.page, limit: result.limit }, result.total),
  })
})

/**
 * GET /api/admin/users/:id  (requireAdmin)
 *
 * One account in full, with the activity counts findByIdForAdmin adds
 * (listings owned, requests sent and received). Still no password: that
 * column is never selected, here least of all.
 */
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

/**
 * Shared front half of both mutations: turn :id into a real account this
 * caller is actually permitted to act on, or throw the right error.
 *
 * The order of the checks is deliberate. NOT FOUND is decided before the
 * permission checks, so an admin acting on a deleted id is told it is
 * gone rather than that they lack permission over a row that does not
 * exist -- a 403 there would be a small lie, and a confusing one.
 */
async function loadTargetForAction(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('User id must be a positive whole number')
  }

  const target = await userModel.findByIdForAdmin(id)
  if (!target) {
    throw ApiError.notFound(`No user found with id ${id}`)
  }

  /* You cannot act on your own account from the panel. Self-service --
     changing your own email, deleting your own account -- is a different
     surface with its own route; an admin blocking or demoting THEMSELVES
     is almost always a slip, and for the last super_admin it is
     unrecoverable through the API. 422, not 403: the request is
     understood perfectly and refused on its consequence, which is the
     exact distinction ApiError.unprocessable documents. */
  if (target.id === req.user.id) {
    throw ApiError.unprocessable('You cannot change your own account from the admin panel')
  }

  /* You cannot act on a peer or a superior. atLeast(target, caller) is
     true when the target is at OR above the caller's rank, so an admin
     may act on users and moderators but not on another admin or a
     super_admin, and a super_admin may act on everyone below but not on
     another super_admin. This is what stops a lateral takeover (one
     admin blocking another) and an upward grab; scripts/create-admin.js
     is the deliberate, out-of-band escape hatch for the rare case that
     genuinely needs one. 403: an authorisation boundary, not a
     consequence. */
  if (atLeast(target.role, req.user.role)) {
    throw ApiError.forbidden('You cannot act on an account at or above your own role')
  }

  return target
}

/**
 * PATCH /api/admin/users/:id/status  (requireAdmin)
 *
 * Block or unblock an account. Blocking is reversible and leaves every
 * listing and request intact, which is why it -- not deletion -- is the
 * default answer to "this person is misbehaving" (see userModel.setStatus).
 * The effect is immediate: protect.js re-reads status on every request,
 * so a blocked user's very next call is refused even though their token
 * is still cryptographically valid.
 */
const setUserStatus = asyncHandler(async (req, res) => {
  const target = await loadTargetForAction(req)
  const status = req.body.status // validated to be one of userModel.STATUSES

  /* Already in the requested state: answer 200 with the row and write
     NOTHING to the audit log. This is not just tidiness -- setStatus
     returns null when the UPDATE changes no row (MySQL reports zero
     affected rows for a no-op write), and without this branch that null
     would surface below as a spurious 404 for an account that plainly
     exists. Handling the no-op here is what keeps re-blocking a blocked
     user honest. */
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

/**
 * PATCH /api/admin/users/:id/role  (requireSuperAdmin)
 *
 * Grant or revoke a role. This is the one super_admin-only action,
 * because it is the power that confers every other power (an admin who
 * could promote could make themselves super_admin, and the ladder would
 * collapse -- see authorize.js). The rank and self guards in
 * loadTargetForAction already forbid touching a peer super_admin or
 * yourself; the extra check below forbids granting UPWARD.
 */
const setUserRole = asyncHandler(async (req, res) => {
  const target = await loadTargetForAction(req)
  const role = req.body.role // validated to be one of userModel.ROLES

  /* You cannot grant a role more powerful than your own. Today this can
     never fire -- only a super_admin reaches this handler, and
     super_admin is the top of RANK -- but leaving it out would make the
     handler quietly wrong the moment the route's minimum is lowered.
     The guard states the rule the endpoint depends on rather than
     relying on the route table to stay exactly as it is now. */
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

module.exports = {
  getOverview,
  listUsers,
  getUser,
  setUserStatus,
  setUserRole,
}
