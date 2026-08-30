const { prisma } = require('../lib/prisma')
const cache = require('../lib/cache')
const config = require('../config/env')

const DEFAULT_GLYPH = '📦'

function slugify(text) {
  return (
    String(text)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'x'
  )
}

async function uniqueSlug(model, name, ignoreId = null) {
  const base = slugify(name)
  const taken = async (candidate) => {
    const row = await model.findUnique({ where: { slug: candidate }, select: { id: true } })
    return Boolean(row) && row.id !== ignoreId
  }
  if (!(await taken(base))) return base
  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${base}-${n}`.slice(0, 60)
    if (!(await taken(candidate))) return candidate
  }
  throw new Error(`taxonomyModel: could not derive a unique slug from "${name}"`)
}

function mapCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    glyph: row.glyph || DEFAULT_GLYPH,
    tint: row.tint,
    sort_order: row.sort_order,
    is_active: row.is_active,
    item_count: row._count ? row._count : undefined,
  }
}

function mapCondition(row) {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    sort_order: row.sort_order,
    is_active: row.is_active,
  }
}

/* --- Reads (cached; these are on the hot path for every item write) ----- */

async function loadActiveCategories() {
  const rows = await prisma.category.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
  })
  return rows.map(mapCategory)
}

async function loadActiveConditions() {
  const rows = await prisma.condition.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  })
  return rows.map(mapCondition)
}

async function activeCategories() {
  if (config.isTest) return loadActiveCategories()
  return cache.wrap(cache.KEYS.categories, config.redis.ttl.taxonomy, loadActiveCategories)
}

async function activeConditions() {
  if (config.isTest) return loadActiveConditions()
  return cache.wrap(cache.KEYS.conditions, config.redis.ttl.taxonomy, loadActiveConditions)
}

/** The labels a new or edited listing may use. Replaces the old hardcoded
    itemModel.CATEGORIES array that validators checked against. */
async function categoryLabels() {
  return (await activeCategories()).map((c) => c.label)
}

async function conditionLabels() {
  return (await activeConditions()).map((c) => c.label)
}

/* --- Admin listings (include inactive rows and usage counts) ------------ */

async function listCategoriesForAdmin() {
  const rows = await prisma.category.findMany({
    orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
  })
  // Usage is counted by label because that is what items store.
  const counts = await prisma.item.groupBy({ by: ['category'], _count: { _all: true } })
  const byLabel = new Map(counts.map((c) => [c.category, c._count._all]))
  return rows.map((r) => ({ ...mapCategory(r), item_count: byLabel.get(r.label) ?? 0 }))
}

async function listConditionsForAdmin() {
  const rows = await prisma.condition.findMany({
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  })
  const counts = await prisma.item.groupBy({ by: ['item_condition'], _count: { _all: true } })
  const byLabel = new Map(counts.map((c) => [c.item_condition, c._count._all]))
  return rows.map((r) => ({ ...mapCondition(r), item_count: byLabel.get(r.label) ?? 0 }))
}

async function findCategoryById(id) {
  const row = await prisma.category.findUnique({ where: { id } })
  return row ? mapCategory(row) : null
}

async function findConditionById(id) {
  const row = await prisma.condition.findUnique({ where: { id } })
  return row ? mapCondition(row) : null
}

/** Rejects a duplicate label among ACTIVE rows. See the note at the top. */
async function enforceUniqueLabel(model, label, ignoreId = null) {
  const clash = await model.findFirst({
    where: {
      label,
      is_active: true,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    select: { id: true },
  })
  if (clash) {
    const err = new Error(`"${label}" is already in use`)
    err.code = 'DUPLICATE_LABEL'
    throw err
  }
}

async function nextSortOrder(model) {
  const last = await model.findFirst({ orderBy: { sort_order: 'desc' }, select: { sort_order: true } })
  return (last?.sort_order ?? 0) + 10
}

/* --- Category writes ---------------------------------------------------- */

async function createCategory({ label, glyph, tint, sortOrder }) {
  await enforceUniqueLabel(prisma.category, label)
  const created = await prisma.category.create({
    data: {
      slug: await uniqueSlug(prisma.category, label),
      label,
      glyph: glyph || DEFAULT_GLYPH,
      tint: tint || 'other',
      sort_order: sortOrder ?? (await nextSortOrder(prisma.category)),
    },
  })
  await cache.bustAll()
  return mapCategory(created)
}

async function updateCategory(id, { label, glyph, tint, sortOrder, isActive }) {
  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) return null

  if (label && label !== existing.label) {
    await enforceUniqueLabel(prisma.category, label, id)
  }

  const data = {}
  if (label !== undefined) data.label = label
  if (glyph !== undefined) data.glyph = glyph || DEFAULT_GLYPH
  if (tint !== undefined) data.tint = tint
  if (sortOrder !== undefined) data.sort_order = sortOrder
  if (isActive !== undefined) data.is_active = isActive

  const renamed = label !== undefined && label !== existing.label

  const [updated] = await prisma.$transaction([
    prisma.category.update({ where: { id }, data }),
    ...(renamed
      ? [prisma.item.updateMany({ where: { category: existing.label }, data: { category: label } })]
      : []),
  ])

  await cache.bustAll()
  return mapCategory(updated)
}

/** How many listings still use this category's label. */
async function categoryUsage(id) {
  const row = await prisma.category.findUnique({ where: { id }, select: { label: true } })
  if (!row) return null
  return prisma.item.count({ where: { category: row.label } })
}

async function removeCategory(id) {
  const { count } = await prisma.category.deleteMany({ where: { id } })
  await cache.bustAll()
  return count > 0
}

/* --- Condition writes --------------------------------------------------- */

async function createCondition({ label, sortOrder }) {
  await enforceUniqueLabel(prisma.condition, label)
  const created = await prisma.condition.create({
    data: {
      slug: await uniqueSlug(prisma.condition, label),
      label,
      sort_order: sortOrder ?? (await nextSortOrder(prisma.condition)),
    },
  })
  await cache.bustAll()
  return mapCondition(created)
}

async function updateCondition(id, { label, sortOrder, isActive }) {
  const existing = await prisma.condition.findUnique({ where: { id } })
  if (!existing) return null

  if (label && label !== existing.label) {
    await enforceUniqueLabel(prisma.condition, label, id)
  }

  const data = {}
  if (label !== undefined) data.label = label
  if (sortOrder !== undefined) data.sort_order = sortOrder
  if (isActive !== undefined) data.is_active = isActive

  const renamed = label !== undefined && label !== existing.label

  const [updated] = await prisma.$transaction([
    prisma.condition.update({ where: { id }, data }),
    ...(renamed
      ? [prisma.item.updateMany({ where: { item_condition: existing.label }, data: { item_condition: label } })]
      : []),
  ])

  await cache.bustAll()
  return mapCondition(updated)
}

async function conditionUsage(id) {
  const row = await prisma.condition.findUnique({ where: { id }, select: { label: true } })
  if (!row) return null
  return prisma.item.count({ where: { item_condition: row.label } })
}

async function removeCondition(id) {
  const { count } = await prisma.condition.deleteMany({ where: { id } })
  await cache.bustAll()
  return count > 0
}

module.exports = {
  DEFAULT_GLYPH,
  slugify,
  activeCategories,
  activeConditions,
  categoryLabels,
  conditionLabels,
  listCategoriesForAdmin,
  listConditionsForAdmin,
  findCategoryById,
  findConditionById,
  createCategory,
  updateCategory,
  categoryUsage,
  removeCategory,
  createCondition,
  updateCondition,
  conditionUsage,
  removeCondition,
}
