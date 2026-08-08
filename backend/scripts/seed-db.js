/**
 * scripts/seed-db.js -- fills the database with realistic demo data.
 *
 * WHY SEED DATA MATTERS
 *
 *  1. DEMONSTRATION. Your Phase 18 demo needs items to search and
 *     filter. An empty dashboard demonstrates nothing.
 *  2. DEVELOPMENT. Building the UI against real rows exposes layout
 *     problems (long titles, missing images) that fake data hides.
 *  3. TESTING. Phase 11 can rely on a known starting state.
 *
 * PASSWORDS ARE HASHED HERE TOO.
 * Even demo accounts get real bcrypt hashes -- never plain text.
 * If we inserted plain passwords, login in Phase 6 would fail
 * (bcrypt.compare would not match), and we would have taught
 * ourselves a habit that leaks real passwords later.
 *
 * Every demo account uses the password:  password123
 *
 * USAGE:  npm run db:seed
 */

const bcrypt = require('bcryptjs')
const { pool, closePool } = require('../config/db')

const DEMO_PASSWORD = 'password123'

const USERS = [
  { name: 'Aarav Sharma',   email: 'aarav@example.com',   mobile: '9876543210' },
  { name: 'Priya Nair',     email: 'priya@example.com',   mobile: '9812345678' },
  { name: 'Rohan Verma',    email: 'rohan@example.com',   mobile: '9900112233' },
  { name: 'Meera Krishnan', email: 'meera@example.com',   mobile: '9765432109' },
]

