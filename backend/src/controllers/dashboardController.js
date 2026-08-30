const statsModel = require('../models/statsModel')
const itemModel = require('../models/itemModel')
const asyncHandler = require('../utils/asyncHandler')

const RECENT_ITEMS = 3

const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id

  const [stats, recentItems] = await Promise.all([
    statsModel.getUserStats(userId),
    itemModel.findByUser(userId, { limit: RECENT_ITEMS }),
  ])

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
      stats,
      recentItems,
    },
  })
})

module.exports = { getDashboard }
