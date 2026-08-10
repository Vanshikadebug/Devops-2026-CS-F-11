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

module.exports = {
  findCities,
  findAreas,
  findColleges,
  findCollegeById,
  findCityById,
}
