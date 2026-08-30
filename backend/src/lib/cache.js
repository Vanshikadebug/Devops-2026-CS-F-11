const redis = require('./redis')

/* JSON cache over Redis. Keys are grouped by family so a write can bust a
   whole family in one call -- see KEYS below and bustAll(). */

const KEYS = {
  config: 'config:public',
  settings: 'settings:map',
  categories: 'taxonomy:categories',
  conditions: 'taxonomy:conditions',
  navLinks: 'content:nav',
  socialLinks: 'content:social',
  locationTree: 'locations:tree',
}

async function wrap(key, ttlSec, fn) {
  const hit = await redis.get(key)
  if (hit !== null) {
    try {
      return JSON.parse(hit)
    } catch {
      // Corrupt entry: drop it and recompute rather than throwing.
      await redis.del(key)
    }
  }

  const value = await fn()
  if (value !== undefined) {
    await redis.set(key, JSON.stringify(value), ttlSec)
  }
  return value
}

async function drop(...keys) {
  await redis.del(...keys)
}

async function bustAll() {
  await Promise.all([
    redis.delByPrefix('config:'),
    redis.delByPrefix('settings:'),
    redis.delByPrefix('taxonomy:'),
    redis.delByPrefix('content:'),
    redis.delByPrefix('locations:'),
    redis.delByPrefix('items:'),
  ])
}

module.exports = { KEYS, wrap, drop, bustAll }
