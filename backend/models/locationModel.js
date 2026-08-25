/**
 * models/locationModel.js -- everything that touches `cities`, `areas`
 * and `colleges`.
 *
 * The browse page asks three questions in order:
 *
 *     which cities exist?          -> findCities()
 *     which areas are in Jaipur?   -> findAreas(cityId)
 *     which colleges in Jagatpura? -> findColleges({ areaId })
 *
 * >>> WHY THESE LISTS COME FROM THE LOCATION TABLES, NOT FROM items <<<
 * The tempting shortcut is `SELECT DISTINCT location FROM items`. It
 * needs no new tables and it is quietly broken: it can only list places
 * that already have something listed. A college nobody has posted to
 * never appears in the dropdown, so nobody can select it, so nobody can
 * be the first to list there. The empty campus is unreachable forever.
 *
 * Reading from a directory table means a college exists as soon as it is
 * added, and its item_count is then a genuine fact -- including,
 * legitimately, zero.
 *
 * >>> WHY SOME READS HERE ARE STILL HAND-WRITTEN SQL <<<
 * The aggregate lists count across two or three levels at once (a city's
 * items reach through areas AND colleges). Expressing that through the
 * query builder means pulling whole object trees into Node and summing
 * them in JavaScript -- more code, and it moves work off the database
 * that the database is better at. $queryRaw still parameterises every
 * value via tagged templates, so this is a readability choice, not a
 * safety one. Plain CRUD below uses the builder, where it genuinely wins.
 */

const { Prisma } = require('@prisma/client')
const { prisma } = require('../config/prisma')
const { clampLimitOffset } = require('../utils/pagination')
const { formatDates } = require('../utils/sqlDateTime')
const { normaliseRawRows } = require('../utils/rawRows')
const escapeLike = require('../utils/escapeLike')

/** Wraps a LIKE term so wildcards typed by a user are matched literally. */
const like = (term) => `%${escapeLike(term)}%`

/**
 * Every city, alphabetically, with how many colleges it holds.
 *
 * ORDER BY name, not id: insertion order is an accident of the seed file.
 * Someone looking for "Kota" scans alphabetically; nobody scans by
 * primary key.
 *
 * LEFT JOIN, not JOIN: a plain join drops a city with no areas yet. That
 * city is real, it is simply new -- and hiding it is the same bug as
 * building the list from items.
 */
async function findCities() {
  const rows = await prisma.$queryRaw`
    SELECT c.id, c.name, c.state, c.slug,
           COUNT(co.id) AS college_count
      FROM cities c
      LEFT JOIN areas    a  ON a.city_id  = c.id
      LEFT JOIN colleges co ON co.area_id = a.id
     GROUP BY c.id
     ORDER BY c.name`

  return normaliseRawRows(rows)
}

/**
 * The areas of ONE city, with a college count each.
 *
 * Returns [] for a city id that does not exist. That is not an error this
 * model should decide about: "this city has no areas" and "there is no
 * such city" are the same empty list to SQL, and the controller checks
 * the city separately when the distinction matters.
 */
async function findAreas(cityId) {
  const rows = await prisma.area.findMany({
    where: { city_id: cityId },
    select: {
      id: true,
      city_id: true,
      name: true,
      slug: true,
      _count: { select: { colleges: true } },
    },
    orderBy: { name: 'asc' },
  })

  return rows.map(({ _count, ...rest }) => ({ ...rest, college_count: _count.colleges }))
}

/**
 * Colleges, filtered by area OR by city, each with a live count of the
 * items currently available there.
 *
 * ONE function for two filters because the UI wants "colleges in
 * Jagatpura" while stepping through the picker, but "every college in
 * Jaipur" when someone skips the area step. Same query, different filter.
 *
 * THE COUNT IS OF *AVAILABLE* ITEMS ONLY. A college showing "12 items"
 * that turn out to be reserved or gone is worse than showing 8, because
 * the number is what the person is deciding on. Note this is a filtered
 * relation count, not a filter on the college: filtering the colleges by
 * item status would hide any campus whose items are all unavailable.
 */
async function findColleges({ areaId, cityId } = {}) {
  const where = {}
  if (areaId) where.area_id = areaId
  if (cityId) where.area = { city_id: cityId }

  const rows = await prisma.college.findMany({
    where,
    select: {
      id: true,
      name: true,
      short_name: true,
      slug: true,
      area: { select: { id: true, name: true, city: { select: { id: true, name: true, state: true } } } },
      _count: { select: { items: { where: { status: 'Available' } } } },
    },
    orderBy: { short_name: 'asc' },
  })

  return rows.map(({ area, _count, ...rest }) => ({
    ...rest,
    area_id: area.id,
    area_name: area.name,
    city_id: area.city.id,
    city_name: area.city.name,
    state: area.city.state,
    item_count: _count.items,
  }))
}

