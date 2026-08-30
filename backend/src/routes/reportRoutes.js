const express = require('express')
const { createReport } = require('../controllers/reportController')
const { createRules } = require('../validators/reportValidators')
const validate = require('../middleware/validate')
const protect = require('../middleware/protect')

const router = express.Router()

router.post('/', protect, createRules, validate, createReport)

module.exports = router
