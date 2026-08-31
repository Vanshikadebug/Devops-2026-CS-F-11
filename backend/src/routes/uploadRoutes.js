const express = require('express')
const { receiveImage, uploadImage } = require('../controllers/uploadController')
const protect = require('../middleware/protect')

const router = express.Router()

// Logged in only: an open upload endpoint is free file hosting for anyone who
// finds it. The write rate limiter is already applied to non-GET in app.js.
router.post('/image', protect, receiveImage, uploadImage)

module.exports = router
