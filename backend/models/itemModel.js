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

   4. moderation_status IS HERE; moderation_reason IS NOT.
      Which state a listing is in is not a secret -- its owner needs
      it to see "Awaiting review" in My Items, and on the public
      browse page it is always 'Approved' anyway, because findAll
      cannot return anything else. The REASON a moderator rejected
      something is a different matter: it is an internal note written
      by staff about a user, and it belongs only in the admin shape
      below. Same for moderated_by, which would name the individual
      moderator to the person they acted against.
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
  i.moderation_status,
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

  /* --- The public visibility rule ------------------------------
     >>> THESE TWO CLAUSES ARE NOT FILTERS, AND THERE IS NO WAY TO
         TURN THEM OFF <<<
     Everything else in this function is optional and caller-driven.
     These are unconditional, and that is the entire design: this is
     the function behind the public browse page, so the safe answer
     has to be the one you get when nobody passes anything.

     A flag -- findAll({ includeUnapproved: true }) -- would have read
     more flexibly and been a genuine hazard, because the filters
     object is built from req.query one field at a time and the day
     someone refactors that into a spread, `?includeUnapproved=1`
     becomes a working bypass of the entire moderation system. There
     is no flag to find. Admin listings come from listForAdmin()
     below, which is a different function behind different middleware.

     WHY u.status: blocking an account has to actually stop it
     participating. If a spammer's listings stayed on the browse page
     after they were blocked, the block would be a formality -- the
     spam is the harm, not the login. Their items remain visible to
     THEM in My Items (findByUser does not filter), so nothing is
     destroyed and unblocking restores everything. */
  where.push("i.moderation_status = 'Approved'")
  where.push("u.status = 'active'")

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
 * One item by id AS THE PUBLIC MAY SEE IT, or null.
 *
 * >>> WHY THIS IS SEPARATE FROM findById <<<
 * findById is the raw, ungated lookup, and it has to stay that way
 * because create/update/updateStatus call it to echo back the row
 * they just wrote -- gate it, and the moment item approval is switched
 * on a freshly posted (Pending) listing would come back as null to its
 * own author.
 *
 * This function is the PUBLIC detail read behind GET /api/items/:id,
 * and it applies the EXACT rule findAll applies to the browse grid:
 * an Approved listing whose owner is active, or nothing. Without it
 * the detail route was a hole straight through moderation -- findAll
 * hides a Hidden/Rejected item, and a blocked spammer's listings, from
 * the grid, but anyone who knew (or guessed) an id could still read
 * them one row at a time.
 *
 * Same pairing as findAll (gated, public) vs listForAdmin (ungated,
 * admin): the two are DELIBERATELY separate functions, so there is no
 * flag anyone could pass to turn the gate off by accident.
 */
