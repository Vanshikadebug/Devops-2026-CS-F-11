/**
 * prisma/seed.js -- populates a database with the rows the app needs to run
 * plus a small demo dataset.
 *
 * Two modes:
 *   node prisma/seed.js              full seed (upserts everything)
 *   node prisma/seed.js --if-empty   only seeds when the DB has no users, so
 *                                    the Docker entrypoint can run it on every
 *                                    boot without wiping a live database
 *
 * Everything is an upsert or a skipDuplicates createMany, so running it twice
 * changes nothing. It never deletes.
 */

const bcrypt = require('bcryptjs')
// The shared client, so the seed derives DATABASE_URL exactly as the app does
// (from DB_* when DATABASE_URL is not set) rather than needing its own copy.
const config = require('../src/config/env')
const { prisma, disconnectPrisma } = require('../src/lib/prisma')
const { disconnectRedis } = require('../src/lib/redis')

const IF_EMPTY = process.argv.includes('--if-empty')
const DEMO_PASSWORD = 'password123'
const SALT_ROUNDS = config.bcryptSaltRounds

/* The six categories and five conditions that were previously MySQL enums.
   The labels are preserved exactly, so every existing item row remains valid
   after the enum -> VARCHAR migration. */
const CATEGORIES = [
  { slug: 'books', label: 'Books', glyph: '📚', tint: 'books', sort_order: 10 },
  { slug: 'electronics', label: 'Electronics', glyph: '🎧', tint: 'electronics', sort_order: 20 },
  { slug: 'clothing', label: 'Clothing', glyph: '👕', tint: 'clothing', sort_order: 30 },
  { slug: 'furniture', label: 'Furniture', glyph: '🪑', tint: 'furniture', sort_order: 40 },
  { slug: 'stationery', label: 'Stationery', glyph: '✏️', tint: 'stationery', sort_order: 50 },
  { slug: 'other', label: 'Other', glyph: '📦', tint: 'other', sort_order: 60 },
]

const CONDITIONS = [
  { slug: 'new', label: 'New', sort_order: 10 },
  { slug: 'like-new', label: 'Like New', sort_order: 20 },
  { slug: 'good', label: 'Good', sort_order: 30 },
  { slug: 'fair', label: 'Fair', sort_order: 40 },
  { slug: 'poor', label: 'Poor', sort_order: 50 },
]

const NAV_LINKS = [
  { label: 'Browse', href: '/items', placement: 'header', sort_order: 10 },
  { label: 'List an item', href: '/items/new', placement: 'header', sort_order: 20 },
  { label: 'Browse items', href: '/items', placement: 'footer', sort_order: 10 },
  { label: 'My dashboard', href: '/dashboard', placement: 'footer', sort_order: 20 },
]

const SOCIAL_LINKS = [
  { platform: 'GitHub', url: 'https://github.com', icon: 'github', sort_order: 10 },
  { platform: 'Instagram', url: 'https://instagram.com', icon: 'instagram', sort_order: 20 },
]

const CITIES = [
  {
    name: 'Jaipur',
    state: 'Rajasthan',
    slug: 'jaipur',
    areas: [
      {
        name: 'Jagatpura',
        slug: 'jagatpura',
        colleges: [
          { name: 'Swami Keshvanand Institute of Technology', short_name: 'SKIT Jaipur', slug: 'skit-jaipur' },
          { name: 'Poornima College of Engineering', short_name: 'Poornima', slug: 'poornima-college' },
        ],
      },
      {
        name: 'Malviya Nagar',
        slug: 'malviya-nagar',
        colleges: [
          { name: 'Malaviya National Institute of Technology', short_name: 'MNIT Jaipur', slug: 'mnit-jaipur' },
        ],
      },
    ],
  },
  {
    name: 'Kota',
    state: 'Rajasthan',
    slug: 'kota',
    areas: [
      {
        name: 'Rawatbhata Road',
        slug: 'rawatbhata-road',
        colleges: [
          { name: 'Rajasthan Technical University', short_name: 'RTU Kota', slug: 'rtu-kota' },
        ],
      },
    ],
  },
]

const USERS = [
  { name: 'Aarav Sharma', email: 'aarav@example.com', mobile: '9876543210' },
  { name: 'Diya Verma', email: 'diya@example.com', mobile: '9876543211' },
  { name: 'Kabir Singh', email: 'kabir@example.com', mobile: '9876543212' },
]

const ITEMS = [
  {
    name: 'Higher Engineering Mathematics — B.S. Grewal',
    description: 'Complete textbook covering all four semesters of engineering maths. Spine intact, a few pencil notes in the margins that rub out.',
    category: 'Books',
    item_condition: 'Good',
    image_url: '/images/items/assorted-notebooks.jpg',
  },
  {
    name: 'Casio FX-991ES Plus Calculator',
    description: 'Scientific calculator allowed in university exams. Screen is unscratched and the slide cover is included.',
    category: 'Electronics',
    item_condition: 'Like New',
    image_url: '/images/items/casio-fx991es-calculator.jpg',
  },
  {
    name: 'Folding Study Chair',
    description: 'Metal folding chair with a padded seat. Folds flat so it fits beside a hostel bed.',
    category: 'Furniture',
    item_condition: 'Good',
    image_url: '/images/items/folding-study-chair.jpg',
  },
  {
    name: 'LED Desk Lamp',
    description: 'Adjustable-arm desk lamp with three brightness levels. USB powered, cable included.',
    category: 'Electronics',
    item_condition: 'Like New',
    image_url: '/images/items/led-desk-lamp.jpg',
  },
  {
    name: 'Drawing Instrument Box',
    description: 'Full engineering drawing set — compass, dividers, set squares and scale. Used for one semester.',
    category: 'Stationery',
    item_condition: 'Good',
    image_url: '/images/items/drawing-instrument-box.jpg',
  },
  {
    name: 'Cotton Kurta Set',
    description: 'Traditional cotton kurta with matching bottoms, size M. Worn twice for college functions.',
    category: 'Clothing',
    item_condition: 'Like New',
    image_url: '/images/items/cotton-kurta-set.jpg',
  },
]