/**
 * One college with its area and city resolved, or null.
 *
 * Used to render "SKIT Jaipur — Jagatpura, Jaipur" as a heading, and to
 * verify a ?college= id from a URL is real before filtering on it. The
 * frontend cannot just remember the name it displayed: a shared or
 * bookmarked link arrives with nothing but an id, and a page that cannot
 * name the college shows "items at college 4".
 */
async function findCollegeById(id) {
  const row = await prisma.college.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      short_name: true,
      slug: true,
      description: true,
      image_url: true,
      area: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: { select: { id: true, name: true, slug: true, state: true } },
        },
      },
    },
  })
  if (!row) return null

  const { area, ...rest } = row
  return {
    ...rest,
    area_id: area.id,
    area_name: area.name,
    area_slug: area.slug,
    city_id: area.city.id,
    city_name: area.city.name,
    city_slug: area.city.slug,
    state: area.city.state,
  }
}

/** One city by id, or null. Used to 404 an unknown /cities/:id/areas. */
async function findCityById(id) {
  return prisma.city.findUnique({
    where: { id },
    select: { id: true, name: true, state: true, slug: true },
  })
}

/* ===================================================================
   ADMIN: WRITES TO THE LOCATION DIRECTORY
   ===================================================================
   Everything above reads. Everything below is reached only through
   /api/admin/locations/*, behind protect + requireAdmin.

   >>> WHY THE DIRECTORY IS EDITABLE AT ALL <<<
   Because the alternative is a seed file. A new campus wants to use the
   site and someone has to add it -- either an admin types it into a
   form, or a developer edits the seed, redeploys, and reseeds a
   production database. The second is not a workflow; it is the reason
   the college never gets added.

   >>> AND WHY DELETES ARE THE DANGEROUS PART <<<
   Read the foreign keys before touching anything here:

     areas.city_id      ON DELETE CASCADE   -> deleting a city takes its
     colleges.area_id   ON DELETE CASCADE      areas AND their colleges
     users.college_id   ON DELETE SET NULL  -> and quietly detaches every
     items.college_id   ON DELETE SET NULL     user and listing

   So deleting one city cascades two levels and strands every item listed
   at those campuses -- no error, no warning, nothing to undo it with.
   The database will not stop it, because SET NULL is legitimate
   elsewhere. That is why every remove below is paired with a count of
   what depends on it, and the controller refuses with a 409 unless the
   admin confirms. The check lives in the application precisely BECAUSE
   the constraint does not enforce it.
   =================================================================== */

/**
 * Turns 'Swami Keshvanand Institute of Technology' into
 * 'swami-keshvanand-institute-of-technology'.
 *
 * >>> WHY THE ADMIN IS NEVER ASKED FOR A SLUG <<<
 * It is a URL detail with a UNIQUE constraint on it, and a form field
 * that rejects your input for reasons you cannot see ("slug already
 * taken" -- what slug? you typed a college name) is a bad form. So it is
 * derived, made unique automatically, and never mentioned in the UI.
 *
 * The normalise-then-strip order matters: NFKD splits an accented letter
 * into a base letter plus a combining mark, and the second replace
 * removes the marks -- so 'Café' becomes 'cafe' rather than 'caf'.
 */