async function findPublicById(id) {
  const [rows] = await pool.execute(
    `SELECT ${ITEM_FIELDS}
     ${ITEM_SOURCE}
     WHERE i.id = ?
       AND i.moderation_status = 'Approved'
       AND u.status = 'active'`,
    [id],
  )
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

/* ===============================================================
   THE WRITE HALF
   ===============================================================
   Everything above this line reads. Everything below changes data,
   and the rules are different for three reasons worth naming:

   1. EVERY ONE OF THESE FUNCTIONS TRUSTS ITS ARGUMENTS COMPLETELY.
      create() writes whatever user_id it is handed; remove() deletes
      whatever id it is handed. Neither can tell an authorised caller
      from an unauthorised one, because a model has no idea who is
      logged in -- it has no access to the request.

      That is deliberate, not an oversight. Authorisation is decided
      one layer up, in middleware/checkItemOwnership.js, where the
      verified token lives. Splitting it that way means there is
      exactly ONE place to audit the question "who may edit this?",
      instead of the same check copied into three model functions
      where the copies can drift.

      The rule that follows: never call these from a route that has
      not already established ownership.

   2. THEY RE-READ THE ROW AND RETURN IT, rather than returning the
      object that was passed in. An INSERT sets defaults the caller
      never saw -- created_at, status, the auto-increment id -- and
      the joined college and owner names are not in the input at all.
      Returning findById() means the API answers with what the
      database actually holds, so the frontend's copy cannot drift
      from storage. Assembling the response by hand from the request
      body is how a UI ends up showing a value that was never saved.

   3. THE COLUMN IS item_condition, NOT condition. The alias in
      ITEM_FIELDS hides that on the way out, and these functions have
      to remember it on the way in. See the note in schema.sql for
      why the column is named that way.
=============================================================== */

/**
 * Inserts one item and returns the stored row.
 *
 * `userId` MUST come from req.user.id -- see rule 1 above.
 *
 * WHY EVERY ARGUMENT IS NAMED RATHER THAN POSITIONAL:
 * create(id, name, description, category, condition, location, ...)
 * is nine positional arguments of which four are strings that would
 * swap silently. Passing an object means a mistake is a wrong KEY,
 * which is visible, instead of a wrong ORDER, which is not.
 */
async function create({
  userId,
  name,
  description,
  category,
  condition,
  location,
  collegeId = null,
  imageUrl = null,
  status = 'Available',
  /* >>> WHY THE DEFAULT IS 'Approved' AND NOT 'Pending' <<<
     This parameter exists so the controller can queue new listings for
     review when the `require_item_approval` setting is on. The default
     has to match the behaviour the site already had: before moderation
     existed, posting an item published it. If the default were
     'Pending', enabling the admin panel would silently make every new
     listing invisible until somebody noticed a queue nobody knew to
     look at -- a working site broken by an unrelated feature.

     The queue is not decoration either way: turn the setting on and
     this argument becomes 'Pending' for real. The default is about
     which behaviour you get when nobody has chosen. */
  moderationStatus = 'Approved',
}) {
  const [result] = await pool.execute(
    `INSERT INTO items
       (user_id, name, description, category, item_condition,
        location, college_id, image_url, status, moderation_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, name, description, category, condition,
      location, collegeId, imageUrl, status, moderationStatus,
    ],
  )

  return findById(result.insertId)
}

/**
 * Overwrites one item and returns the stored row.
 *
 * A FULL REPLACEMENT, matching PUT semantics -- every column the
 * owner controls is set from the arguments, so a field left out of
 * the request has already been rejected by updateRules rather than
 * quietly kept. See the note on updateRules for why "missing means
 * unchanged" is a worse contract than it sounds.
 *
 * >>> WHAT THIS FUNCTION DELIBERATELY CANNOT CHANGE <<<
 * user_id and created_at are absent from the SET clause. An item
 * cannot be reassigned to a different owner and cannot claim to have
 * been listed at a different time. Neither is something the edit
 * form offers, and leaving them out means a crafted request cannot
 * reach them either -- the SQL has no slot for them.
 *
 * updated_at needs no mention: the column carries
 * ON UPDATE CURRENT_TIMESTAMP, so MySQL maintains it. Setting it by
 * hand would be a second source of truth for the same fact.
 */
async function update(id, {
  name,
  description,
  category,
  condition,
  location,
  collegeId = null,
  imageUrl = null,
  status,
}) {
  await pool.execute(
    `UPDATE items
        SET name           = ?,
            description    = ?,
            category       = ?,
            item_condition = ?,
            location       = ?,
            college_id     = ?,
            image_url      = ?,
            status         = ?
      WHERE id = ?`,
    [
      name, description, category, condition,
      location, collegeId, imageUrl, status,
      id,
    ],
  )

  return findById(id)
}

/**
 * Changes only the status, and returns the stored row.
 *
 * Exists so "mark as given away" is one indexed write instead of a
 * full rewrite of eight columns. The narrower statement is also the
 * safer one: a bug in this function can only ever corrupt an enum
 * that the database itself restricts to three values.
 */
async function updateStatus(id, status) {
  await pool.execute('UPDATE items SET status = ? WHERE id = ?', [status, id])
  return findById(id)
}

/**
 * Deletes one item. Returns true if a row actually went.
 *
 * >>> WHAT ELSE THIS DELETES <<<
 * The `requests` table declares
 *     FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
 * so removing an item also removes every request made for it. That
 * is the correct behaviour -- a pending request to collect an item
 * that no longer exists is not information anyone can act on -- but
 * it is worth knowing that this one statement can remove rows from a
 * table it does not name.
 *
 * `affectedRows` is checked rather than assumed. Deleting an id that
 * is already gone is not an error at the SQL level; it simply
 * changes nothing. Returning that fact lets the controller tell the
 * difference between "deleted" and "there was nothing there", which
 * is the difference between 200 and 404.
 */
async function remove(id) {
  const [result] = await pool.execute('DELETE FROM items WHERE id = ?', [id])
  return result.affectedRows > 0
}

/**
 * Just the owner's id for one item, or null if there is no such row.
 *
 * WHY NOT JUST CALL findById?
 * Because the ownership check runs before every write, and findById
 * is a four-table join that builds the entire public item shape --
 * owner name, college, area, city -- to answer a question that needs
 * one integer. This is a single-row primary-key lookup of one
 * column.
 *
 * The null-vs-number distinction is the whole interface: null means
 * the item does not exist (404), a number that differs from the
 * caller means it belongs to someone else (403).
 */
async function findOwnerId(id) {
  const [rows] = await pool.execute(
    'SELECT user_id FROM items WHERE id = ?',
    [id],
  )
  return rows[0]?.user_id ?? null
}

/* ===================================================================
   MODERATION AND THE ADMIN LISTING
   ===================================================================
   >>> WHY items HAS TWO STATUS COLUMNS AND NOT ONE BIGGER ENUM <<<
   `status` answers "can I still get this?" -- Available, Reserved,
   Unavailable -- and it belongs to the OWNER, who marks their own
   listing as gone. `moderation_status` answers "may the public see
   this at all?" and belongs to STAFF. They are genuinely independent:
   a listing can be Available and Hidden at the same time, and the
   owner marking something Unavailable must not quietly count as
   passing review.

   Folding both into one column would have meant an owner's
   "mark as reserved" could overwrite a moderator's decision to hide
   it -- through an endpoint the owner is legitimately allowed to call.
   =================================================================== */

const MODERATION_STATUSES = ['Pending', 'Approved', 'Rejected', 'Hidden']

/* The admin shape: the public fields, plus the three moderation
   columns that are deliberately kept OUT of the public shape, plus the
   owner's email so the moderation queue does not need a second request
   to tell you whose listing you are looking at.

   The email is the reason this is a separate constant and not an
   addition to ITEM_FIELDS. items.test.js asserts the exact key list of
   a public item precisely so that "add u.email to the JOIN just for
   debugging" fails loudly instead of shipping. That test is a feature;
   this constant is how the admin panel gets what it needs without
   weakening it. */
const ITEM_ADMIN_FIELDS = `
  ${ITEM_FIELDS},
  i.updated_at,
  i.moderated_at,
  i.moderated_by,
  i.moderation_reason,
  u.email AS owner_email,
  u.status AS owner_status,
  m.name  AS moderator_name,
  (SELECT COUNT(*) FROM requests r WHERE r.item_id = i.id) AS request_count
`

/* ITEM_SOURCE plus the moderator. LEFT JOIN because moderated_by is
   NULL for everything nobody has acted on yet -- which is most rows --
   and is SET NULL if that moderator's own account is later deleted. An
   inner join here would hide exactly the items that need attention. */
const ITEM_ADMIN_SOURCE = `
  ${ITEM_SOURCE}
  LEFT JOIN users m ON m.id = i.moderated_by
`

const ADMIN_SORTS = {
  newest: 'i.created_at DESC, i.id DESC',
  oldest: 'i.created_at ASC, i.id ASC',
  name: 'i.name ASC, i.id ASC',
  requests: 'request_count DESC, i.id ASC',
  // For the moderation queue: whatever was decided most recently
  // first, with the undecided (NULL) rows last.
  moderated: 'i.moderated_at IS NULL, i.moderated_at DESC',
}

/**
 * One page of items for /admin/items and the moderation queue.
 *
 * Deliberately a SEPARATE function from findAll rather than findAll
 * with an extra option -- see the long note on the visibility rule
 * inside findAll for why that flag does not exist.
 */
async function listForAdmin({ page, limit, offset }, filters = {}) {
  const where = []
  const params = []

  if (filters.moderation) {
    where.push('i.moderation_status = ?')
    params.push(filters.moderation)
  }
  if (filters.status) {
    where.push('i.status = ?')
    params.push(filters.status)
  }
  if (filters.category) {
    where.push('i.category = ?')
    params.push(filters.category)
  }
  if (filters.userId) {
    where.push('i.user_id = ?')
    params.push(filters.userId)
  }
  if (filters.college) {
    where.push('i.college_id = ?')
    params.push(filters.college)
  }
  if (filters.search) {
    // escapeLike for the same reason the public search uses it: '%'
    // is an operator inside a LIKE pattern, so an admin searching for
    // "100%" would otherwise match the whole table.
    where.push('(i.name LIKE ? OR i.description LIKE ? OR u.email LIKE ?)')
    const pattern = `%${escapeLike(filters.search)}%`
    params.push(pattern, pattern, pattern)
  }
  // An admin listing shows everything by default, including items
  // belonging to blocked accounts -- those are usually the ones being
  // looked for. That is the exact opposite of findAll's rule, and it
  // is why these are two functions.

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = ADMIN_SORTS[filters.sort] || ADMIN_SORTS.newest

  const [rows] = await pool.execute(
    `SELECT ${ITEM_ADMIN_FIELDS}
     ${ITEM_ADMIN_SOURCE}
     ${clause}
     ORDER BY ${order}
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  )

  /* The COUNT does NOT include the moderator join: it is not needed to
     count rows, and every join added to a COUNT is work the database
     does to produce a number that was never going to change. */
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total ${ITEM_SOURCE} ${clause}`,
    params,
  )

  return { rows, total: Number(total), page, limit }
}

/** One item with the full admin shape, or null. */
async function findByIdForAdmin(id) {
  const [rows] = await pool.execute(
    `SELECT ${ITEM_ADMIN_FIELDS} ${ITEM_ADMIN_SOURCE} WHERE i.id = ?`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * Records a moderation decision: approve, reject, hide, or send back
 * to the queue.
 *
 * All four moderation columns move together in ONE statement, and that
 * is the point. Written as separate updates -- status here, timestamp
 * there -- a failure between them leaves a listing that is Rejected
 * with no reason and nobody's name against it, which is precisely the
 * question the audit trail exists to answer.
 *
 * >>> WHY moderatorId AND reason ARE CLEARED WHEN REQUEUING <<<
 * Passing status 'Pending' means "this needs looking at again", so the
 * previous decision is no longer true and keeping the old moderator's
 * name on it would misattribute a judgement they did not make about
 * the current version. The DECISION is not lost: audit_logs holds
 * every one of them, with who and when and why, and that is the record
 * that is supposed to survive -- these four columns are only ever the
 * CURRENT state.
 */
async function setModeration(id, { status, moderatorId = null, reason = null }) {
  if (!MODERATION_STATUSES.includes(status)) {
    throw new Error(
      `itemModel.setModeration: "${status}" is not one of ${MODERATION_STATUSES.join(', ')}`,
    )
  }

  const requeue = status === 'Pending'

  const [result] = await pool.execute(
    `UPDATE items
        SET moderation_status = ?,
            moderated_by      = ?,
            moderated_at      = ?,
            moderation_reason = ?
      WHERE id = ?`,
    [
      status,
      requeue ? null : moderatorId,
      requeue ? null : new Date(),
      requeue ? null : reason,
      id,
    ],
  )

  return result.affectedRows > 0 ? findByIdForAdmin(id) : null
}

/**
 * How many items sit in each moderation state, for the dashboard card
 * and the sidebar badge.
 *
 * Every key is present and zeroed first, because GROUP BY only returns
 * states that exist -- with an empty queue there is no 'Pending' row
 * at all, and a badge reading `counts.Pending` would render
 * "undefined" rather than nothing.
 */
async function moderationCounts() {
  const [rows] = await pool.execute(
    'SELECT moderation_status, COUNT(*) AS n FROM items GROUP BY moderation_status',
  )

  const counts = Object.fromEntries(MODERATION_STATUSES.map((s) => [s, 0]))
  for (const row of rows) counts[row.moderation_status] = Number(row.n)
  return counts
}

module.exports = {
  findAll,
  findById,
  findPublicById,
  findByUser,
  create,
  update,
  updateStatus,
  remove,
  findOwnerId,
  // admin / moderation
  listForAdmin,
  findByIdForAdmin,
  setModeration,
  moderationCounts,
  MODERATION_STATUSES,
  // Exported so the controller can validate a query parameter
  // against the SAME list the SQL relies on. Two separate copies of
  // the allowed categories is how the API starts rejecting a value
  // the database would have accepted, or vice versa.
  CATEGORIES,
  CONDITIONS,
  STATUSES,
  SORT_KEYS: Object.keys(SORTS),
  ADMIN_SORT_KEYS: Object.keys(ADMIN_SORTS),
}
