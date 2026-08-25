const users = require('./models/userModel')
const { disconnectPrisma } = require('./config/prisma')

;(async () => {
  const byId = await users.findById(1)
  const byEmail = await users.findByEmail('aarav@example.com')
  const withPw = await users.findByEmailWithPassword('aarav@example.com')
  const admin = await users.findByIdForAdmin(1)
  const page = await users.listForAdmin({ page: 1, limit: 5, offset: 0 }, {})

  const leaks = []
  if ('password' in byId) leaks.push('findById')
  if ('password' in byEmail) leaks.push('findByEmail')
  if ('password' in admin) leaks.push('findByIdForAdmin')
  if (page.rows.some((r) => 'password' in r)) leaks.push('listForAdmin')

  console.log('password leaks   :', leaks.length ? leaks.join(', ') + ' <-- PROBLEM' : 'none')
  console.log('the one exception:', 'password' in withPw ? 'findByEmailWithPassword has it (correct)' : 'MISSING <-- login would break')
  console.log('  looks bcrypt   :', /^\$2[aby]\$/.test(withPw.password), '| len', withPw.password.length)

  console.log('\nflat shape       :', Object.keys(byId).join(','))
  console.log('college resolved :', JSON.stringify({ college_name: byId.college_name, area_name: byId.area_name, city_name: byId.city_name }))
  console.log('created_at       :', JSON.stringify(byId.created_at), typeof byId.created_at)

  // The LEFT JOIN case: a user with no college must not vanish or crash.
  const noCollege = await users.findByEmail('yahs@gmail.com')
  console.log('\nno-college user  :', noCollege ? 'found (correct)' : 'VANISHED <-- protect.js would 401')
  console.log('  nulls not crash:', JSON.stringify({ college_id: noCollege.college_id, college_name: noCollege.college_name }))

  console.log('\nadmin extras     :', JSON.stringify({
    item_count: admin.item_count, available_count: admin.available_count,
    pending_count: admin.pending_count, requests_sent: admin.requests_sent,
    requests_received: admin.requests_received, last_login_at: admin.last_login_at,
  }))

  console.log('counts           :', JSON.stringify(await users.roleAndStatusCounts()))

  for (const sort of ['newest', 'oldest', 'name', 'items', 'active', 'nonsense']) {
    const r = await users.listForAdmin({ page: 1, limit: 3, offset: 0 }, { sort })
    console.log(`  sort=${sort.padEnd(9)} -> ${r.rows.map((u) => u.id).join(',')}`)
  }

  const searched = await users.listForAdmin({ page: 1, limit: 5, offset: 0 }, { search: '%' })
  console.log('search "%" total :', searched.total, '(0 = wildcard escaped)')

  try {
    await users.setRole(1, 'wizard')
    console.log('bad role         : NOT REJECTED <-- problem')
  } catch (e) {
    console.log('bad role         : rejected ->', e.message.slice(0, 46))
  }

  await disconnectPrisma()
})().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
