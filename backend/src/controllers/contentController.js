const contentModel = require('../models/contentModel')
const auditModel = require('../models/auditModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/* Admin CRUD for navbar/footer links and social links -- the chrome that used
   to be hardcoded in JSX. */

function parseId(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.badRequest('id must be a positive whole number')
  }
  return n
}

function text(raw, field, max) {
  const value = String(raw ?? '').trim()
  if (!value || value.length > max) {
    throw ApiError.badRequest(`${field} is required and must be at most ${max} characters`)
  }
  return value
}

function href(raw) {
  const value = String(raw ?? '').trim()
  if (!value || value.length > 200) {
    throw ApiError.badRequest('Link target is required and must be at most 200 characters')
  }
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    if (new URL(value).protocol === 'https:') return value
  } catch {
    /* fall through */
  }
  throw ApiError.badRequest('Link must be an internal path like /items or an https:// URL')
}

function optionalInt(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isInteger(n)) throw ApiError.badRequest('sortOrder must be a whole number')
  return n
}

function optionalBool(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined
  return raw === true || raw === 'true' || raw === 1 || raw === '1'
}

function placement(raw) {
  if (raw === undefined || raw === '') return undefined
  if (!contentModel.PLACEMENTS.includes(raw)) {
    throw ApiError.badRequest(`placement must be one of: ${contentModel.PLACEMENTS.join(', ')}`)
  }
  return raw
}

async function audit(req, entry) {
  await auditModel.record({
    adminId: req.user.id,
    adminEmail: req.user.email,
    targetType: 'content',
    ip: req.ip,
    ...entry,
  })
}

/* --- Nav links ---------------------------------------------------------- */

const listNavLinks = asyncHandler(async (req, res) => {
  const links = await contentModel.listNavLinksForAdmin()
  res.status(200).json({ success: true, count: links.length, data: links })
})

const createNavLink = asyncHandler(async (req, res) => {
  const link = await contentModel.createNavLink({
    label: text(req.body.label, 'Label', 60),
    href: href(req.body.href),
    placement: placement(req.body.placement) ?? 'header',
    sortOrder: optionalInt(req.body.sortOrder),
  })

  await audit(req, {
    action: 'nav_link.create',
    targetId: link.id,
    description: `Created ${link.placement} link ${link.label}`,
    changes: link,
  })

  res.status(201).json({ success: true, message: 'Link created', data: link })
})

const updateNavLink = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const before = await contentModel.findNavLinkById(id)
  if (!before) throw ApiError.notFound(`No link found with id ${id}`)

  const patch = {
    placement: placement(req.body.placement),
    sortOrder: optionalInt(req.body.sortOrder),
    isActive: optionalBool(req.body.isActive),
  }
  if (req.body.label !== undefined) patch.label = text(req.body.label, 'Label', 60)
  if (req.body.href !== undefined) patch.href = href(req.body.href)

  const link = await contentModel.updateNavLink(id, patch)
  if (!link) throw ApiError.notFound(`No link found with id ${id}`)

  await audit(req, {
    action: 'nav_link.update',
    targetId: id,
    description: `Updated link ${link.label}`,
    changes: { from: before, to: link },
  })

  res.status(200).json({ success: true, message: 'Link updated', data: link })
})

const removeNavLink = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const before = await contentModel.findNavLinkById(id)
  if (!before) throw ApiError.notFound(`No link found with id ${id}`)

  await contentModel.removeNavLink(id)

  await audit(req, {
    action: 'nav_link.delete',
    targetId: id,
    description: `Deleted link ${before.label}`,
    changes: { deleted: before },
  })

  res.status(200).json({ success: true, message: 'Link deleted', data: { id } })
})

/* --- Social links ------------------------------------------------------- */

const listSocialLinks = asyncHandler(async (req, res) => {
  const links = await contentModel.listSocialLinksForAdmin()
  res.status(200).json({ success: true, count: links.length, data: links })
})

const createSocialLink = asyncHandler(async (req, res) => {
  const link = await contentModel.createSocialLink({
    platform: text(req.body.platform, 'Platform', 40),
    url: href(req.body.url),
    icon: req.body.icon ? text(req.body.icon, 'Icon', 30) : 'link',
    sortOrder: optionalInt(req.body.sortOrder),
  })

  await audit(req, {
    action: 'social_link.create',
    targetId: link.id,
    description: `Created social link ${link.platform}`,
    changes: link,
  })

  res.status(201).json({ success: true, message: 'Social link created', data: link })
})

const updateSocialLink = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const before = await contentModel.findSocialLinkById(id)
  if (!before) throw ApiError.notFound(`No social link found with id ${id}`)

  const patch = {
    sortOrder: optionalInt(req.body.sortOrder),
    isActive: optionalBool(req.body.isActive),
  }
  if (req.body.platform !== undefined) patch.platform = text(req.body.platform, 'Platform', 40)
  if (req.body.url !== undefined) patch.url = href(req.body.url)
  if (req.body.icon !== undefined) patch.icon = req.body.icon ? text(req.body.icon, 'Icon', 30) : 'link'

  const link = await contentModel.updateSocialLink(id, patch)
  if (!link) throw ApiError.notFound(`No social link found with id ${id}`)

  await audit(req, {
    action: 'social_link.update',
    targetId: id,
    description: `Updated social link ${link.platform}`,
    changes: { from: before, to: link },
  })

  res.status(200).json({ success: true, message: 'Social link updated', data: link })
})

const removeSocialLink = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id)
  const before = await contentModel.findSocialLinkById(id)
  if (!before) throw ApiError.notFound(`No social link found with id ${id}`)

  await contentModel.removeSocialLink(id)

  await audit(req, {
    action: 'social_link.delete',
    targetId: id,
    description: `Deleted social link ${before.platform}`,
    changes: { deleted: before },
  })

  res.status(200).json({ success: true, message: 'Social link deleted', data: { id } })
})

module.exports = {
  listNavLinks,
  createNavLink,
  updateNavLink,
  removeNavLink,
  listSocialLinks,
  createSocialLink,
  updateSocialLink,
  removeSocialLink,
}
