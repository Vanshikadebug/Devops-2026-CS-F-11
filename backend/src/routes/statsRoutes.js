const express = require('express')
const { getPublicStats } = require('../models/statsModel')
const asyncHandler = require('../utils/asyncHandler')

const router = express.Router()

// Public: community totals and distributions for the home page charts.
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: await getPublicStats() })
}))

module.exports = router
