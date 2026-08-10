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

   3. THE COLLEGE JOIN IS A **LEFT** JOIN.
      items.college_id is NULLABLE -- an item can be listed off
      campus. A plain JOIN would silently DELETE those rows from
      every response: they would not error, they would just stop
      existing, and only for the listings whose owner did not pick a
      campus. LEFT JOIN keeps them and returns null for the college
      fields, which is what `location` is there to cover.
--------------------------------------------------------------- */
const ITEM_FIELDS = `
  i.id,
  i.user_id,
  i.name,
  i.description,
  i.category,
  i.item_condition AS \`condition\`,
  i.location,
  i.college_id,
  co.short_name AS college_name,
  a.name        AS area_name,
  c.name        AS city_name,
  i.image_url,
  i.status,
  i.created_at,
  u.name AS owner_name
`

/* The FROM clause, written once for the same reason as ITEM_FIELDS:
   three queries need it and they must not drift apart. If the
   college chain were spelled out in each one, a fix applied to two
   of the three is a bug that only shows on one endpoint. */
const ITEM_SOURCE = `
  FROM items i
  JOIN      users    u  ON u.id = i.user_id
  LEFT JOIN colleges co ON co.id = i.college_id
  LEFT JOIN areas    a  ON a.id  = co.area_id
  LEFT JOIN cities   c  ON c.id  = a.city_id
`

// An upper bound on rows returned. With 12 seeded items this is
// invisible, but an endpoint that returns "all rows, however many
// that is" degrades badly the moment the table grows. Real paging
// (page/limit query parameters) arrives in Phase 9; until then this
// is the guard rail. It is a hard-coded integer, never user input,
// so it cannot be used for injection.
const MAX_ROWS = 100

/**
 * Forces any value into a usable LIMIT.
 *
 * >>> WHY THIS IS A FUNCTION AND NOT AN INLINE EXPRESSION <<<
 * LIMIT cannot be a bound parameter in a prepared statement, so its
 * value is the ONE thing in this file that gets interpolated into
 * SQL text. That makes it the one place an injection could live, and
 * it is used by two different queries. Written inline twice, someone
 * eventually copies a version without the parseInt.
 *
 *   clampLimit('5; DROP TABLE items')  ->  5
 *   clampLimit('abc')                  ->  100   (parseInt gives NaN)
 *   clampLimit(-4)                     ->  1
 *   clampLimit(99999)                  ->  100
 *
 * Whatever goes in, an integer between 1 and MAX_ROWS comes out.
 */
function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(limit, 10) || MAX_ROWS, 1), MAX_ROWS)
}

/* The columns a caller may sort by, and the SQL each one maps to.
   A LOOKUP TABLE, NOT A STRING THE CALLER SUPPLIES. `ORDER BY` can
   never be a bound parameter, so if a sort key were interpolated
   from req.query the caller would be writing SQL. Mapping a known
   word to a fixed fragment means the only strings that can reach the
   query are the three written here.

   >>> WHY EVERY ONE OF THEM ENDS WITH i.id <<<
   The seed inserts every row inside a single transaction, so all
   thirteen items share the same created_at second. Sorting by
   created_at alone therefore leaves ties, and MySQL is free to break
   a tie differently between two identical queries -- meaning the
   grid could silently reshuffle when the user refreshes. The id is a
   tiebreaker that can never tie, which makes the order stable. The
   same applies to sorting by name: two items can share a title. */
const SORTS = {
  newest: 'i.created_at DESC, i.id DESC',
  oldest: 'i.created_at ASC, i.id ASC',
  name: 'i.name ASC, i.id ASC',
}

/* Values the ENUM columns accept. Used to reject a bad filter with a
   400 instead of handing MySQL something it will warn about and then
   silently match nothing. These MUST match schema.sql. */
const CATEGORIES = ['Books', 'Electronics', 'Clothing', 'Furniture', 'Stationery', 'Other']
const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor']
const STATUSES = ['Available', 'Reserved', 'Unavailable']

/**
 * Escapes the wildcard characters in a LIKE pattern.
 *
 * >>> THIS IS NOT THE SAME PROBLEM AS SQL INJECTION <<<
 * The search term is already a bound parameter, so it cannot become
 * SQL. But INSIDE a LIKE pattern, `%` and `_` are still operators:
 * `%` matches any run of characters and `_` matches exactly one. A
 * user searching for the literal text "100%" would otherwise get a
 * pattern of `%100%%`, which matches every row that contains "100"
 * followed by anything -- and a user searching for just "%" would
 * match the entire table.
 *
 * The backslash must be escaped FIRST. Doing it last would also
 * escape the backslashes this function just added, doubling them.
 */
