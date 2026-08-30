const express = require('express')
const { getConfig } = require('../controllers/configController')

const router = express.Router()

// Public: the frontend fetches this once on boot and renders everything from
// it -- settings, theme, categories, conditions, nav, social, cities.
router.get('/', getConfig)

module.exports = router
