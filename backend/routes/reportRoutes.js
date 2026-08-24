/**
 * routes/reportRoutes.js -- the URL map for /api/reports.
 *
 * Mounted in app.js as:
 *     app.use('/api/reports', reportRoutes)
 *
 * One route today: filing a report. It is behind `protect` -- anonymous
 * reports are not accepted, both so the per-reporter UNIQUE key means
 * something and so a moderator can see who raised a complaint. READING
 * and RESOLVING reports is staff work and lives on the admin side,
 * /api/admin/reports (adminController + adminRoutes).
 *
 * Order mirrors requestRoutes: rules -> validate -> controller, so a
 * malformed body is a 400 before the controller ever runs.
 */

const express = require('express')
const { createReport } = require('../controllers/reportController')
const { createRules } = require('../validators/reportValidators')
const validate = require('../middleware/validate')
const protect = require('../middleware/protect')

const router = express.Router()

router.post('/', protect, createRules, validate, createReport)

module.exports = router
