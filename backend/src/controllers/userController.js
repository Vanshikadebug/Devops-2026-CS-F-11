const userModel = require('../models/userModel')
const locationModel = require('../models/locationModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

const updateMyCollege = asyncHandler(async (req, res) => {
  const raw = req.body.collegeId

  if (raw === null) {
    const user = await userModel.updateCollege(req.user.id, null)
    return res.status(200).json({
      success: true,
      message: 'College cleared',
      // The updated user under data.user -- the same envelope auth and
      // every other endpoint use (see api.js on the frontend).
      data: { user },
    })
  }

  const collegeId = Number(raw)

  if (raw === undefined || !Number.isInteger(collegeId) || collegeId <= 0) {
    throw ApiError.badRequest(
      'collegeId must be a positive whole number, or null to clear it',
    )
  }

  const college = await locationModel.findCollegeById(collegeId)

  if (!college) {
    throw ApiError.notFound(`No college found with id ${collegeId}`)
  }

  const user = await userModel.updateCollege(req.user.id, collegeId)

  res.status(200).json({
    success: true,
    message: `College set to ${college.short_name}`,
    data: { user },
  })
})

module.exports = { updateMyCollege }
