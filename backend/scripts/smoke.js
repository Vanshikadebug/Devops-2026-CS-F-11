#!/usr/bin/env node
/**
 * End-to-end smoke test against a RUNNING stack (default http://localhost:5000).
 * Exercises every query that was rewritten for MongoDB: search, relation
 * filters, counters/ids, the request accept transaction, reports, admin
 * aggregates. Jenkins runs it after deploying.
 *
 *   node scripts/smoke.js                 BASE_URL=http://localhost:3000 node scripts/smoke.js
 *   SMOKE_WAIT=120 node scripts/smoke.js  wait up to 120 s for the API + DB first
 *
 * Admin checks use ADMIN_EMAIL / ADMIN_PASSWORD (the compose defaults if unset).
 * Creates two throwaway smoke-* users and one item per run, and deletes the
 * item again at the end; it never touches real data.
 */
const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@reusehub.test'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPassword123!'

let failures = 0
const run = Date.now().toString(36)

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function check(name, fn) {
  try {
    await fn()
    console.log(`  ok    ${name}`)
  } catch (err) {
    failures += 1
    console.log(`  FAIL  ${name}\n        ${err.message}`)
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function register(tag) {
  const { status, json } = await call('POST', '/auth/register', {
    body: { name: `Smoke ${tag}`, email: `smoke-${tag}-${run}@example.test`, mobile: '9876543210', password: 'SmokeTest123!' },
  })
  expect(status === 201, `register ${tag}: HTTP ${status} ${JSON.stringify(json)}`)
  return { token: json.data.token, id: json.data.user.id }
}

/** SMOKE_WAIT=<seconds>: keep polling /api/health until the database is up. */
async function waitForHealthy(seconds) {
  const deadline = Date.now() + seconds * 1000
  for (;;) {
    try {
      const { json } = await call('GET', '/health')
      if (json.database === 'connected') return
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) return
    await new Promise((r) => setTimeout(r, 3000))
  }
}

async function main() {
  console.log(`[smoke] ${BASE}`)
  await waitForHealthy(Number(process.env.SMOKE_WAIT) || 0)
  const ctx = {}

  await check('health reports database connected', async () => {
    const { json } = await call('GET', '/health')
    expect(json.database === 'connected', `database is "${json.database}"`)
  })

  await check('public config + taxonomy', async () => {
    const { json } = await call('GET', '/config')
    expect(json.data.categories.length > 0, 'no categories')
    ctx.category = json.data.categories[0].label
    ctx.condition = json.data.conditions[0].label
  })

  await check('cities with college counts', async () => {
    const { json } = await call('GET', '/locations/cities')
    expect(json.data.length > 0 && typeof json.data[0].college_count === 'number', 'no college_count')
    const colleges = await call('GET', '/locations/colleges')
    ctx.collegeId = colleges.json.data[0].id
  })

  await check('register + login (numeric ids)', async () => {
    ctx.owner = await register('owner')
    ctx.asker = await register('asker')
    expect(Number.isInteger(ctx.owner.id) && ctx.asker.id > ctx.owner.id, 'ids not sequential integers')
    const { status } = await call('POST', '/auth/login', {
      body: { email: `smoke-owner-${run}@example.test`, password: 'SmokeTest123!' },
    })
    expect(status === 200, `login HTTP ${status}`)
  })

  await check('create item', async () => {
    const { status, json } = await call('POST', '/items', {
      token: ctx.owner.token,
      body: {
        name: `Smoke Lamp ${run}`,
        description: 'Created by the smoke test (100% working).',
        category: ctx.category,
        condition: ctx.condition,
        collegeId: ctx.collegeId,
      },
    })
    expect(status === 201, `HTTP ${status} ${JSON.stringify(json)}`)
    ctx.itemId = json.data.id
  })

  await check('case-insensitive search, special chars literal', async () => {
    const hit = await call('GET', `/items?search=${encodeURIComponent(`smoke lamp ${run}`.toUpperCase())}`)
    expect(hit.json.data.some((i) => i.id === ctx.itemId), 'uppercase search missed the item')
    const pct = await call('GET', `/items?search=${encodeURIComponent('(100%')}`)
    expect(pct.status === 200 && pct.json.data.some((i) => i.id === ctx.itemId), 'literal "(100%" search failed')
  })

  await check('request -> accept transaction reserves the item', async () => {
    const req = await call('POST', '/requests', { token: ctx.asker.token, body: { itemId: ctx.itemId, message: 'hi' } })
    expect(req.status === 201, `request HTTP ${req.status} ${JSON.stringify(req.json)}`)
    const acc = await call('PATCH', `/requests/${req.json.data.id}`, { token: ctx.owner.token, body: { status: 'Accepted' } })
    expect(acc.status === 200, `accept HTTP ${acc.status} ${JSON.stringify(acc.json)}`)
    const item = await call('GET', `/items/${ctx.itemId}`)
    expect(item.json.data.status === 'Reserved', `item status ${item.json.data.status}`)
  })

  await check('file a report', async () => {
    const { status, json } = await call('POST', '/reports', {
      token: ctx.asker.token,
      body: { itemId: ctx.itemId, reason: 'Duplicate', details: 'smoke test' },
    })
    expect(status === 201, `HTTP ${status} ${JSON.stringify(json)}`)
  })

  const admin = await call('POST', '/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  const adminToken = admin.json?.data?.token
  if (!adminToken) {
    console.log('  skip  admin checks (ADMIN_EMAIL/ADMIN_PASSWORD did not log in)')
  } else {
    for (const path of [
      '/admin/dashboard',
      '/admin/reports',
      '/admin/reports?sort=newest&search=smoke',
      '/admin/users?sort=active&search=SMOKE',
      '/admin/items?sort=moderated',
      '/admin/locations/cities',
      '/admin/locations/areas',
      '/admin/audit?search=a',
    ]) {
      await check(`admin GET ${path}`, async () => {
        const { status, json } = await call('GET', path, { token: adminToken })
        expect(status === 200, `HTTP ${status} ${JSON.stringify(json).slice(0, 200)}`)
      })
    }
  }

  // Remove the throwaway listing (its request and report cascade with it) so
  // repeated runs don't fill the index with smoke items.
  if (ctx.itemId) {
    await check('delete the smoke item', async () => {
      const { status } = await call('DELETE', `/items/${ctx.itemId}`, { token: ctx.owner.token })
      expect(status === 200 || status === 204, `HTTP ${status}`)
    })
  }

  console.log(failures ? `[smoke] ${failures} check(s) FAILED` : '[smoke] all checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error('[smoke] crashed:', err)
  process.exit(1)
})