function slugify(text) {
  return String(text)
    .normalize('NFKD')
    // U+0300..U+036F is the combining-diacritical-marks block NFKD just
    // split the accents into. Written as escapes, not literal
    // characters -- a combining mark pasted into source is invisible in
    // most editors and impossible to review.
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
 * `isTaken` is a callback rather than a table name because the three
 * tables scope uniqueness differently: city and college slugs are unique
 * globally, an area's only within its city. Passing the check in keeps
 * that difference at the call site that knows about it.
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
 * Every city for the admin table, with the counts that make deletion a
 * decision rather than a guess.
 *
 * COUNT(DISTINCT) is not optional: three LEFT JOINs multiply rows, so a
 * city with 2 areas and 3 colleges would otherwise report its areas six
 * times over. DISTINCT counts ids, not join output.
 */
async function listCitiesForAdmin() {
  const rows = await prisma.$queryRaw`
    SELECT c.id, c.name, c.state, c.slug, c.created_at,
           COUNT(DISTINCT a.id)  AS area_count,
           COUNT(DISTINCT co.id) AS college_count,
           COUNT(DISTINCT i.id)  AS item_count
      FROM cities c
      LEFT JOIN areas    a  ON a.city_id    = c.id
      LEFT JOIN colleges co ON co.area_id   = a.id
      LEFT JOIN items    i  ON i.college_id = co.id
     GROUP BY c.id
     ORDER BY c.name`

  return normaliseRawRows(rows, ['created_at'])
}

async function createCity({ name, state }) {
  const slug = await uniqueSlug(name, async (candidate) => {
    return (await prisma.city.count({ where: { slug: candidate } })) > 0
  })

  const created = await prisma.city.create({
    data: { name, state, slug },
    select: { id: true },
  })
  return findCityById(created.id)
}

/**
 * Renames a city.
 *
 * >>> THE SLUG IS DELIBERATELY NOT REGENERATED <<<
 * A slug is a stable public identifier: /browse/jaipur may already be
 * bookmarked, linked from elsewhere, or in someone's history. Rewriting
 * it on every rename would break those links silently, to fix a cosmetic
 * mismatch nobody sees. Correcting a typo in a NAME should not
 * invalidate a URL.
 *
 * updateMany, not update: update throws when the id does not exist,
 * while this needs to answer null. `count` is the affectedRows the raw
 * version checked.
 */
async function updateCity(id, { name, state }) {
  const { count } = await prisma.city.updateMany({
    where: { id },
    data: { name, state },
  })
  return count > 0 ? findCityById(id) : null
}

/**
 * What a city deletion would take with it. The controller turns a
 * non-zero total into a 409 carrying these numbers, so the admin is told
 * "this removes 2 areas, 5 colleges and detaches 31 items" instead of
 * discovering it afterwards.
 */
async function cityDependants(id) {
  const [areas, colleges, items, users] = await Promise.all([
    prisma.area.count({ where: { city_id: id } }),
    prisma.college.count({ where: { area: { city_id: id } } }),
    prisma.item.count({ where: { college: { area: { city_id: id } } } }),
    prisma.user.count({ where: { college: { area: { city_id: id } } } }),
  ])
  return { areas, colleges, items, users }
}

async function removeCity(id) {
  const { count } = await prisma.city.deleteMany({ where: { id } })
  return count > 0
}

/* --- Areas ------------------------------------------------------ */

/** One area with its city resolved, or null. */
async function findAreaById(id) {
  const row = await prisma.area.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      created_at: true,
      city_id: true,
      city: { select: { name: true, state: true } },
    },
  })
  if (!row) return null

  const { city, ...rest } = row
  return formatDates({ ...rest, city_name: city.name, state: city.state }, ['created_at'])
}

/**
 * Every area for the admin table, across all cities unless one is named.
 * Unlike the public findAreas(cityId) this may return the whole list --
 * an admin asking "which Civil Lines did I mean?" needs to see both.
 */
async function listAreasForAdmin({ cityId } = {}) {
  const filter = cityId ? Prisma.sql`WHERE a.city_id = ${cityId}` : Prisma.empty

  const rows = await prisma.$queryRaw`
    SELECT a.id, a.name, a.slug, a.created_at,
           a.city_id, c.name AS city_name, c.state,
           COUNT(DISTINCT co.id) AS college_count,
           COUNT(DISTINCT i.id)  AS item_count
      FROM areas a
      JOIN cities c ON c.id = a.city_id
      LEFT JOIN colleges co ON co.area_id   = a.id
      LEFT JOIN items    i  ON i.college_id = co.id
     ${filter}
     GROUP BY a.id
     ORDER BY c.name, a.name`

  return normaliseRawRows(rows, ['created_at'])
}

async function createArea({ cityId, name }) {
  /* Area slugs are unique PER CITY (uq_areas_city_slug), so the check is
     scoped to the city -- 'civil-lines' in Jaipur and 'civil-lines' in
     Delhi are both correct, and forcing the second to 'civil-lines-2'
     would be a worse URL for no reason. */
  const slug = await uniqueSlug(name, async (candidate) => {
    return (await prisma.area.count({ where: { city_id: cityId, slug: candidate } })) > 0
  })

  const created = await prisma.area.create({
    data: { city_id: cityId, name, slug },
    select: { id: true },
  })
  return findAreaById(created.id)
}

/**
 * Renames an area, and can move it to a different city.
 *
 * Moving is supported because the realistic mistake is filing a locality
 * under the wrong city, and the alternative -- delete and recreate --
 * would CASCADE every college in it out of existence to fix a one-field
 * error.
 */