function escapeLike(term) {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Items matching a set of filters, newest first, with their owner
 * and campus.
 *
 * ALL FILTERS ARE OPTIONAL AND COMBINE WITH AND. Called with no
 * arguments this is exactly the old findAll() -- every item, newest
 * first -- so Phase 5's behaviour is unchanged and the existing
 * endpoint keeps working untouched.
 *
 *   college   filter to one campus              (integer id)
 *   area      every college in one locality     (integer id)
 *   city      every college in one city         (integer id)
 *   search    words in the name or description  (text)
 *   category  one of CATEGORIES
 *   condition one of CONDITIONS
 *   status    one of STATUSES
 *   sort      a key of SORTS
 *
 * >>> WHY college, area AND city, WHEN college IS THE PRECISE ONE? <<<
 * Because the picker is three steps and a person can stop early.
 * "Everything in Jaipur" is a reasonable thing to want before you
 * have decided on a campus, and it is one extra WHERE clause on a
 * chain we have already joined. Without it the UI would have to
 * fetch the city's colleges, then request items for each one and
 * merge the results in the browser -- N requests to answer one
 * question.
 *
 * >>> HOW THE WHERE CLAUSE IS BUILT SAFELY <<<
 * Read this pattern carefully, because it is the one place where SQL
 * text is assembled at runtime and therefore the one place a mistake
 * would be serious.
 *
 * Two lists are built side by side. `where` collects LITERAL STRINGS
 * that are written out in full in this file -- 'i.college_id = ?' is
 * a constant, not a template. `params` collects the VALUES, which
 * are never concatenated into the SQL and instead reach MySQL as
 * bound parameters of a prepared statement.
 *
 * So the caller controls WHICH of the fixed conditions apply, and
 * WHAT values they compare against -- but never the SQL text itself.
 * There is no input, however hostile, that can add a clause, close a
 * quote, or append a second statement.
 *
 * THE ONE VALUE THAT IS INTERPOLATED is `safeLimit`, because LIMIT
 * cannot be bound. It is forced through Number.parseInt and clamped
 * to a range before it goes anywhere near the string, so by the time
 * it is interpolated it is provably an integer between 1 and 100.
 */
async function findAll(filters = {}) {
  const where = []
  const params = []

  /* --- Location ------------------------------------------------
     Only ONE of these is applied, most specific first. Combining
     "college 4" with "city 2" is either redundant (the college is in
     that city, so the city clause changes nothing) or contradictory
     (it is not, so the answer is always empty). Neither is worth
     supporting; picking the narrowest is what the caller meant.

     >>> NOTE WHAT IS **NOT** HERE <<<
     There is no clause matching against i.location. That column is
     the human sentence printed on the card -- 'Jagatpura, Jaipur' --
     and filtering on it would resurrect every problem the location
     tables exist to prevent: a typo would fork a campus in two, and
     a renamed college would strand its old items. Filtering is
     ALWAYS on the id. See the long note in database/schema.sql. */
  if (filters.college) {
    where.push('i.college_id = ?')
    params.push(filters.college)
  } else if (filters.area) {
    where.push('co.area_id = ?')
    params.push(filters.area)
  } else if (filters.city) {
    where.push('a.city_id = ?')
    params.push(filters.city)
  }

  /* --- Free-text search ----------------------------------------
     WHY LIKE AND NOT THE FULLTEXT INDEX?
     schema.sql defines ft_items_search over (name, description), and
     MATCH ... AGAINST would use it. It is left for a later phase on
     purpose, because in natural-language mode it does not do what a
     search box appears to promise: InnoDB ignores words shorter than
     innodb_ft_min_token_size (3 by default), and it matches WHOLE
     WORDS, so typing "calc" finds nothing at all even though
     "Calculator" is sitting right there. For a box the user types
     into a character at a time, substring matching is the behaviour
     they expect.

     The honest trade-off: LIKE '%term%' cannot use an index and
     scans the table. At this size that is irrelevant, and when it
     stops being irrelevant the fix is to switch to MATCH ... AGAINST
     IN BOOLEAN MODE with a trailing * -- a change confined to these
     four lines. */
  if (filters.search) {
    where.push('(i.name LIKE ? OR i.description LIKE ?)')
    const pattern = `%${escapeLike(filters.search)}%`
    params.push(pattern, pattern)
  }

  /* --- Plain equality filters ----------------------------------
     Each value was checked against its allowed list by the
     controller before arriving here. */
  for (const [key, column] of [
    ['category', 'i.category'],
    ['condition', 'i.item_condition'],
    ['status', 'i.status'],
  ]) {
    if (filters[key]) {
      where.push(`${column} = ?`)
      params.push(filters[key])
    }
  }

  const safeLimit = clampLimit(filters.limit)
  const orderBy = SORTS[filters.sort] ?? SORTS.newest

  const [rows] = await pool.execute(
    `SELECT ${ITEM_FIELDS}
     ${ITEM_SOURCE}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}
     LIMIT ${safeLimit}`,
    params,
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
     ${ITEM_SOURCE}
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
  const safeLimit = clampLimit(limit)

  const [rows] = await pool.execute(
    `SELECT ${ITEM_FIELDS}
     ${ITEM_SOURCE}
     WHERE i.user_id = ?
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT ${safeLimit}`,
    [userId],
  )
  return rows
}

module.exports = {
  findAll,
  findById,
  findByUser,
  // Exported so the controller can validate a query parameter
  // against the SAME list the SQL relies on. Two separate copies of
  // the allowed categories is how the API starts rejecting a value
  // the database would have accepted, or vice versa.
  CATEGORIES,
  CONDITIONS,
  STATUSES,
  SORT_KEYS: Object.keys(SORTS),
}
