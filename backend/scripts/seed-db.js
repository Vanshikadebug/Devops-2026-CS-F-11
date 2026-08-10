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
 * >>> WHAT CHANGED IN THIS REVISION <<<
 *
 * 1. THE LOCATION TREE IS SEEDED FIRST. cities -> areas -> colleges
 *    must exist before users and items, because both point at a
 *    college by id. The tree is written below as nested JavaScript
 *    objects and inserted depth-first, so the data reads the way the
 *    browse UI works: pick a city, then an area, then a college.
 *
 * 2. ITEMS NAME THEIR COLLEGE BY SLUG, NOT BY ID. Writing
 *    `college: 'skit-jaipur'` and looking the id up at insert time
 *    means the seed cannot rot: reordering the colleges array cannot
 *    silently move an item to a different campus, the way a
 *    hard-coded `college_id: 4` would.
 *
 * 3. items.location IS DERIVED, NOT TYPED. The human-readable
 *    "Jagatpura, Jaipur" is BUILT from the college's area and city
 *    rather than written out again on each item. Typing it twice is
 *    how the text and the id drift apart until an item claims to be
 *    in one place and filters into another.
 *
 * 4. THE CONTENT WAS AUDITED. Previously every image URL pointed at
 *    a remote photograph of something else entirely, and the copy was
 *    written for a different city. See the notes on each item.
 *
 * USAGE:  npm run db:seed
 */

const bcrypt = require('bcryptjs')
const { pool, closePool } = require('../config/db')

const DEMO_PASSWORD = 'password123'

/* ===============================================================
   THE LOCATION TREE
   ===============================================================
   Nested exactly as the browse flow steps through it:

     city  ->  area  ->  college

   WHY SEED PLACES THAT HAVE NO ITEMS?
   Because that is the entire reason the location tables exist. If
   the dropdowns were built with SELECT DISTINCT over the items
   table, a college with nothing listed would not appear -- and
   nobody could ever be the first person to list something there.
   MNIT and IIT Delhi are here to prove the option list comes from
   the directory, not from the inventory: several of these colleges
   are deliberately empty, and they still show up and still say
   "nothing listed yet" rather than vanishing.

   The slugs are the stable handle used everywhere else in this file
   and in the URL (?college=skit-jaipur). Ids are assigned by
   AUTO_INCREMENT and are not written down anywhere by hand.
=============================================================== */
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
          {
            name: 'Swami Keshvanand Institute of Technology, Management & Gramothan',
            short_name: 'SKIT Jaipur',
            slug: 'skit-jaipur',
          },
          {
            name: 'Jaipur National University',
            short_name: 'JNU Jaipur',
            slug: 'jaipur-national-university',
          },
        ],
      },
      {
        name: 'Malviya Nagar',
        slug: 'malviya-nagar',
        colleges: [
          {
            name: 'Malaviya National Institute of Technology Jaipur',
            short_name: 'MNIT Jaipur',
            slug: 'mnit-jaipur',
          },
        ],
      },
      {
        name: 'Sitapura',
        slug: 'sitapura',
        colleges: [
          {
            name: 'JECRC University',
            short_name: 'JECRC Jaipur',
            slug: 'jecrc-university',
          },
          {
            name: 'Poornima College of Engineering',
            short_name: 'Poornima Jaipur',
            slug: 'poornima-college',
          },
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
          {
            name: 'Rajasthan Technical University',
            short_name: 'RTU Kota',
            slug: 'rtu-kota',
          },
        ],
      },
      {
        name: 'Dadabari',
        slug: 'dadabari',
        colleges: [
          {
            name: 'Government Polytechnic College Kota',
            short_name: 'Govt Polytechnic Kota',
            slug: 'govt-polytechnic-kota',
          },
        ],
      },
    ],
  },
  {
    // A second STATE, not just a second city. This is what makes the
    // uq_cities_name_state constraint meaningful rather than
    // decorative -- uniqueness is the (name, state) pair.
    name: 'New Delhi',
    state: 'Delhi',
    slug: 'new-delhi',
    areas: [
      {
        name: 'Hauz Khas',
        slug: 'hauz-khas',
        colleges: [
          {
            name: 'Indian Institute of Technology Delhi',
            short_name: 'IIT Delhi',
            slug: 'iit-delhi',
          },
        ],
      },
      {
        name: 'Dwarka',
        slug: 'dwarka',
        colleges: [
          {
            name: 'Netaji Subhas University of Technology',
            short_name: 'NSUT Delhi',
            slug: 'nsut-delhi',
          },
        ],
      },
    ],
  },
]

