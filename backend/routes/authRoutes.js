/**
 * routes/authRoutes.js -- the URL map for /api/auth.
 *
 * Read this file top to bottom and you can see the security posture
 * of the whole resource: which endpoints are open, which need a
 * token, and what validation each one runs. That is the point of
 * keeping routes separate from controllers.
 *
 * MIDDLEWARE RUNS LEFT TO RIGHT. In:
 *
 *     router.post('/register', registerRules, validate, register)
 *
 * the rules record problems, `validate` stops with a 400 if there
 * are any, and only then does the controller run. Putting `validate`
 * before the rules would check results that had not been produced
 * yet and let everything through -- a silent failure, since the
 * route would still appear to work.
 */

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
