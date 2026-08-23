/**
 * controllers/reportController.js -- lets a logged-in user file a report
 * against a listing or another account.
 *
 * This is the ONLY writer of the `reports` table; everything else in the
 * app reads it -- the moderation queue in adminController. Until this
 * route existed the queue was structurally empty, because reportModel
 * .create had no caller (the adminReports tests had to INSERT rows by
 * hand to have anything to review).
 *
 * As everywhere in this codebase, the reporter is req.user.id from
 * protect.js -- never a body field. A body-supplied reporter would let
 * anyone file complaints in someone else's name: both a harassment
 * vector and a way to burn a victim through the per-reporter UNIQUE key
 * that otherwise stops one person reporting the same thing twice.
 */

const itemModel = require('../models/itemModel')
const userModel = require('../models/userModel')
const reportModel = require('../models/reportModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/**
 * The subset of a report a REPORTER is allowed to see back. The model's
 * findById returns the full moderation row -- reviewer names, the
 * reported party's email, internal resolution notes. None of that
 * belongs to the person who merely filed the complaint, so we echo only
 * what confirms WHAT they filed: their own reporter_id, the target, the
 * reason, and the freshly-set 'Open' status. Target NAMES travel (so a
 * client can say "your report about X"); target emails never do.
 */
function shapeReport(row) {
  if (!row) return row
  return {
    id: row.id,
    reporter_id: row.reporter_id,
    reported_item_id: row.reported_item_id,
    reported_user_id: row.reported_user_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    created_at: row.created_at,
    item_name: row.item_name ?? null,
    reported_user_name: row.reported_user_name ?? null,
  }
}

/** '' / whitespace -> null, so the column stores NULL, not an empty string. */
function emptyToNull(value) {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * POST /api/reports
 *
 * Body: { reason, details?, itemId? , userId? } -- exactly one of
 * itemId / userId, guaranteed by reportValidators. The reporter is the
 * token, so a `reporterId` in the body is ignored.
 */
const createReport = asyncHandler(async (req, res) => {
  const reporterId = req.user.id
  const { reason } = req.body
  const details = emptyToNull(req.body.details)
  /* `|| null`, not `?? null`. The validator treats every FALSY id as
     absent (`.optional({ values: 'falsy' })`), so a body filing a USER
     report may still carry itemId: '' (an empty form field), and '' is
     NOT caught by ?? -- it would slip through as a truthy-to-`!== null`
     value and wrongly send us down the item branch, 404-ing a valid user
     report. `|| null` collapses '', 0 and undefined alike to null, which
     is exactly the "absent" the validator already guaranteed for one of
     the two. A real id is a positive number, so it is never nulled here. */
  const itemId = req.body.itemId || null
  const userId = req.body.userId || null

  /* Confirm the target exists and is not the caller themselves. The
     validator guarantees exactly one of itemId / userId is set, so this
     if / else is exhaustive. */
  if (itemId !== null) {
    const item = await itemModel.findById(itemId)
    if (!item) {
      throw ApiError.notFound(`No item found with id ${itemId}`)
    }
    if (item.user_id === reporterId) {
      // Reporting your own listing is never a moderation signal -- edit
      // or delete it instead. (reportModel.remove is there for an admin
      // clearing exactly this sort of accidental self-report.)
      throw ApiError.forbidden('You cannot report your own listing')
    }
  } else {
    // Cheap identity check before the lookup: reporting yourself is
    // refused whether or not the row is fetched.
    if (userId === reporterId) {
      throw ApiError.forbidden('You cannot report yourself')
    }
    const target = await userModel.findById(userId)
    if (!target) {
      throw ApiError.notFound(`No user found with id ${userId}`)
    }
  }

  /* create() re-validates the reason and the one-target rule; the
     database's UNIQUE keys turn a second identical report from the same
     person into ER_DUP_ENTRY. That is the honest answer to "report this
     again": you already did. */
  try {
    const id = await reportModel.create({ reporterId, itemId, userId, reason, details })
    const created = await reportModel.findById(id)

    res.status(201).json({
      success: true,
      message: 'Report submitted',
      data: shapeReport(created),
    })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('You have already reported this')
    }
    throw err
  }
})

module.exports = { createReport, shapeReport }
