/**
 * models/locationModel.js -- every SQL statement that touches
 * `cities`, `areas` and `colleges`.
 *
 * WHAT IS THIS FILE FOR?
 * The browse page asks three questions in order:
 *
 *     which cities exist?          -> findCities()
 *     which areas are in Jaipur?   -> findAreas(cityId)
 *     which colleges in Jagatpura? -> findColleges({ areaId })
 *
 * Each is one indexed lookup. Together they are the whole
 * city -> area -> college picker.
 *
 * >>> WHY THESE LISTS COME FROM THE LOCATION TABLES AND NOT FROM
 *     THE ITEMS TABLE <<<
 * The tempting shortcut is `SELECT DISTINCT location FROM items`.
 * It needs no new tables and it works on day one -- and it is
 * quietly broken, because it can only ever list places that already
 * have something listed. A college nobody has posted to does not
 * appear in the dropdown, so nobody can select it, so nobody can be
 * the first to list there. The empty campus is unreachable forever.
 *
 * Reading from a directory table instead means a college exists as
 * soon as it is added, whether or not it holds a single item. The
 * `item_count` below is then a genuine fact about a place that
 * exists -- including, legitimately, zero.
 *
 * Every query uses pool.execute(), so values travel separately from
 * the SQL as a prepared statement. See the long note at the top of
 * itemModel.js for why that is not optional.
 */

const { pool } = require('../config/db')

/**
 * Every city, alphabetically, with how many colleges it holds.
 *
 * WHY ORDER BY name AND NOT BY id?
 * Insertion order is an accident of the seed file. A person looking
 * for "Kota" in a list scans alphabetically; nobody scans by
 * primary key.
 *
 * WHY A LEFT JOIN RATHER THAN A PLAIN JOIN?
 * A plain JOIN drops any city with no areas yet. That city is real,
 * it is simply new -- and hiding it is the same bug as building the
 * list from items. LEFT JOIN keeps it and reports 0.
 */
async function findCities() {
  const [rows] = await pool.execute(
    `SELECT c.id, c.name, c.state, c.slug,
            COUNT(co.id) AS college_count
       FROM cities c
       LEFT JOIN areas    a  ON a.city_id  = c.id
       LEFT JOIN colleges co ON co.area_id = a.id
      GROUP BY c.id
      ORDER BY c.name`,
  )

  // COUNT() comes back from mysql2 as a JS number, so no cast is
  // needed here -- unlike SUM(), which returns a DECIMAL as a
  // STRING and would arrive in JSON as "3" instead of 3.
  return rows
}

/**
 * The areas of ONE city, with a college count each.
 *
 * Returns [] for a city id that does not exist. That is not an
 * error the model should decide about: "this city has no areas" and
 * "there is no such city" are both empty lists as far as SQL is
 * concerned, and the controller checks the city separately when the
 * distinction matters.
 */
async function findAreas(cityId) {
  const [rows] = await pool.execute(
    `SELECT a.id, a.city_id, a.name, a.slug,
            COUNT(co.id) AS college_count
       FROM areas a
       LEFT JOIN colleges co ON co.area_id = a.id
      WHERE a.city_id = ?
      GROUP BY a.id
      ORDER BY a.name`,
    [cityId],
  )
  return rows
}

/**
 * Colleges, filtered by area OR by city, each with a live count of
 * the items currently available there.
 *
 * WHY ONE FUNCTION FOR TWO FILTERS?
 * The UI wants "colleges in Jagatpura" while stepping through the
 * picker, but "every college in Jaipur" when someone skips the area
 * step -- a real thing to want, and the reason `area` is optional in
 * the flow. Both are the same query with a different WHERE clause,
 * and splitting them would duplicate the JOIN chain and the count.
 *
 * >>> HOW THE FILTER IS BUILT SAFELY <<<
 * The WHERE clause is assembled from a fixed set of literal strings
 * chosen by which arguments arrived. The VALUES are never
 * concatenated -- they go into the `params` array and reach MySQL as
 * bound parameters. So the SQL text can only ever be one of a few
 * shapes written in this file, and no caller input can add to it.
 * This pattern repeats in itemModel.findAll(); it is worth
 * recognising, because "build the SQL string from user input" is the
 * single most common way real applications get breached.
 *
 * THE COUNT IS OF *AVAILABLE* ITEMS ONLY.
 * A college showing "12 items" that turn out to be reserved or gone
 * is worse than showing 8, because the number is what the person is
 * deciding on. The status filter lives in the JOIN condition rather
 * than in WHERE, which matters: in WHERE it would discard colleges
 * whose items are all unavailable, turning the LEFT JOIN back into
 * an inner one and hiding those colleges completely.
 */
