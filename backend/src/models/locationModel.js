const { Prisma } = require('@prisma/client')
const { prisma } = require('../lib/prisma')
const { clampLimitOffset } = require('../utils/pagination')
const { formatDates } = require('../utils/sqlDateTime')
const { normaliseRawRows } = require('../utils/rawRows')
const escapeLike = require('../utils/escapeLike')

/** Wraps a LIKE term so wildcards typed by a user are matched literally. */
const like = (term) => `%${escapeLike(term)}%`

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

function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'x' // '' would violate NOT NULL; a name of only
                          // punctuation is absurd but must not crash.
}

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

async function updateCity(id, { name, state }) {
  const { count } = await prisma.city.updateMany({
    where: { id },
    data: { name, state },
  })
  return count > 0 ? findCityById(id) : null
}

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
  const slug = await uniqueSlug(name, async (candidate) => {
    return (await prisma.area.count({ where: { city_id: cityId, slug: candidate } })) > 0
  })

  const created = await prisma.area.create({
    data: { city_id: cityId, name, slug },
    select: { id: true },
  })
  return findAreaById(created.id)
}

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