/* ===============================================================
   USERS
   ===============================================================
   Each demo account now studies somewhere, so the browse page can
   pre-select their campus on login instead of asking every visit.
   `college` is a slug, resolved to an id at insert time.
=============================================================== */
const USERS = [
  { name: 'Aarav Sharma',   email: 'aarav@example.com', mobile: '9876543210', college: 'skit-jaipur' },
  { name: 'Priya Nair',     email: 'priya@example.com', mobile: '9812345678', college: 'skit-jaipur' },
  { name: 'Rohan Verma',    email: 'rohan@example.com', mobile: '9900112233', college: 'mnit-jaipur' },
  { name: 'Meera Krishnan', email: 'meera@example.com', mobile: '9765432109', college: 'jecrc-university' },
]

/* ===============================================================
   ITEMS
   ===============================================================
   user is 1-based and matches the USERS array order above.
   college is a slug from the tree, or null for an off-campus listing.

   >>> ABOUT THE PHOTOGRAPHS <<<
   Every image_url is either a file committed under
   frontend/public/images/items/ -- opened and checked against the
   listing it belongs to -- or null.

   Null is a deliberate answer, not an omission. Several of these
   items have no honestly matching freely-licensed photograph
   available: book covers are copyrighted, and searches for a plain
   study desk or a padded jacket returned antique furniture and
   museum pieces. Attaching a decorative near-miss is worse than
   showing nothing, because a wrong photograph is a lie about what
   is being given away. ItemImage renders a category placeholder for
   these, so the card is never blank.

   frontend/public/images/items/ATTRIBUTION.md records the source
   and licence of each committed file, and which listings were left
   without one and why.
=============================================================== */
const ITEMS = [
  {
    user: 1, college: 'skit-jaipur',
    // WAS: 'Engineering Mathematics Vol. 1 & 2'. B.S. Grewal's book
    // is a single volume called Higher Engineering Mathematics; the
    // old title described a book that does not exist.
    name: 'Higher Engineering Mathematics — B.S. Grewal',
    description:
      '44th edition, the one prescribed for first and second year. All pages intact, binding is tight. A few pencil notes in the calculus chapters which I have mostly erased.',
    category: 'Books', condition: 'Good',
    image_url: null,
  },

  {
    user: 1, college: 'skit-jaipur',
    name: 'Casio FX-991ES Plus Calculator',
    description:
      'Scientific calculator, fully working. Allowed in university exams. Slight scuff on the back cover, screen is clear. Includes the slide-on case.',
    category: 'Electronics', condition: 'Like New',
    image_url: '/images/items/casio-fx991es-calculator.jpg',
  },

  {
    user: 2, college: 'skit-jaipur',
    name: 'Wooden Study Desk with Drawer',
    description:
      'Solid wood desk, 100cm x 55cm. One deep drawer. Comfortably fits a laptop and two open textbooks. Collection only, it will not fit in a car boot.',
    category: 'Furniture', condition: 'Good',
    image_url: null,
  },

  {
    user: 2, college: 'skit-jaipur',
    name: 'Winter Jacket, Size M',
    // WAS: 'Too warm for Kerala'. Nothing in this project is in
    // Kerala; the copy was left over from an earlier draft.
    description:
      'Navy padded jacket, bought for a Manali trip and worn for that one week. No tears or stains. Jaipur winters never got cold enough to need it again.',
    category: 'Clothing', condition: 'Like New',
    image_url: null,
  },

  {
    user: 3, college: 'mnit-jaipur',
    name: 'Logitech Wired Mouse',
    description:
      'Plain USB optical mouse. Works perfectly, no driver needed. Replaced it with a wireless one so this is spare.',
    category: 'Electronics', condition: 'Good',
    image_url: null,
  },

  {
    user: 3, college: 'mnit-jaipur',
    name: 'Drawing Instrument Box',
    description:
      'Geometry set in a zip pouch: set squares, protractor and scale. Used for one semester of Engineering Graphics. The compass and divider are not included.',
    category: 'Stationery', condition: 'Good',
    image_url: '/images/items/drawing-instrument-box.jpg',
  },

  {
    user: 4, college: 'jecrc-university',
    // WAS: 'Data Structures in C by Tanenbaum'. Two different
    // authors were being conflated. Andrew S. TANENBAUM writes the
    // operating systems and networking books; the data structures
    // one is by Aaron M. TENENBAUM, and its title is "Data
    // Structures Using C".
    name: 'Data Structures Using C — Tenenbaum',
    description:
      'Tenenbaum, Langsam and Augenstein. Cover is creased and the spine is soft, but every page is readable. Good enough to study from.',
    category: 'Books', condition: 'Fair',
    image_url: null,
  },

  {
    user: 4, college: 'jecrc-university',
    name: 'Desk Lamp, Adjustable Arm',
    description:
      'LED desk lamp with a bendable neck and three brightness levels. Warm white. Cable is 1.5m. Good for late-night study sessions.',
    category: 'Other', condition: 'Like New',
    image_url: '/images/items/led-desk-lamp.jpg',
  },

  {
    user: 1, college: 'skit-jaipur',
    name: 'Folding Study Chair',
    description:
      'Metal folding chair with slatted seat and back. Folds flat for storage behind a door. One of the rubber feet is missing, which is easy to replace.',
    category: 'Furniture', condition: 'Fair',
    image_url: '/images/items/folding-study-chair.jpg',
  },

  {
    user: 2, college: 'skit-jaipur',
    // WAS described as a two-piece set in cream and light blue; the
    // photograph is a single blue khadi kurta, so the description
    // now matches the picture rather than contradicting it.
    name: 'Cotton Kurta, Size L',
    description:
      'Blue khadi cotton kurta, full sleeve. Worn a handful of times and freshly washed. Comfortable in the heat.',
    category: 'Clothing', condition: 'Good',
    image_url: '/images/items/cotton-kurta-set.jpg',
  },

  // One deliberately Unavailable item, so the availability filter
  // has something real to exclude.
  {
    user: 3, college: 'mnit-jaipur',
    // WAS '8 inch'; the photograph is a 7 inch tablet. The listing
    // was changed to match the photograph, not the other way round.
    name: 'Old Android Tablet, 7 inch',
    description:
      'Already collected by someone else — kept here to show how an unavailable listing appears.',
    category: 'Electronics', condition: 'Poor',
    status: 'Unavailable',
    image_url: '/images/items/android-tablet.jpg',
  },

  {
    user: 4, college: 'jecrc-university',
    name: 'Assorted Notebooks, Mostly Unused',
    description:
      'Six ruled notebooks, 200 pages each. Four are completely blank, two have a few pages used at the front which can be torn out.',
    category: 'Stationery', condition: 'New',
    image_url: '/images/items/assorted-notebooks.jpg',
  },

  /* --- The off-campus listing ---------------------------------
     college is null on purpose. items.college_id is NULLABLE, and
     this row is what proves the rest of the system copes with that:
       - it must NOT appear when a college filter is applied
       - it MUST appear when browsing everything
       - its card has no college to show, so it falls back to the
         `location` text -- which is why that column stays NOT NULL.
     Without one such row the null path is never exercised and would
     break the first time a real user listed something off campus.
  ------------------------------------------------------------- */
  {
    user: 1, college: null,
    name: 'Bicycle Floor Pump',
    description:
      'Steel floor pump with a pressure gauge, fits both Presta and Schrader valves. Listed from home rather than campus, so collection is from Pratap Nagar.',
    category: 'Other', condition: 'Good',
    location: 'Pratap Nagar, Jaipur',
    image_url: null,
  },
]