async function findColleges({ areaId, cityId } = {}) {
  const where = []
  const params = []

  if (areaId) {
    where.push('co.area_id = ?')
    params.push(areaId)
  }
  if (cityId) {
    where.push('a.city_id = ?')
    params.push(cityId)
  }

  const [rows] = await pool.execute(
    // co.area_id is deliberately NOT selected alongside a.id AS
    // area_id: two columns with the same alias collapse into one
    // property, and which of them survives is a detail of the
    // driver rather than something this file decides.
    `SELECT co.id, co.name, co.short_name, co.slug,
            a.id AS area_id, a.name AS area_name,
            c.id AS city_id, c.name AS city_name, c.state,
            COUNT(i.id) AS item_count
       FROM colleges co
       JOIN areas  a ON a.id = co.area_id
       JOIN cities c ON c.id = a.city_id
       LEFT JOIN items i
              ON i.college_id = co.id
             AND i.status = 'Available'
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY co.id
      ORDER BY co.short_name`,
    params,
  )
  return rows
}

/**
 * One college with its area and city resolved, or null.
 *
 * Used to render "SKIT Jaipur — Jagatpura, Jaipur" as a heading
 * after a college is chosen, and to verify that a ?college= id in a
 * URL is real before filtering on it.
 *
 * WHY THE FRONTEND MUST NOT JUST REMEMBER THE NAME IT DISPLAYED:
 * a shared or bookmarked link arrives with nothing but an id, and a
 * page that cannot name the college is a page that shows "items at
 * college 4".
 */
async function findCollegeById(id) {
  const [rows] = await pool.execute(
    `SELECT co.id, co.name, co.short_name, co.slug,
            co.description, co.image_url,
            a.id AS area_id, a.name AS area_name, a.slug AS area_slug,
            c.id AS city_id, c.name AS city_name, c.slug AS city_slug,
            c.state
       FROM colleges co
       JOIN areas  a ON a.id = co.area_id
       JOIN cities c ON c.id = a.city_id
      WHERE co.id = ?`,
    [id],
  )
  return rows[0] ?? null
}

/** One city by id, or null. Used to 404 an unknown /cities/:id/areas. */
async function findCityById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name, state, slug FROM cities WHERE id = ?',
    [id],
  )
  return rows[0] ?? null
}

/* ===================================================================
   ADMIN: WRITES TO THE LOCATION DIRECTORY
   ===================================================================
   Everything above reads. Everything below is reached only through
   /api/admin/locations/*, behind protect + requireAdmin.

   >>> WHY THE DIRECTORY IS EDITABLE AT ALL <<<
   Because the alternative is a seed file. A new campus wants to use
   the site, and someone has to add it -- either an admin types it into
   a form, or a developer edits seed-db.js, redeploys, and reseeds a
   production database. The second is not a workflow; it is a reason
   the college never gets added.

   >>> AND WHY DELETES ARE THE DANGEROUS PART <<<
   Read the foreign keys before touching anything here:

     areas.city_id      ON DELETE CASCADE   -> deleting a city takes
     colleges.area_id   ON DELETE CASCADE      its areas AND their colleges
     users.college_id   ON DELETE SET NULL  -> and quietly detaches
     items.college_id   ON DELETE SET NULL     every user and listing

   So `DELETE FROM cities WHERE id = 1` is not a small statement. It
   succeeds silently, cascades two levels, and strands every item that
   was listed at those campuses -- no error, no warning, nothing to
   undo it with. The database will not stop it, because SET NULL is a
   legitimate answer in other contexts.

   That is why every remove below is paired with a count of what
   depends on it, and the controller refuses with a 409 unless the
   admin explicitly confirms. The check has to live in the application
   precisely BECAUSE the constraint does not enforce it.
   =================================================================== */