// user_id is 1-based and matches the USERS array order above.
const ITEMS = [
  { user: 1, name: 'Engineering Mathematics Vol. 1 & 2',
    description: 'B.S. Grewal, 44th edition. Both volumes, all pages intact. A few pencil notes in the calculus chapters which I have mostly erased. Sold as a pair.',
    category: 'Books', condition: 'Good', location: 'Kochi, Kerala',
    image_url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&q=80' },

  { user: 1, name: 'Casio FX-991ES Plus Calculator',
    description: 'Scientific calculator, fully working. Allowed in university exams. Slight scuff on the back cover, screen is clear. Includes the slide-on case.',
    category: 'Electronics', condition: 'Like New', location: 'Kochi, Kerala',
    image_url: 'https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=600&q=80' },

  { user: 2, name: 'Wooden Study Desk with Drawer',
    description: 'Solid wood desk, 100cm x 55cm. One deep drawer. Comfortably fits a laptop and two open textbooks. Collection only, it will not fit in a car boot.',
    category: 'Furniture', condition: 'Good', location: 'Thrissur, Kerala',
    image_url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&q=80' },

  { user: 2, name: 'Winter Jacket, Size M',
    description: 'Navy padded jacket, worn for one winter trip and then stored. No tears or stains. Too warm for Kerala, so it deserves a better home.',
    category: 'Clothing', condition: 'Like New', location: 'Thrissur, Kerala',
    image_url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80' },

  { user: 3, name: 'Logitech Wired Mouse',
    description: 'Plain USB optical mouse. Works perfectly, no driver needed. Replaced it with a wireless one so this is spare.',
    category: 'Electronics', condition: 'Good', location: 'Ernakulam, Kerala',
    image_url: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=600&q=80' },

  { user: 3, name: 'Drawing Instrument Box',
    description: 'Complete geometry set: compass, divider, set squares, protractor, scale. Used for one semester of Engineering Graphics. All pieces present.',
    category: 'Stationery', condition: 'Good', location: 'Ernakulam, Kerala',
    image_url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&q=80' },

  { user: 4, name: 'Data Structures in C by Tanenbaum',
    description: 'Standard DS textbook. Cover is creased and the spine is soft, but every page is readable. Good enough to study from.',
    category: 'Books', condition: 'Fair', location: 'Kozhikode, Kerala',
    image_url: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=600&q=80' },

  { user: 4, name: 'Desk Lamp, Adjustable Arm',
    description: 'LED desk lamp with a bendable neck and three brightness levels. Warm white. Cable is 1.5m. Good for late-night study sessions.',
    category: 'Other', condition: 'Like New', location: 'Kozhikode, Kerala',
    image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&q=80' },

  { user: 1, name: 'Folding Study Chair',
    description: 'Metal folding chair with a cushioned seat. Folds flat for storage. One of the rubber feet is missing, which is easy to replace.',
    category: 'Furniture', condition: 'Fair', location: 'Kochi, Kerala',
    image_url: 'https://images.unsplash.com/photo-1503602642458-232111445657?w=600&q=80' },

  { user: 2, name: 'Cotton Kurta Set, Size L',
    description: 'Two cotton kurtas, cream and light blue. Worn a handful of times. Freshly washed and folded.',
    category: 'Clothing', condition: 'Good', location: 'Thrissur, Kerala',
    image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&q=80' },

  // One deliberately Unavailable item, so the Phase 9 availability
  // filter has something real to exclude.
  { user: 3, name: 'Old Android Tablet, 8 inch',
    description: 'Already collected by someone else -- kept here to show how an unavailable listing appears.',
    category: 'Electronics', condition: 'Poor', location: 'Ernakulam, Kerala',
    status: 'Unavailable',
    image_url: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&q=80' },

  // One item with NO image, to prove the UI placeholder works.
  { user: 4, name: 'Assorted Notebooks, Mostly Unused',
    description: 'Six ruled notebooks, 200 pages each. Four are completely blank, two have a few pages used at the front which can be torn out.',
    category: 'Stationery', condition: 'New', location: 'Kozhikode, Kerala',
    image_url: null },
]

// Cross-user requests. Nobody requests their own item -- Phase 10
// blocks that in the API, so seeding it would contradict the rules.
const REQUESTS = [
  { item: 1, requester: 2, status: 'Pending',  message: 'Are both volumes still available? I could collect this weekend.' },
  { item: 1, requester: 3, status: 'Pending',  message: 'Very interested if the other request falls through.' },
  { item: 3, requester: 1, status: 'Accepted', message: 'I can bring a friend to help carry the desk.' },
  { item: 5, requester: 4, status: 'Rejected', message: 'Could you post it to Kozhikode?' },
  { item: 7, requester: 1, status: 'Pending',  message: 'Is the spine still holding together?' },
  { item: 8, requester: 2, status: 'Pending',  message: 'Does it come with the adapter?' },
  { item: 2, requester: 4, status: 'Accepted', message: 'Needed for my exam next month. Thank you!' },
]

async function main() {
  console.log('\n=== ReuseHub database seed ===\n')

  const connection = await pool.getConnection()
  try {
    // A TRANSACTION makes the whole seed all-or-nothing. If inserting
    // request #6 fails, the users and items already inserted are
    // rolled back too, leaving a clean database rather than a
    // half-populated one that is confusing to debug.
    await connection.beginTransaction()

    // Clear existing rows so seeding twice does not duplicate data.
    // Foreign keys are temporarily disabled because TRUNCATE cannot
    // run on a table that is referenced by another -- even when we
    // are emptying both. Re-enabled immediately after.
    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    await connection.query('TRUNCATE TABLE requests')
    await connection.query('TRUNCATE TABLE items')
    await connection.query('TRUNCATE TABLE users')
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')
    console.log('[seed] cleared existing rows')

    // Hash once and reuse. bcrypt is deliberately slow (that is what
    // makes it resistant to brute force), so hashing four times when
    // one will do just wastes a second.
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
    console.log(`[seed] bcrypt hash generated (cost 10, ${hash.length} chars)`)

    for (const u of USERS) {
      await connection.execute(
        'INSERT INTO users (name, email, mobile, password) VALUES (?, ?, ?, ?)',
        [u.name, u.email, u.mobile, hash],
      )
    }
    console.log(`[seed] inserted ${USERS.length} users`)

    for (const it of ITEMS) {
      await connection.execute(
        `INSERT INTO items
           (user_id, name, description, category, item_condition,
            location, image_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [it.user, it.name, it.description, it.category, it.condition,
         it.location, it.image_url ?? null, it.status || 'Available'],
      )
    }
    console.log(`[seed] inserted ${ITEMS.length} items`)

    for (const r of REQUESTS) {
      await connection.execute(
        `INSERT INTO requests (item_id, requester_id, status, message)
         VALUES (?, ?, ?, ?)`,
        [r.item, r.requester, r.status, r.message],
      )
    }
    console.log(`[seed] inserted ${REQUESTS.length} requests`)

    await connection.commit()
    console.log('[seed] transaction committed\n')

    // --- Verify by reading back --------------------------------
    const [[counts]] = await connection.query(
      `SELECT (SELECT COUNT(*) FROM users)    AS users,
              (SELECT COUNT(*) FROM items)    AS items,
              (SELECT COUNT(*) FROM requests) AS requests`,
    )
    console.log(`[seed] verified -> users: ${counts.users}, items: ${counts.items}, requests: ${counts.requests}`)
    console.log(`\n[seed] demo login: aarav@example.com / ${DEMO_PASSWORD}\n`)
  } catch (err) {
    await connection.rollback()
    console.error('\n[seed] FAILED, rolled back')
    console.error(`       ${err.code || err.name}: ${err.message}\n`)
    process.exitCode = 1
  } finally {
    connection.release()
    await closePool()
  }
}

main()
