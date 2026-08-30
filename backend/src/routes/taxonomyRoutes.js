const express = require('express')
const { publicCategories, publicConditions } = require('../controllers/taxonomyController')

const router = express.Router()

router.get('/categories', publicCategories)
router.get('/conditions', publicConditions)

module.exports = router