/**
 * Turns 'Swami Keshvanand Institute of Technology' into
 * 'swami-keshvanand-institute-of-technology'.
 *
 * >>> WHY THE ADMIN IS NEVER ASKED FOR A SLUG <<<
 * It is a URL detail with a UNIQUE constraint on it, and a form field
 * that rejects your input for reasons you cannot see ("slug already
 * taken" -- what slug? you typed a college name) is a bad form. So the
 * slug is derived, made unique automatically, and never mentioned in
 * the UI.
 *
 * The normalise-then-strip order matters: NFKD decomposition turns
 * accented letters into a base letter plus a combining mark, and the
 * second replace removes the marks -- so 'Café' becomes 'cafe' rather
 * than 'caf'.
 */
function slugify(text) {
  return String(text)
    .normalize('NFKD')
    // U+0300..U+036F is the combining-diacritical-marks block that
    // NFKD just split the accents into. Written as escapes, not as
    // literal characters -- a combining mark pasted into source is
    // invisible in most editors and impossible to review.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'x' // '' would violate NOT NULL; a name of only
                          // punctuation is absurd but must not crash.
}

/**
 * `slugify(name)`, then -2, -3, ... until `isTaken` says no.
 *
 * `isTaken` is a callback rather than a table name, because the three
 * tables scope uniqueness differently: city and college slugs are
 * unique globally, an area's only within its city. Passing the check
 * in keeps that difference where it belongs -- at the call site that
 * knows about it -- instead of encoding three special cases here.
 *
 * The loop is bounded. An unbounded "until it works" is how a bug in
 * isTaken becomes a hung request rather than an error.
 */
async function uniqueSlug(name, isTaken) {
  const base = slugify(name)
  if (!(await isTaken(base))) return base

  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${base}-${n}`
    if (!(await isTaken(candidate))) return candidate
  }
  throw new Error(`locationModel: could not derive a unique slug from "${name}"`)
}

/* --- Cities ----------------------------------------------------- */

/**
 * Every city for the admin table, with the counts that make deletion
 * a decision rather than a guess.
 *
 * The items count reaches through areas AND colleges, which is why
 * COUNT(DISTINCT ...) is not optional here: three LEFT JOINs multiply
 * rows, so a city with 2 areas and 3 colleges would report its areas
 * six times over. DISTINCT counts the ids, not the join output.
 */
async function listCitiesForAdmin() {
  const [rows] = await pool.execute(
    `SELECT c.id, c.name, c.state, c.slug, c.created_at,
            COUNT(DISTINCT a.id)  AS area_count,
            COUNT(DISTINCT co.id) AS college_count,
            COUNT(DISTINCT i.id)  AS item_count
       FROM cities c
       LEFT JOIN areas    a  ON a.city_id    = c.id
       LEFT JOIN colleges co ON co.area_id   = a.id
       LEFT JOIN items    i  ON i.college_id = co.id
      GROUP BY c.id
      ORDER BY c.name`,
  )
  return rows
}

async function createCity({ name, state }) {
  const slug = await uniqueSlug(name, async (candidate) => {
    const [[{ n }]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM cities WHERE slug = ?', [candidate],
    )
    return n > 0
  })

  const [result] = await pool.execute(
    'INSERT INTO cities (name, state, slug) VALUES (?, ?, ?)',
    [name, state, slug],
  )
  return findCityById(result.insertId)
}

/**
 * Renames a city.
 *
 * >>> THE SLUG IS DELIBERATELY NOT REGENERATED <<<
 * A slug is a stable public identifier: /browse/jaipur may already be
 * bookmarked, linked from elsewhere, or sitting in someone's history.
 * Rewriting it on every rename would break those links silently, to
 * fix a cosmetic mismatch nobody sees. Correcting a typo in a NAME
 * should not invalidate a URL.
 */
async function updateCity(id, { name, state }) {
  const [result] = await pool.execute(
    'UPDATE cities SET name = ?, state = ? WHERE id = ?',
    [name, state, id],
  )
  return result.affectedRows > 0 ? findCityById(id) : null
}

/**
 * What a city deletion would take with it. The controller turns a
 * non-zero total into a 409 with these numbers in it, so the admin is
 * told "this removes 2 areas, 5 colleges and detaches 31 items"
 * instead of discovering it afterwards.
 */
async function cityDependants(id) {
  const [[row]] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM areas WHERE city_id = ?) AS areas,
       (SELECT COUNT(*) FROM colleges co
          JOIN areas a ON a.id = co.area_id
         WHERE a.city_id = ?) AS colleges,
       (SELECT COUNT(*) FROM items i
          JOIN colleges co ON co.id = i.college_id
          JOIN areas a ON a.id = co.area_id
         WHERE a.city_id = ?) AS items,
       (SELECT COUNT(*) FROM users u
          JOIN colleges co ON co.id = u.college_id
          JOIN areas a ON a.id = co.area_id
         WHERE a.city_id = ?) AS users`,
    [id, id, id, id],
  )
  return {
    areas: Number(row.areas),
    colleges: Number(row.colleges),
    items: Number(row.items),
    users: Number(row.users),
  }
}

