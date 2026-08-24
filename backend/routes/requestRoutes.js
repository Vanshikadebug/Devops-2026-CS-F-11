/**
 * routes/requestRoutes.js -- the URL map for /api/requests.
 *
 * Mounted in app.js as:
 *     app.use('/api/requests', requestRoutes)
 *
 * Every route is behind `protect`. /sent and /received MUST be
 * registered before /:id, or Express would treat "sent" as an id.
 */

const express = require('express')
const {
  createRequest,
  getSent,
  getReceived,
  updateRequestStatus,
} = require('../controllers/requestController')
const { createRules, statusRules } = require('../validators/requestValidators')
const validate = require('../middleware/validate')
const protect = require('../middleware/protect')

const router = express.Router()

router.post('/', protect, createRules, validate, createRequest)

router.get('/sent', protect, getSent)
router.get('/received', protect, getReceived)

router.patch('/:id', protect, statusRules, validate, updateRequestStatus)

module.exports = router
