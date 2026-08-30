const express = require('express')
const { register, login, me } = require('../controllers/authController')
const { registerRules, loginRules } = require('../validators/authValidators')
const validate = require('../middleware/validate')
const protect = require('../middleware/protect')

const router = express.Router()

/* --- Public: no token required (you have none yet) ------------- */
router.post('/register', registerRules, validate, register)
router.post('/login', loginRules, validate, login)

/* --- Protected: `protect` runs first and 401s without a valid
       token, so `me` can assume req.user exists ----------------- */
router.get('/me', protect, me)

module.exports = router