async function removeCity(id) {
  const [result] = await pool.execute('DELETE FROM cities WHERE id = ?', [id])
  return result.affectedRows > 0
}

/* --- Areas ------------------------------------------------------ */

/** One area with its city resolved, or null. */
async function findAreaById(id) {
  const [rows] = await pool.execute(
    `SELECT a.id, a.name, a.slug, a.created_at,
            a.city_id, c.name AS city_name, c.state
       FROM areas a
       JOIN cities c ON c.id = a.city_id
      WHERE a.id = ?`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * Every area for the admin table, across all cities unless one is
 * named. Unlike the public findAreas(cityId), this is allowed to
 * return the whole list -- an admin looking for "which Civil Lines did
 * I mean?" needs to see both.
 */
async function listAreasForAdmin({ cityId } = {}) {
  const where = []
  const params = []
  if (cityId) {
    where.push('a.city_id = ?')
    params.push(cityId)
  }

  const [rows] = await pool.execute(
    `SELECT a.id, a.name, a.slug, a.created_at,
            a.city_id, c.name AS city_name, c.state,
            COUNT(DISTINCT co.id) AS college_count,
            COUNT(DISTINCT i.id)  AS item_count
       FROM areas a
       JOIN cities c ON c.id = a.city_id
       LEFT JOIN colleges co ON co.area_id   = a.id
       LEFT JOIN items    i  ON i.college_id = co.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY a.id
      ORDER BY c.name, a.name`,
    params,
  )
  return rows
}

async function createArea({ cityId, name }) {
  /* Area slugs are unique PER CITY (uq_areas_city_slug), so the check
     is scoped to the city -- 'civil-lines' in Jaipur and 'civil-lines'
     in Delhi are both correct, and forcing the second to be
     'civil-lines-2' would be a worse URL for no reason. */
  const slug = await uniqueSlug(name, async (candidate) => {
    const [[{ n }]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM areas WHERE city_id = ? AND slug = ?',
      [cityId, candidate],
    )
    return n > 0
  })

  const [result] = await pool.execute(
    'INSERT INTO areas (city_id, name, slug) VALUES (?, ?, ?)',
    [cityId, name, slug],
  )
  return findAreaById(result.insertId)
}

/**
 * Renames an area, and can move it to a different city.
 *
 * Moving is supported because the realistic mistake is filing a
 * locality under the wrong city, and the alternative -- delete and
 * recreate -- would CASCADE every college in it out of existence to
 * fix a one-field error.
 */
async function updateArea(id, { cityId, name }) {
  const [result] = await pool.execute(
    'UPDATE areas SET city_id = ?, name = ? WHERE id = ?',
    [cityId, name, id],
  )
  return result.affectedRows > 0 ? findAreaById(id) : null
}

async function areaDependants(id) {
  const [[row]] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM colleges WHERE area_id = ?) AS colleges,
       (SELECT COUNT(*) FROM items i
          JOIN colleges co ON co.id = i.college_id
         WHERE co.area_id = ?) AS items,
       (SELECT COUNT(*) FROM users u
          JOIN colleges co ON co.id = u.college_id
         WHERE co.area_id = ?) AS users`,
    [id, id, id],
  )
  return {
    colleges: Number(row.colleges),
    items: Number(row.items),
    users: Number(row.users),
  }
}

async function removeArea(id) {
  const [result] = await pool.execute('DELETE FROM areas WHERE id = ?', [id])
  return result.affectedRows > 0
}

/* --- Colleges --------------------------------------------------- */

/**
 * One page of colleges for the admin table.
 *
 * Paginated where cities and areas are not, because this is the list
 * that grows: a working deployment has a handful of cities and
 * hundreds of campuses.
 */
async function listCollegesForAdmin({ page, limit, offset }, filters = {}) {
  const where = []
  const params = []

  if (filters.areaId) {
    where.push('co.area_id = ?')
    params.push(filters.areaId)
  }
  if (filters.cityId) {
    where.push('a.city_id = ?')
    params.push(filters.cityId)
  }
  if (filters.search) {
    where.push('(co.name LIKE ? OR co.short_name LIKE ?)')
    const like = `%${filters.search}%`
    params.push(like, like)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [rows] = await pool.execute(
    /* item_count here counts ALL items, not just Available ones --
       the opposite of the public findColleges(). An admin deciding
       whether a campus can be deleted needs the true number of rows
       that would be detached; a browsing user wants to know what they
       can actually still get. Same column, two different questions. */
    `SELECT co.id, co.name, co.short_name, co.slug,
            co.description, co.image_url, co.created_at,
            a.id AS area_id, a.name AS area_name,
            c.id AS city_id, c.name AS city_name, c.state,
            (SELECT COUNT(*) FROM items i WHERE i.college_id = co.id) AS item_count,
            (SELECT COUNT(*) FROM users u WHERE u.college_id = co.id) AS user_count
       FROM colleges co
       JOIN areas  a ON a.id = co.area_id
       JOIN cities c ON c.id = a.city_id
       ${clause}
      ORDER BY co.short_name
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  )

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total
       FROM colleges co
       JOIN areas  a ON a.id = co.area_id
       JOIN cities c ON c.id = a.city_id
       ${clause}`,
    params,
  )

  return { rows, total: Number(total), page, limit }
}

/**
 * Adds a college.
 *
 * description and image_url default to NULL and STAY null unless an
 * admin supplies them. See the note on those columns in schema.sql:
 * inventing a description or finding "a picture that looks like a
 * campus" would put wrong information about a real institution on the
 * site, so the honest default is to say nothing.
 */
async function createCollege({ areaId, name, shortName, description = null, imageUrl = null }) {
  const slug = await uniqueSlug(name, async (candidate) => {
    const [[{ n }]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM colleges WHERE slug = ?', [candidate],
    )
    return n > 0
  })

  const [result] = await pool.execute(
    `INSERT INTO colleges (area_id, name, short_name, slug, description, image_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [areaId, name, shortName, slug, description, imageUrl],
  )
  return findCollegeById(result.insertId)
}

