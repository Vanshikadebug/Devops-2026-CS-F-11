/**
 * tests/database.test.js -- schema and constraint tests.
 *
 * WHY TEST THE DATABASE ITSELF?
 *
 * The constraints in schema.sql are security and correctness
 * guarantees, not decoration. The UNIQUE key on (item_id,
 * requester_id) is the ONLY thing that makes duplicate requests
 * impossible; the foreign keys are the only thing preventing orphan
 * rows.
 *
 * Those guarantees are easy to lose by accident. Someone editing
 * schema.sql to add a column could drop a KEY line without noticing,
 * and every application test would still pass -- because application
 * tests exercise the happy path. These tests fail loudly instead.
 *
 * NOTE ON ISOLATION: every test that writes runs inside a
 * TRANSACTION that is rolled back afterwards, so the suite never
 * mutates your demo data. Tests you can run repeatedly without
 * cleaning up are tests you will actually run.
 */

const { pool, closePool } = require('../config/db')

// Close the pool when the suite finishes, or Jest hangs with
// "A worker process has failed to exit gracefully" -- open handles
// keep the event loop alive.
afterAll(async () => {
  await closePool()
})

describe('schema structure', () => {
  it('has the three expected tables', async () => {
    const [rows] = await pool.query('SHOW TABLES')
    const names = rows.map((r) => Object.values(r)[0])
    expect(names).toEqual(expect.arrayContaining(['users', 'items', 'requests']))
  })

  it('uses InnoDB everywhere (MyISAM silently ignores foreign keys)', async () => {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()`,
    )
    rows.forEach((r) => expect(r.ENGINE).toBe('InnoDB'))
  })

  it('uses utf8mb4 so emoji and Indian scripts survive', async () => {
    const [rows] = await pool.query(
      `SELECT DEFAULT_CHARACTER_SET_NAME AS cs
         FROM information_schema.SCHEMATA
        WHERE SCHEMA_NAME = DATABASE()`,
    )
    expect(rows[0].cs).toBe('utf8mb4')
  })

  it('names the condition column item_condition, avoiding the reserved word', async () => {
    const [cols] = await pool.query('SHOW COLUMNS FROM items')
    const names = cols.map((c) => c.Field)
    expect(names).toContain('item_condition')
    expect(names).not.toContain('condition')
  })

  it('declares a foreign key for every relationship', async () => {
    const [rows] = await pool.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    )
    const names = rows.map((r) => r.CONSTRAINT_NAME)
    expect(names).toEqual(
      expect.arrayContaining([
        'fk_items_user',
        'fk_requests_item',
        'fk_requests_requester',
        // The location chain: city <- area <- college, and the two
        // things that point at a college.
        'fk_areas_city',
        'fk_colleges_area',
        'fk_users_college',
        'fk_items_college',
      ]),
    )
  })

  /**
   * >>> WHY THIS TEST NAMES EVERY CONSTRAINT INDIVIDUALLY <<<
   *
   * It used to assert that EVERY foreign key in the database was
   * ON DELETE CASCADE, in one loop. That passed while every
   * relationship happened to be a cascade, and it was checking the
   * wrong thing: it asserted uniformity, when what actually matters
   * is that each relationship has the delete rule it specifically
   * needs. The two are indistinguishable right up until they
   * disagree, at which point the blanket test fails on a change that
   * is entirely correct -- exactly what happened when college_id was
   * added.
   *
   * CASCADE and SET NULL answer completely different questions:
   *
   *   CASCADE  = "this row is meaningless without its parent."
   *              An item with no owner cannot be collected from
   *              anyone. A request for a deleted item is noise.
   *
   *   SET NULL = "this row outlives its parent."
   *              Removing a college from the directory must not
   *              delete the people who studied there, nor the
   *              things they are giving away. Those items keep
   *              their `location` text and simply stop being
   *              filed under a campus.
   *
   * Getting this backwards is a data-loss bug of the worst kind:
   * silent, immediate, and irreversible. One tidy-up of the college
   * list would take every listing at that college with it. Pinning
   * each rule by name means such a change cannot pass review by
   * accident.
   */
  it('gives each foreign key the delete rule its relationship needs', async () => {
    const [rows] = await pool.query(
      `SELECT CONSTRAINT_NAME, DELETE_RULE
         FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()`,
    )

    const ruleFor = Object.fromEntries(
      rows.map((r) => [r.CONSTRAINT_NAME, r.DELETE_RULE]),
    )

    // The child cannot exist without the parent -> delete it too.
    expect(ruleFor.fk_items_user).toBe('CASCADE')
    expect(ruleFor.fk_requests_item).toBe('CASCADE')
    expect(ruleFor.fk_requests_requester).toBe('CASCADE')
    expect(ruleFor.fk_areas_city).toBe('CASCADE')
    expect(ruleFor.fk_colleges_area).toBe('CASCADE')

    // The child outlives the parent -> keep it, forget the link.
    expect(ruleFor.fk_users_college).toBe('SET NULL')
    expect(ruleFor.fk_items_college).toBe('SET NULL')
  })

  it('lets an item exist without a college, for off-campus listings', async () => {
    // The nullable column is what makes SET NULL possible above. If
    // someone made college_id NOT NULL to "tidy it up", deleting a
    // college would start failing outright instead of releasing its
    // items -- and this test says why the column is the way it is.
    const [cols] = await pool.query('SHOW COLUMNS FROM items')
    const collegeId = cols.find((c) => c.Field === 'college_id')

    expect(collegeId).toBeDefined()
    expect(collegeId.Null).toBe('YES')
  })

  it('indexes the browse query: college, then status, then date', async () => {
    // The main browse query is "available items at this college,
    // newest first". A composite index in that exact column order
    // serves all three parts; three single-column indexes cannot.
    const [rows] = await pool.query(
      `SHOW INDEX FROM items WHERE Key_name = 'idx_items_college_status_created'`,
    )
    expect(rows.map((r) => r.Column_name)).toEqual([
      'college_id',
      'status',
      'created_at',
    ])
  })

  it('keeps a FULLTEXT index for search', async () => {
    const [rows] = await pool.query(
      `SHOW INDEX FROM items WHERE Index_type = 'FULLTEXT'`,
    )
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('constraints reject bad data', () => {
  // Helper: assert the database refuses a write, with a given code.
  const rejects = async (sql, params, code) => {
    await expect(pool.execute(sql, params)).rejects.toMatchObject({ code })
  }

  it('rejects a duplicate email (this is what makes registration safe)', async () => {
    const [[u]] = await pool.query('SELECT email FROM users LIMIT 1')
    await rejects(
      'INSERT INTO users (name,email,mobile,password) VALUES (?,?,?,?)',
      ['Impostor', u.email, '9000000000', '$2b$10$x'],
      'ER_DUP_ENTRY',
    )
  })

  it('rejects an item whose owner does not exist', async () => {
    await rejects(
      `INSERT INTO items (user_id,name,description,category,item_condition,location)
       VALUES (?,?,?,?,?,?)`,
      [999999, 'Ghost', 'no owner', 'Books', 'Good', 'Nowhere'],
      'ER_NO_REFERENCED_ROW_2',
    )
  })

  it('rejects a category outside the allowed list', async () => {
    await rejects(
      `INSERT INTO items (user_id,name,description,category,item_condition,location)
       VALUES (?,?,?,?,?,?)`,
      [1, 'Thing', 'desc', 'Vehicles', 'Good', 'Jaipur'],
      'WARN_DATA_TRUNCATED',
    )
  })

  it('rejects a NULL description', async () => {
    await rejects(
      `INSERT INTO items (user_id,name,description,category,item_condition,location)
       VALUES (?,?,?,?,?,?)`,
      [1, 'Thing', null, 'Books', 'Good', 'Jaipur'],
      'ER_BAD_NULL_ERROR',
    )
  })

  it('rejects the same user requesting the same item twice', async () => {
    const [[r]] = await pool.query(
      'SELECT item_id, requester_id FROM requests LIMIT 1',
    )
    await rejects(
      'INSERT INTO requests (item_id,requester_id) VALUES (?,?)',
      [r.item_id, r.requester_id],
      'ER_DUP_ENTRY',
    )
  })
})

describe('stored data', () => {
  it('stores passwords as bcrypt hashes, never plain text', async () => {
    const [users] = await pool.query('SELECT password FROM users')
    expect(users.length).toBeGreaterThan(0)
    users.forEach((u) => {
      expect(u.password).toMatch(/^\$2[aby]\$\d{2}\$/) // bcrypt marker
      expect(u.password).toHaveLength(60)
    })
  })

  it('joins users to their items (1--N)', async () => {
    const [rows] = await pool.query(
      `SELECT u.name, COUNT(i.id) AS items
         FROM users u LEFT JOIN items i ON i.user_id = u.id
        GROUP BY u.id`,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.reduce((sum, r) => sum + Number(r.items), 0)).toBeGreaterThan(0)
  })

  it('supports many-to-many between users and items via requests', async () => {
    const [rows] = await pool.query(
      `SELECT i.name, COUNT(r.id) AS n
         FROM items i JOIN requests r ON r.item_id = i.id
        GROUP BY i.id HAVING n > 1`,
    )
    // At least one seeded item has multiple requesters.
    expect(rows.length).toBeGreaterThan(0)
  })

  it('ranks fulltext search results by relevance', async () => {
    const [rows] = await pool.query(
      `SELECT name, MATCH(name,description) AGAINST(? IN NATURAL LANGUAGE MODE) AS score
         FROM items
        WHERE MATCH(name,description) AGAINST(? IN NATURAL LANGUAGE MODE)
        ORDER BY score DESC`,
      ['study desk', 'study desk'],
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].score).toBeGreaterThan(0)
    // Descending order, so each score is <= the one before it.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].score).toBeLessThanOrEqual(rows[i - 1].score)
    }
  })
})

describe('cascade behaviour', () => {
  it('deletes a user\'s items and their requests, then rolls back', async () => {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [u] = await conn.execute(
        'INSERT INTO users (name,email,mobile,password) VALUES (?,?,?,?)',
        ['Cascade Probe', 'cascade.probe@test.local', '9111111111', '$2b$10$fake'],
      )
      const [i] = await conn.execute(
        `INSERT INTO items (user_id,name,description,category,item_condition,location)
         VALUES (?,?,?,?,?,?)`,
        [u.insertId, 'Probe Item', 'temporary', 'Books', 'Good', 'Jaipur'],
      )
      await conn.execute(
        'INSERT INTO requests (item_id,requester_id) VALUES (?,?)',
        [i.insertId, 1],
      )

      await conn.execute('DELETE FROM users WHERE id = ?', [u.insertId])

      const [[counts]] = await conn.query(
        `SELECT (SELECT COUNT(*) FROM items    WHERE id      = ?) AS items,
                (SELECT COUNT(*) FROM requests WHERE item_id = ?) AS requests`,
        [i.insertId, i.insertId],
      )
      expect(Number(counts.items)).toBe(0)
      expect(Number(counts.requests)).toBe(0)
    } finally {
      // Undo everything, so the demo data is exactly as it was.
      await conn.rollback()
      conn.release()
    }
  })
})
