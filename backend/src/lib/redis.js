const Redis = require('ioredis')
const config = require('./../config/env')

let client = null
let healthy = false

if (config.redis.enabled) {
  client = new Redis(config.redis.url, {
    keyPrefix: `${config.redis.prefix}:`,
    // Do not queue commands while disconnected: a queued command would
    // resolve minutes later against stale state. Fail fast, fall through.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    // Reconnect forever with backoff, but never crash the process over it.
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: false,
  })

  client.on('ready', () => {
    healthy = true
    console.log('[redis] connected')
  })
  client.on('end', () => {
    healthy = false
  })
  client.on('error', (err) => {
    // One line, not a stack trace per retry. The app keeps serving.
    if (healthy) console.warn(`[redis] connection lost: ${err.message}`)
    healthy = false
  })
}

const isHealthy = () => healthy

async function get(key) {
  if (!client || !healthy) return null
  try {
    return await client.get(key)
  } catch {
    return null
  }
}

async function set(key, value, ttlSec) {
  if (!client || !healthy) return
  try {
    if (ttlSec) await client.set(key, value, 'EX', ttlSec)
    else await client.set(key, value)
  } catch {
    /* ignore: caching is best-effort */
  }
}

async function del(...keys) {
  if (!client || !healthy || keys.length === 0) return
  try {
    await client.del(...keys)
  } catch {
    /* ignore */
  }
}

// Deletes every key matching a prefix. SCAN, not KEYS, so a large keyspace
// does not block Redis. Used to bust the whole `config:*` family on a write.
async function delByPrefix(prefix) {
  if (!client || !healthy) return
  try {
    const full = `${config.redis.prefix}:${prefix}*`
    let cursor = '0'
    do {
      const [next, found] = await client.scan(cursor, 'MATCH', full, 'COUNT', 200)
      cursor = next
      if (found.length) {
        // keyPrefix is applied by ioredis on write but NOT on scan results,
        // so strip it before del re-applies it.
        const bare = found.map((k) => k.slice(`${config.redis.prefix}:`.length))
        await client.del(...bare)
      }
    } while (cursor !== '0')
  } catch {
    /* ignore */
  }
}

// Raw INCR + EXPIRE for the rate limiter. Returns null when Redis is down so
// the limiter can fail open rather than locking everyone out.
async function incrWithTtl(key, windowSec) {
  if (!client || !healthy) return null
  try {
    const count = await client.incr(key)
    if (count === 1) await client.expire(key, windowSec)
    const ttl = await client.ttl(key)
    return { count, ttl }
  } catch {
    return null
  }
}

async function disconnectRedis() {
  if (!client) return
  try {
    await client.quit()
  } catch {
    /* ignore */
  }
}

module.exports = {
  client,
  isHealthy,
  get,
  set,
  del,
  delByPrefix,
  incrWithTtl,
  disconnectRedis,
}