async function updateArea(id, { cityId, name }) {
  const { count } = await prisma.area.updateMany({
    where: { id },
    data: { city_id: cityId, name },
  })
  return count > 0 ? findAreaById(id) : null
}

async function areaDependants(id) {
  const [colleges, items, users] = await Promise.all([
    prisma.college.count({ where: { area_id: id } }),
    prisma.item.count({ where: { college: { area_id: id } } }),
    prisma.user.count({ where: { college: { area_id: id } } }),
  ])
  return { colleges, items, users }
}

async function removeArea(id) {
  const { count } = await prisma.area.deleteMany({ where: { id } })
  return count > 0
}

/* --- Colleges --------------------------------------------------- */

/**
 * One page of colleges for the admin table. Paginated where cities and
 * areas are not, because this is the list that grows: a working
 * deployment has a handful of cities and hundreds of campuses.
 */
async function listCollegesForAdmin({ page, limit, offset }, filters = {}) {
  const where = {}
  if (filters.areaId) where.area_id = filters.areaId
  if (filters.cityId) where.area = { city_id: filters.cityId }
  if (filters.search) {
    // escapeLike so a search for "St. Xavier_" treats the _ as text, not
    // as a single-character wildcard over the whole directory.
    const term = like(filters.search)
    where.OR = [{ name: { contains: term } }, { short_name: { contains: term } }]
  }

  const { limit: safeLimit, offset: safeOffset } = clampLimitOffset(limit, offset)

  const [rows, total] = await Promise.all([
    prisma.college.findMany({
      where,
      select: {
        id: true,
        name: true,
        short_name: true,
        slug: true,
        description: true,
        image_url: true,
        created_at: true,
        area: { select: { id: true, name: true, city: { select: { id: true, name: true, state: true } } } },
        /* Counts ALL items, unlike the public findColleges() which counts
           only Available ones. An admin deciding whether a campus can be
           deleted needs the true number of rows that would be detached; a
           browsing user wants to know what they can still get. Same
           column, two different questions. */
        _count: { select: { items: true, users: true } },
      },
      orderBy: { short_name: 'asc' },
      take: safeLimit,
      skip: safeOffset,
    }),
    prisma.college.count({ where }),
  ])

  const mapped = rows.map(({ area, _count, ...rest }) =>
    formatDates(
      {
        ...rest,
        area_id: area.id,
        area_name: area.name,
        city_id: area.city.id,
        city_name: area.city.name,
        state: area.city.state,
        item_count: _count.items,
        user_count: _count.users,
      },
      ['created_at'],
    ),
  )

  return { rows: mapped, total: Number(total), page, limit: safeLimit }
}

/**
 * Adds a college.
 *
 * description and image_url default to NULL and STAY null unless an
 * admin supplies them: inventing a description, or finding "a picture
 * that looks like a campus", would put wrong information about a real
 * institution on the site. The honest default is to say nothing.
 */
async function createCollege({ areaId, name, shortName, description = null, imageUrl = null }) {
  const slug = await uniqueSlug(name, async (candidate) => {
    return (await prisma.college.count({ where: { slug: candidate } })) > 0
  })

  const created = await prisma.college.create({
    data: {
      area_id: areaId,
      name,
      short_name: shortName,
      slug,
      description,
      image_url: imageUrl,
    },
    select: { id: true },
  })
  return findCollegeById(created.id)
}

/**
 * Edits a college, and can move it to a different area -- same reason
 * updateArea can move a city: the fix for "filed under the wrong
 * locality" must not be a delete that cascades.
 *
 * Note there is no slot for `slug` here. See updateCity.
 */
async function updateCollege(id, { areaId, name, shortName, description = null, imageUrl = null }) {
  const { count } = await prisma.college.updateMany({
    where: { id },
    data: {
      area_id: areaId,
      name,
      short_name: shortName,
      description,
      image_url: imageUrl,
    },
  })
  return count > 0 ? findCollegeById(id) : null
}

/**
 * What a college deletion detaches. Both FKs are ON DELETE SET NULL, so
 * nothing is destroyed -- but every listing at that campus loses its
 * college, keeping only the free-text `location` sentence, and that is
 * not reversible by re-adding the college afterwards.
 */
async function collegeDependants(id) {
  const [items, users] = await Promise.all([
    prisma.item.count({ where: { college_id: id } }),
    prisma.user.count({ where: { college_id: id } }),
  ])
  return { items, users }
}

async function removeCollege(id) {
  const { count } = await prisma.college.deleteMany({ where: { id } })
  return count > 0
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
