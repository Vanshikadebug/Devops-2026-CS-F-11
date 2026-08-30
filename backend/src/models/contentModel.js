const { prisma } = require('../lib/prisma')
const cache = require('../lib/cache')
const config = require('../config/env')

/* Navbar/footer links and social links, so the chrome around the site is
   editable rather than hardcoded in JSX. */

const PLACEMENTS = ['header', 'footer']

function mapNav(row) {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    placement: row.placement,
    sort_order: row.sort_order,
    is_active: row.is_active,
  }
}

function mapSocial(row) {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    icon: row.icon,
    sort_order: row.sort_order,
    is_active: row.is_active,
  }
}

async function nextSortOrder(model, where = {}) {
  const last = await model.findFirst({ where, orderBy: { sort_order: 'desc' }, select: { sort_order: true } })
  return (last?.sort_order ?? 0) + 10
}

/* --- Nav links ---------------------------------------------------------- */

async function loadActiveNavLinks() {
  const rows = await prisma.navLink.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  })
  // Grouped by placement so the frontend does not filter the same array twice.
  return {
    header: rows.filter((r) => r.placement === 'header').map(mapNav),
    footer: rows.filter((r) => r.placement === 'footer').map(mapNav),
  }
}

async function activeNavLinks() {
  if (config.isTest) return loadActiveNavLinks()
  return cache.wrap(cache.KEYS.navLinks, config.redis.ttl.config, loadActiveNavLinks)
}

async function listNavLinksForAdmin() {
  const rows = await prisma.navLink.findMany({
    orderBy: [{ placement: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
  })
  return rows.map(mapNav)
}

async function findNavLinkById(id) {
  const row = await prisma.navLink.findUnique({ where: { id } })
  return row ? mapNav(row) : null
}

async function createNavLink({ label, href, placement = 'header', sortOrder }) {
  const created = await prisma.navLink.create({
    data: {
      label,
      href,
      placement,
      sort_order: sortOrder ?? (await nextSortOrder(prisma.navLink, { placement })),
    },
  })
  await cache.bustAll()
  return mapNav(created)
}

async function updateNavLink(id, { label, href, placement, sortOrder, isActive }) {
  const data = {}
  if (label !== undefined) data.label = label
  if (href !== undefined) data.href = href
  if (placement !== undefined) data.placement = placement
  if (sortOrder !== undefined) data.sort_order = sortOrder
  if (isActive !== undefined) data.is_active = isActive

  const { count } = await prisma.navLink.updateMany({ where: { id }, data })
  await cache.bustAll()
  return count > 0 ? findNavLinkById(id) : null
}

async function removeNavLink(id) {
  const { count } = await prisma.navLink.deleteMany({ where: { id } })
  await cache.bustAll()
  return count > 0
}

/* --- Social links ------------------------------------------------------- */

async function loadActiveSocialLinks() {
  const rows = await prisma.socialLink.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  })
  return rows.map(mapSocial)
}

async function activeSocialLinks() {
  if (config.isTest) return loadActiveSocialLinks()
  return cache.wrap(cache.KEYS.socialLinks, config.redis.ttl.config, loadActiveSocialLinks)
}

async function listSocialLinksForAdmin() {
  const rows = await prisma.socialLink.findMany({
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  })
  return rows.map(mapSocial)
}

async function findSocialLinkById(id) {
  const row = await prisma.socialLink.findUnique({ where: { id } })
  return row ? mapSocial(row) : null
}

async function createSocialLink({ platform, url, icon, sortOrder }) {
  const created = await prisma.socialLink.create({
    data: {
      platform,
      url,
      icon: icon || 'link',
      sort_order: sortOrder ?? (await nextSortOrder(prisma.socialLink)),
    },
  })
  await cache.bustAll()
  return mapSocial(created)
}

async function updateSocialLink(id, { platform, url, icon, sortOrder, isActive }) {
  const data = {}
  if (platform !== undefined) data.platform = platform
  if (url !== undefined) data.url = url
  if (icon !== undefined) data.icon = icon || 'link'
  if (sortOrder !== undefined) data.sort_order = sortOrder
  if (isActive !== undefined) data.is_active = isActive

  const { count } = await prisma.socialLink.updateMany({ where: { id }, data })
  await cache.bustAll()
  return count > 0 ? findSocialLinkById(id) : null
}

async function removeSocialLink(id) {
  const { count } = await prisma.socialLink.deleteMany({ where: { id } })
  await cache.bustAll()
  return count > 0
}

module.exports = {
  PLACEMENTS,
  activeNavLinks,
  listNavLinksForAdmin,
  findNavLinkById,
  createNavLink,
  updateNavLink,
  removeNavLink,
  activeSocialLinks,
  listSocialLinksForAdmin,
  findSocialLinkById,
  createSocialLink,
  updateSocialLink,
  removeSocialLink,
}
