/**
 * models/itemModel.js -- every SQL statement that touches `items`.
 *
 * WHAT IS A "MODEL" HERE?
 * The only layer allowed to write SQL. Controllers call functions
 * like findAll(); they never see a query string. That separation is
 * worth having for three reasons:
 *
 *  1. ONE PLACE TO AUDIT. Every query against items is in this file.
 *     To check that nothing leaks a password column, you read one
 *     file rather than grepping the whole project.
 *  2. THE CONTROLLER STAYS READABLE. It deals in HTTP -- status
 *     codes, request shapes -- not JOIN syntax.
 *  3. SWAPPABLE. If the storage ever changes, this file changes and
 *     nothing else does.
 *
 * >>> WHY EVERY QUERY USES pool.execute() <<<
 * execute() sends a PREPARED STATEMENT: the SQL and the values
 * travel separately. MySQL parses the query FIRST, then slots the
 * values in as data. They can never be read as SQL commands.
 *
 * The alternative -- string concatenation -- is the classic
 * catastrophic bug:
 *
 *     `SELECT * FROM items WHERE id = ${req.params.id}`
 *
 * Someone requests /api/items/1 OR 1=1 and receives every row. With
 * a prepared statement that same input is looked up as the literal
 * text "1 OR 1=1", finds nothing, and returns 404. Correct by
 * construction, not by remembering to sanitise.
 */

const { pool } = require('../config/db')

/* ---------------------------------------------------------------
   THE PUBLIC SHAPE OF AN ITEM
   ---------------------------------------------------------------
   Defined once, used by every query, so /api/items and
   /api/items/:id can never drift apart and return different fields.

   TWO DELIBERATE DECISIONS IN HERE:

   1. `i.item_condition AS condition`
      The column is item_condition because `condition` is a RESERVED
      WORD in MySQL and using it unescaped is a syntax error. But the
      API should not leak that workaround to the frontend, so we
      rename it on the way out. The database calls it item_condition;
      the JSON calls it condition. ItemCard.jsx already reads
      item.condition and needs no change.

   2. WHAT IS ABSENT: the owner's email and mobile.
      The JOIN reaches the full users row, so u.email and u.mobile
      are right there and trivial to add. We deliberately select only
      u.name. Contact details are revealed in Phase 10, and only to
      an owner who has ACCEPTED your request. Selecting a column you
      did not mean to expose is how private data ends up in a public
      API response -- so the safe default is to name every field
      explicitly and never write SELECT *.
--------------------------------------------------------------- */
const ITEM_FIELDS = `
  i.id,
  i.user_id,
  i.name,
  i.description,
  i.category,
  i.item_condition AS \`condition\`,
  i.location,
  i.image_url,
  i.status,
  i.created_at,
  u.name AS owner_name
`

// An upper bound on rows returned. With 12 seeded items this is
// invisible, but an endpoint that returns "all rows, however many
// that is" degrades badly the moment the table grows. Real paging
// (page/limit query parameters) arrives in Phase 9; until then this
// is the guard rail. It is a hard-coded integer, never user input,
// so it cannot be used for injection.
const MAX_ROWS = 100

/**
 * Every item, newest first, with its owner's display name.
 *
 * WHY AN INNER JOIN AND NOT A LEFT JOIN?
 * items.user_id is NOT NULL and has a foreign key to users(id), so
 * an item without an owner cannot exist -- the database refuses it
 * (we test exactly that in tests/database.test.js). An INNER JOIN is
 * therefore correct and communicates the guarantee.
 *
 * WHY ORDER BY created_at *AND* id?
 * The seed script inserts every row inside one transaction, so all
 * twelve share the same created_at second. Ordering by created_at
 * alone leaves ties, and MySQL is free to break ties differently
 * between runs -- meaning the grid could silently reshuffle on
 * refresh. The id tiebreaker makes the order deterministic.
 */
async function findAll() {
  const [rows] = await pool.execute(
    `SELECT ${ITEM_FIELDS}
       FROM items i
       JOIN users u ON u.id = i.user_id
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${MAX_ROWS}`,
  )
  return rows
}

/**
 * One item by id, or null if there is no such row.
 *
 * Returns null rather than throwing: "not found" is a fact about the
 * data, and the model's job is to report facts. Deciding that the
 * fact deserves a 404 is an HTTP concern, and belongs in the
 * controller.
 */
async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${ITEM_FIELDS}
       FROM items i
       JOIN users u ON u.id = i.user_id
      WHERE i.id = ?`,
    [id],
  )

  // execute() always returns an array, even for a unique key.
  return rows[0] ?? null
}

/**
 * Every item belonging to ONE user, newest first.
 *
 * >>> THE user_id FILTER IS THE WHOLE POINT OF THIS FUNCTION <<<
 * It is the difference between "my items" and "everyone's items".
 * The caller passes req.user.id -- which protect.js derived from a
 * verified token signature -- and never a value from the URL or the
 * request body. See the note at the end of protect.js.
 *
 * `limit` exists for the dashboard, which shows only the most recent
 * few. It is a NUMBER, forced through Number.parseInt and clamped,
 * never interpolated from user input as text: LIMIT cannot be a
 * bound parameter in a prepared statement, so this is the one place
 * a value gets embedded into SQL, and it must therefore be proven to
 * be an integer first. Passing '5; DROP TABLE items' through here
 * would otherwise be catastrophic -- parseInt turns it into 5.
 */
async function findByUser(userId, { limit } = {}) {
  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || MAX_ROWS, 1),
    MAX_ROWS,
  )

  const [rows] = await pool.execute(
    `SELECT ${ITEM_FIELDS}
       FROM items i
       JOIN users u ON u.id = i.user_id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${safeLimit}`,
    [userId],
  )
  return rows
}

module.exports = { findAll, findById, findByUser }