/* Cross-user requests. Nobody requests their own item -- Phase 10
   blocks that in the API, so seeding it would contradict the rules. */
const REQUESTS = [
  { item: 1, requester: 2, status: 'Pending',  message: 'Is this still available? I could collect it this weekend.' },
  { item: 1, requester: 3, status: 'Pending',  message: 'Very interested if the other request falls through.' },
  { item: 3, requester: 1, status: 'Accepted', message: 'I can bring a friend to help carry the desk.' },
  { item: 5, requester: 4, status: 'Rejected', message: 'Could you post it to Kota?' },
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
    //
    // TRUNCATE, not DELETE: it also resets AUTO_INCREMENT, so a
    // reseeded database gives item 1 the same id every time. The
    // REQUESTS array above refers to items by number, and would
    // point at the wrong rows if ids kept climbing between runs.
    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const t of ['requests', 'items', 'users', 'colleges', 'areas', 'cities']) {
      await connection.query(`TRUNCATE TABLE \`${t}\``)
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')
    console.log('[seed] cleared existing rows')

    /* --- 1. The location tree, depth first -------------------
       Every insert returns its new id, which becomes the parent id
       for the level below. `collegeBySlug` collects the leaves so
       users and items can name a campus in words. */
    const collegeBySlug = new Map()
    let areaCount = 0

    for (const city of CITIES) {
      const [cityRes] = await connection.execute(
        'INSERT INTO cities (name, state, slug) VALUES (?, ?, ?)',
        [city.name, city.state, city.slug],
      )

      for (const area of city.areas) {
        areaCount += 1
        const [areaRes] = await connection.execute(
          'INSERT INTO areas (city_id, name, slug) VALUES (?, ?, ?)',
          [cityRes.insertId, area.name, area.slug],
        )

        for (const college of area.colleges) {
          const [colRes] = await connection.execute(
            'INSERT INTO colleges (area_id, name, short_name, slug) VALUES (?, ?, ?, ?)',
            [areaRes.insertId, college.name, college.short_name, college.slug],
          )

          collegeBySlug.set(college.slug, {
            id: colRes.insertId,
            // The display sentence for a card, built once here from
            // the tree we are already walking. Nobody types
            // "Jagatpura, Jaipur" by hand, so it cannot disagree
            // with the college it was derived from.
            location: `${area.name}, ${city.name}`,
          })
        }
      }
    }
    console.log(
      `[seed] inserted ${CITIES.length} cities, ${areaCount} areas, ${collegeBySlug.size} colleges`,
    )

    /* A slug that is not in the tree is a typo, and it must stop the
       seed. Left unchecked, `collegeBySlug.get('skit-jaipurr')`
       returns undefined, the item is inserted with college_id NULL,
       and it silently disappears from every college-filtered view --
       a bug you would chase in the API for an hour. */
    const resolveCollege = (slug, what) => {
      if (slug === null) return null
      const found = collegeBySlug.get(slug)
      if (!found) {
        throw new Error(`${what} refers to unknown college slug '${slug}'`)
      }
      return found
    }

    // --- 2. Users ---------------------------------------------
    // Hash once and reuse. bcrypt is deliberately slow (that is what
    // makes it resistant to brute force), so hashing four times when
    // one will do just wastes a second.
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
    console.log(`[seed] bcrypt hash generated (cost 10, ${hash.length} chars)`)

    for (const u of USERS) {
      const college = resolveCollege(u.college, `User ${u.email}`)
      await connection.execute(
        'INSERT INTO users (name, email, mobile, password, college_id) VALUES (?, ?, ?, ?, ?)',
        [u.name, u.email, u.mobile, hash, college ? college.id : null],
      )
    }
    console.log(`[seed] inserted ${USERS.length} users`)

    // --- 3. Items ---------------------------------------------
    for (const it of ITEMS) {
      const college = resolveCollege(it.college, `Item "${it.name}"`)

      // location comes from the college when there is one, and only
      // an off-campus item has to spell it out for itself.
      const location = college ? college.location : it.location
      if (!location) {
        throw new Error(`Item "${it.name}" has no college and no location`)
      }

      await connection.execute(
        `INSERT INTO items
           (user_id, name, description, category, item_condition,
            location, college_id, image_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          it.user, it.name, it.description, it.category, it.condition,
          location, college ? college.id : null,
          it.image_url ?? null, it.status || 'Available',
        ],
      )
    }
    console.log(`[seed] inserted ${ITEMS.length} items`)

    // --- 4. Requests ------------------------------------------
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

    /* --- Verify by reading back -------------------------------
       Not "did the inserts throw" but "is the result correct".
       The per-college breakdown is the useful one: it is the exact
       query the browse page runs, so seeing sensible numbers here
       means the feature has real data behind it before a single
       line of UI is written. */
    const [[counts]] = await connection.query(
      `SELECT (SELECT COUNT(*) FROM cities)   AS cities,
              (SELECT COUNT(*) FROM areas)    AS areas,
              (SELECT COUNT(*) FROM colleges) AS colleges,
              (SELECT COUNT(*) FROM users)    AS users,
              (SELECT COUNT(*) FROM items)    AS items,
              (SELECT COUNT(*) FROM requests) AS requests`,
    )
    console.log(
      `[seed] verified -> cities: ${counts.cities}, areas: ${counts.areas}, ` +
      `colleges: ${counts.colleges}, users: ${counts.users}, ` +
      `items: ${counts.items}, requests: ${counts.requests}`,
    )

    const [breakdown] = await connection.query(
      `SELECT c.name AS city, a.name AS area, co.short_name AS college,
              COUNT(i.id) AS items
         FROM colleges co
         JOIN areas  a ON a.id = co.area_id
         JOIN cities c ON c.id = a.city_id
         LEFT JOIN items i ON i.college_id = co.id
        GROUP BY co.id
        ORDER BY c.name, a.name, co.short_name`,
    )
    console.log('\n[seed] items per college:')
    for (const row of breakdown) {
      console.log(
        `         ${String(row.items).padStart(2)}  ${row.college.padEnd(22)} ${row.area}, ${row.city}`,
      )
    }

    const [[offCampus]] = await connection.query(
      'SELECT COUNT(*) AS n FROM items WHERE college_id IS NULL',
    )
    console.log(`         ${String(offCampus.n).padStart(2)}  (off campus, no college)`)

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