async function seedTaxonomy() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c })
  }
  for (const c of CONDITIONS) {
    await prisma.condition.upsert({ where: { slug: c.slug }, update: {}, create: c })
  }
  console.log(`  categories: ${CATEGORIES.length}, conditions: ${CONDITIONS.length}`)
}

async function seedSettings() {
  // Reuses the model so the seed and the app can never disagree about what a
  // fresh install has.
  const settingsModel = require('../src/models/settingsModel')
  const inserted = await settingsModel.ensureDefaults()
  console.log(`  settings: ${inserted} inserted (${settingsModel.KEYS.length} defined)`)
}

async function seedContent() {
  // No natural unique key, so skip when anything is already present rather
  // than duplicating the defaults on every run.
  if ((await prisma.navLink.count()) === 0) {
    await prisma.navLink.createMany({ data: NAV_LINKS })
  }
  if ((await prisma.socialLink.count()) === 0) {
    await prisma.socialLink.createMany({ data: SOCIAL_LINKS })
  }
  console.log('  nav + social links ready')
}

async function seedLocations() {
  const colleges = []

  for (const city of CITIES) {
    const cityRow = await prisma.city.upsert({
      where: { slug: city.slug },
      update: {},
      create: { name: city.name, state: city.state, slug: city.slug },
    })

    for (const area of city.areas) {
      const areaRow = await prisma.area.upsert({
        where: { city_id_slug: { city_id: cityRow.id, slug: area.slug } },
        update: {},
        create: { city_id: cityRow.id, name: area.name, slug: area.slug },
      })

      for (const college of area.colleges) {
        const row = await prisma.college.upsert({
          where: { slug: college.slug },
          update: {},
          create: {
            area_id: areaRow.id,
            name: college.name,
            short_name: college.short_name,
            slug: college.slug,
          },
        })
        colleges.push({ ...row, area_name: area.name, city_name: city.name })
      }
    }
  }

  console.log(`  locations: ${CITIES.length} cities, ${colleges.length} colleges`)
  return colleges
}

async function seedUsers(colleges) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS)
  const users = []

  for (const [i, u] of USERS.entries()) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password: hash, college_id: colleges[i % colleges.length]?.id ?? null },
    })
    users.push(row)
  }

  console.log(`  users: ${users.length} (password: ${DEMO_PASSWORD})`)
  return users
}

/** Creates the bootstrap super_admin from ADMIN_* env vars, if provided. There
    is deliberately no default password: a shipped default admin credential is
    a documented backdoor. */
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME || 'Administrator'
  const mobile = process.env.ADMIN_MOBILE || '0000000000'

  if (!email) {
    console.log('  admin: skipped (ADMIN_EMAIL not set)')
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    // Promote but never touch the password of an account that already exists.
    if (existing.role !== 'super_admin') {
      await prisma.user.update({ where: { email }, data: { role: 'super_admin' } })
      console.log(`  admin: promoted ${email} to super_admin`)
    } else {
      console.log(`  admin: ${email} already super_admin`)
    }
    return
  }

  if (!password || password.length < 12) {
    console.log('  admin: skipped (ADMIN_PASSWORD must be 12+ characters to create a new account)')
    return
  }

  await prisma.user.create({
    data: {
      name,
      email,
      mobile,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      role: 'super_admin',
    },
  })
  console.log(`  admin: created ${email} as super_admin`)
}

async function seedItems(users, colleges) {
  if ((await prisma.item.count()) > 0) {
    console.log('  items: skipped (table already has rows)')
    return
  }

  for (const [i, item] of ITEMS.entries()) {
    const owner = users[i % users.length]
    const college = colleges[i % colleges.length]
    await prisma.item.create({
      data: {
        ...item,
        user_id: owner.id,
        college_id: college.id,
        // Built the same way itemController derives it, so a seeded row and a
        // user-created row are indistinguishable.
        location: `${college.area_name}, ${college.city_name}`,
      },
    })
  }
  console.log(`  items: ${ITEMS.length}`)
}

async function main() {
  if (IF_EMPTY && (await prisma.user.count()) > 0) {
    console.log('[seed] database already has users, skipping (--if-empty)')
    return
  }

  console.log('[seed] seeding ReuseHub...')
  await seedTaxonomy()
  await seedSettings()
  await seedContent()
  const colleges = await seedLocations()
  const users = await seedUsers(colleges)
  await seedAdmin()
  await seedItems(users, colleges)
  console.log('[seed] done.')
}

main()
  .catch((err) => {
    console.error('[seed] FAILED:', err.message)
    process.exitCode = 1
  })
  // Both clients, not just Prisma. The seed busts the config cache, which opens
  // a Redis socket, and an open socket keeps the event loop alive -- the process
  // would hang instead of exiting, stalling the `seed && start` chain in Docker.
  .finally(async () => {
    await Promise.allSettled([disconnectPrisma(), disconnectRedis()])
  })
