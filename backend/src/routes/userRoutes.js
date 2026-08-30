const express = require('express')
const { updateMyCollege } = require('../controllers/userController')
const protect = require('../middleware/protect')

const router = express.Router()

router.put('/me/college', protect, updateMyCollege)

module.exports = router