/**
 * Edits a college. Can also move it to a different area, for the same
 * reason updateArea can move a city: the fix for "filed under the
 * wrong locality" must not be a delete that cascades.
 *
 * Note that the SET clause has no slot for `slug` -- see updateCity.
 */
async function updateCollege(id, { areaId, name, shortName, description = null, imageUrl = null }) {
  const [result] = await pool.execute(
    `UPDATE colleges
        SET area_id = ?, name = ?, short_name = ?, description = ?, image_url = ?
      WHERE id = ?`,
    [areaId, name, shortName, description, imageUrl, id],
  )
  return result.affectedRows > 0 ? findCollegeById(id) : null
}

/**
 * What a college deletion detaches. Both FKs are ON DELETE SET NULL,
 * so nothing is destroyed -- but every listing at that campus loses
 * its college, keeping only the free-text `location` sentence, and
 * that is not reversible by re-adding the college afterwards.
 */
async function collegeDependants(id) {
  const [[row]] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM items WHERE college_id = ?) AS items,
       (SELECT COUNT(*) FROM users WHERE college_id = ?) AS users`,
    [id, id],
  )
  return { items: Number(row.items), users: Number(row.users) }
}

async function removeCollege(id) {
  const [result] = await pool.execute('DELETE FROM colleges WHERE id = ?', [id])
  return result.affectedRows > 0
}

module.exports = {
  findCities,
  findAreas,
  findColleges,
  findCollegeById,
  findCityById,
  // admin
  slugify,
  listCitiesForAdmin,
  createCity,
  updateCity,
  cityDependants,
  removeCity,
  findAreaById,
  listAreasForAdmin,
  createArea,
  updateArea,
  areaDependants,
  removeArea,
  listCollegesForAdmin,
  createCollege,
  updateCollege,
  collegeDependants,
  removeCollege,
}
