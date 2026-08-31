const settingsModel = require('../models/settingsModel')
const auditModel = require('../models/auditModel')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')

/** GET /api/admin/settings -- every setting with its metadata, grouped by
    category so the panel renders sections without a second hardcoded list. */
const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsModel.getAllForAdmin()

  const groups = {}
  for (const s of settings) {
    if (!groups[s.category]) groups[s.category] = []
    groups[s.category].push(s)
  }

  res.status(200).json({ success: true, data: { settings, groups } })
})

const updateSettings = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const keys = Object.keys(body)

  if (keys.length === 0) {
    throw ApiError.badRequest('Send at least one setting to update')
  }

  const unknown = keys.filter((k) => !settingsModel.metaFor(k))
  if (unknown.length) {
    throw ApiError.badRequest(`Unknown settings: ${unknown.join(', ')}`)
  }

  const entries = {}
  const details = []

  for (const key of keys) {
    const meta = settingsModel.metaFor(key)
    const raw = body[key]

    switch (meta.type) {
      case 'boolean':
        entries[key] = raw === true || raw === 'true' || raw === 1 || raw === '1'
        break
      case 'number': {
        const n = Number(raw)
        if (!Number.isFinite(n)) {
          details.push({ field: key, message: `${meta.label} must be a number` })
          break
        }
        entries[key] = n
        break
      }
      case 'color': {
        const value = String(raw ?? '').trim()
        if (!/^#[0-9a-fA-F]{3,8}$/.test(value)) {
          details.push({ field: key, message: `${meta.label} must be a hex colour like #d4f34a` })
          break
        }
        entries[key] = value
        break
      }
      case 'json':
        entries[key] = raw
        break
      default: {
        const value = String(raw ?? '')
        if (value.length > 2000) {
          details.push({ field: key, message: `${meta.label} is too long` })
          break
        }
        entries[key] = value
      }
    }
  }

  if (details.length) {
    throw ApiError.badRequest('Some settings could not be saved', details)
  }

  const before = await settingsModel.getMap()
  const settings = await settingsModel.updateMany(entries, req.user.id)

  // Record only what actually changed, so the audit trail is a list of
  // decisions rather than a diff of the whole form.
  const changes = {}
  for (const key of Object.keys(entries)) {
    if (before[key] !== entries[key]) {
      changes[key] = { from: before[key], to: entries[key] }
    }
  }

  if (Object.keys(changes).length) {
    await auditModel.record({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'settings.update',
      targetType: 'setting',
      description: `Updated ${Object.keys(changes).join(', ')}`,
      changes,
      ip: req.ip,
    })
  }

  res.status(200).json({
    success: true,
    message: 'Settings saved',
    data: { settings },
  })
})

module.exports = { getSettings, updateSettings }
