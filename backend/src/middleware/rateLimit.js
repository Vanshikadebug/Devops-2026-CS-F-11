const redis = require('../lib/redis')
const config = require('../config/env')
const ApiError = require('../utils/ApiError')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function createLimiter({ windowSec, max, bucket, skipSafeMethods = false }) {
  return async function limiter(req, res, next) {
    if (!config.rateLimit.enabled) return next()
    if (skipSafeMethods && SAFE_METHODS.has(req.method)) return next()

    const identity = identify(req)
    const key = `rl:${bucket}:${identity}`

    const result = await redis.incrWithTtl(key, windowSec)
    if (!result) return next()

    const remaining = Math.max(max - result.count, 0)
    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', remaining)

    if (result.count > max) {
      const retryAfter = result.ttl > 0 ? result.ttl : windowSec
      res.setHeader('Retry-After', retryAfter)
      return next(
        ApiError.tooManyRequests(
          `Too many requests. Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
        ),
      )
    }

    return next()
  }
}

function identify(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) {
    // The token's tail is enough to separate callers without storing the
    // token itself in a Redis key.
    return `t:${header.slice(-24)}`
  }
  return `ip:${req.ip || 'unknown'}`
}

// Login and register are a password oracle that answers in milliseconds.
// bcrypt makes each guess expensive; this makes the ATTEMPTS finite.
const authLimiter = createLimiter({
  windowSec: config.rateLimit.auth.windowSec,
  max: config.rateLimit.auth.max,
  bucket: 'auth',
})

// Ordinary writes: generous enough that no real user notices, tight enough
// that a script cannot flood the listings table.
const writeLimiter = createLimiter({
  windowSec: config.rateLimit.write.windowSec,
  max: config.rateLimit.write.max,
  bucket: 'write',
  skipSafeMethods: true,
})

module.exports = { createLimiter, authLimiter, writeLimiter }
