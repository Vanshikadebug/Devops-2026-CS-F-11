const { prisma } = require('../lib/prisma')
const cache = require('../lib/cache')
const config = require('../config/env')

const DEFAULT_SETTINGS = [
  // --- Branding -----------------------------------------------------
  { key: 'site_name', value: 'ReuseHub', type: 'string', category: 'branding', label: 'Site name', description: 'Shown in the navbar, page titles and emails.' }, // READER: web ConfigProvider, Navbar
  { key: 'tagline', value: 'Give your things a second life', type: 'string', category: 'branding', label: 'Tagline', description: 'Short line under the logo and in the footer.' }, // READER: web Footer
  { key: 'logo_glyph', value: '♻', type: 'string', category: 'branding', label: 'Logo glyph', description: 'Emoji or character used as the logo mark.' }, // READER: web Navbar

  // --- Theme (injected as CSS variables at runtime) -------------------
  { key: 'color_bg', value: '#e9eee4', type: 'color', category: 'theme', label: 'Page background', description: 'Base canvas colour behind all cards.' }, // READER: web ConfigProvider
  { key: 'color_surface', value: '#ffffff', type: 'color', category: 'theme', label: 'Card surface', description: 'Background of cards and panels.' },
  { key: 'color_ink', value: '#12150f', type: 'color', category: 'theme', label: 'Primary text', description: 'Headlines and body text.' },
  { key: 'color_muted', value: '#6b7264', type: 'color', category: 'theme', label: 'Muted text', description: 'Secondary and helper text.' },
  { key: 'color_accent', value: '#d4f34a', type: 'color', category: 'theme', label: 'Accent', description: 'Primary call-to-action colour.' },
  { key: 'color_accent_ink', value: '#12150f', type: 'color', category: 'theme', label: 'Accent text', description: 'Text drawn on top of the accent colour.' },
  { key: 'color_ring', value: '#12150f', type: 'color', category: 'theme', label: 'Focus ring', description: 'Keyboard focus outline colour.' },
  { key: 'radius_card', value: '28', type: 'number', category: 'theme', label: 'Card radius (px)', description: 'Corner rounding on cards and panels.' },
  { key: 'radius_pill', value: '999', type: 'number', category: 'theme', label: 'Pill radius (px)', description: 'Corner rounding on buttons and badges.' },
  { key: 'font_display', value: "'Inter', system-ui, sans-serif", type: 'string', category: 'theme', label: 'Display font stack', description: 'CSS font-family for headings.' },

  // --- Home page content ---------------------------------------------
  { key: 'hero_badge', value: 'Campus reuse, made simple', type: 'string', category: 'content', label: 'Hero badge', description: 'Small pill above the hero headline.' }, // READER: web Home
  { key: 'hero_title', value: 'Give your things a second life.', type: 'string', category: 'content', label: 'Hero headline', description: 'The large headline on the home page.' },
  { key: 'hero_subtitle', value: 'List what you no longer need. Someone on your campus needs it today.', type: 'string', category: 'content', label: 'Hero subtitle', description: 'Supporting line under the headline.' },
  { key: 'hero_cta_label', value: 'Browse items', type: 'string', category: 'content', label: 'Hero button label', description: 'Text on the main hero call-to-action.' },
  { key: 'hero_cta_href', value: '/items', type: 'string', category: 'content', label: 'Hero button link', description: 'Where the hero call-to-action goes.' },
  { key: 'hero_image_url', value: '', type: 'string', category: 'content', label: 'Hero image URL', description: 'Optional artwork in the hero card. Blank shows a generated pattern.' },
  { key: 'featured_limit', value: '8', type: 'number', category: 'content', label: 'Items on home page', description: 'How many listings the home grid shows.' }, // READER: web Home
  { key: 'empty_state_text', value: 'Nothing here yet. Be the first to list something.', type: 'string', category: 'content', label: 'Empty state message', description: 'Shown when a listing grid has no results.' },
  { key: 'footer_text', value: 'ReuseHub — a student project for reducing campus waste.', type: 'string', category: 'content', label: 'Footer text', description: 'Line shown in the site footer.' },

  // --- Contact --------------------------------------------------------
  { key: 'support_email', value: '', type: 'string', category: 'contact', label: 'Support email', description: 'Shown in the footer and in the maintenance notice. Blank omits it.' }, // READER: middleware/maintenance.js
  { key: 'contact_phone', value: '', type: 'string', category: 'contact', label: 'Contact phone', description: 'Optional phone number for the footer.' },
  { key: 'contact_address', value: '', type: 'string', category: 'contact', label: 'Address', description: 'Optional postal address for the footer.' },

  // --- General --------------------------------------------------------
  { key: 'maintenance_mode', value: 'false', type: 'boolean', category: 'general', label: 'Maintenance mode', description: 'Blocks all writes for non-staff with 503. Reading the site still works.' }, // READER: middleware/maintenance.js
  { key: 'maintenance_message', value: 'ReuseHub is briefly down for maintenance. Please try again shortly.', type: 'string', category: 'general', label: 'Maintenance message', description: 'Shown to users while maintenance mode is on.' }, // READER: middleware/maintenance.js
  { key: 'default_page_size', value: '20', type: 'number', category: 'general', label: 'Default page size', description: 'Rows per page when a request does not ask for a specific limit.' }, // READER: utils/pagination.js

  // --- Users ----------------------------------------------------------
  { key: 'allow_registration', value: 'true', type: 'boolean', category: 'users', label: 'Allow new registrations', description: 'When off, POST /api/auth/register answers 403. Existing users can still log in.' }, // READER: controllers/authController.register
  { key: 'require_college_on_signup', value: 'false', type: 'boolean', category: 'users', label: 'Require campus at signup', description: 'When on, new accounts must choose a college during registration.' }, // READER: validators/authValidators

  // --- Items ----------------------------------------------------------
  { key: 'max_items_per_user', value: '0', type: 'number', category: 'items', label: 'Maximum active listings per user', description: '0 means unlimited. Counts listings that are not Unavailable.' }, // READER: controllers/itemController.create
  { key: 'allow_image_url', value: 'true', type: 'boolean', category: 'items', label: 'Allow photos on listings', description: 'When off, the photo field is rejected and hidden on the item form.' }, // READER: controllers/itemController, web ItemForm
  { key: 'allow_image_uploads', value: 'true', type: 'boolean', category: 'items', label: 'Allow photo uploads', description: 'When off, members can still paste an https:// image link but cannot upload a file.' }, // READER: controllers/uploadController, web ImageDrop
  { key: 'max_image_mb', value: '5', type: 'number', category: 'items', label: 'Maximum photo size (MB)', description: 'Largest uploadable photo. 0 means no limit beyond the 16MB hard cap.' }, // READER: controllers/uploadController
  { key: 'require_college_on_item', value: 'false', type: 'boolean', category: 'items', label: 'Require a campus on listings', description: 'When on, every new listing must name a college rather than free text.' }, // READER: controllers/itemController.resolvePlace
  { key: 'item_name_max', value: '150', type: 'number', category: 'items', label: 'Listing title limit', description: 'Maximum characters in a listing title.' }, // READER: validators/itemValidators
  { key: 'item_description_max', value: '2000', type: 'number', category: 'items', label: 'Listing description limit', description: 'Maximum characters in a listing description.' }, // READER: validators/itemValidators

  // --- Moderation ------------------------------------------------------
  { key: 'require_item_approval', value: 'false', type: 'boolean', category: 'moderation', label: 'Require approval for new listings', description: 'When on, new items start as Pending and stay hidden until a moderator approves them.' }, // READER: controllers/itemController.create
  { key: 'allow_reports', value: 'true', type: 'boolean', category: 'moderation', label: 'Allow users to file reports', description: 'When off, POST /api/reports answers 403.' }, // READER: controllers/reportController.create

  // --- SEO --------------------------------------------------------------
  { key: 'meta_title', value: 'ReuseHub — campus item reuse', type: 'string', category: 'seo', label: 'Meta title', description: 'Browser tab title and search result heading.' }, // READER: web ConfigProvider
  { key: 'meta_description', value: 'List what you no longer need and find what you do, on your campus.', type: 'string', category: 'seo', label: 'Meta description', description: 'Search engine and link preview description.' },
]

const BY_KEY = new Map(DEFAULT_SETTINGS.map((s) => [s.key, s]))

const PUBLIC_CATEGORIES = new Set(['branding', 'theme', 'content', 'contact', 'seo'])
const PUBLIC_EXTRA_KEYS = new Set([
  'maintenance_mode',
  'maintenance_message',
  'allow_registration',
  'allow_image_url',
  'allow_image_uploads',
  'max_image_mb',
  'allow_reports',
  'require_college_on_item',
  'require_college_on_signup',
  'item_name_max',
  'item_description_max',
  'max_items_per_user',
])

function cast(raw, type) {
  if (raw === null || raw === undefined) return null

  switch (type) {
    case 'boolean':
      // Only the exact string 'true' is true. Anything else is false, the
      // safe direction for a flag that grants permission.
      return raw === 'true'
    case 'number': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    }
    case 'json':
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    default:
      return String(raw)
  }
}

function serialise(value, type) {
  if (type === 'json') return JSON.stringify(value ?? null)
  if (type === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

async function loadMap() {
  const map = {}
  for (const s of DEFAULT_SETTINGS) map[s.key] = cast(s.value, s.type)

  const rows = await prisma.platformSetting.findMany({
    select: { setting_key: true, setting_value: true, value_type: true },
  })

  for (const row of rows) {
    // Ignore keys the code does not know about: a stale row left by an older
    // version must not appear as a live setting.
    if (!BY_KEY.has(row.setting_key)) continue
    map[row.setting_key] = cast(row.setting_value, row.value_type)
  }

  return map
}

/** Every setting as { key: castValue }, defaults filled in. Redis-cached. */
async function getMap() {
  if (config.isTest) return loadMap()
  return cache.wrap(cache.KEYS.settings, config.redis.ttl.settings, loadMap)
}

async function get(key) {
  if (!BY_KEY.has(key)) {
    throw new Error(`settingsModel.get: unknown setting "${key}"`)
  }
  return (await getMap())[key]
}

/** Only the settings the public site is allowed to read. */
async function getPublicMap() {
  const all = await getMap()
  const out = {}
  for (const s of DEFAULT_SETTINGS) {
    if (PUBLIC_CATEGORIES.has(s.category) || PUBLIC_EXTRA_KEYS.has(s.key)) {
      out[s.key] = all[s.key]
    }
  }
  return out
}

/** Every setting with its metadata, grouped for the admin settings page. */
async function getAllForAdmin() {
  const values = await getMap()
  return DEFAULT_SETTINGS.map((s) => ({
    key: s.key,
    value: values[s.key],
    type: s.type,
    category: s.category,
    label: s.label,
    description: s.description,
  }))
}

async function updateMany(entries, adminId) {
  const keys = Object.keys(entries)
  const unknown = keys.filter((k) => !BY_KEY.has(k))
  if (unknown.length) {
    throw new Error(`settingsModel.updateMany: unknown settings ${unknown.join(', ')}`)
  }

  await prisma.$transaction(
    keys.map((key) => {
      const meta = BY_KEY.get(key)
      const stored = serialise(entries[key], meta.type)

      // upsert, not update: the row may legitimately not exist yet, and a
      // plain update would affect zero rows and report success.
      return prisma.platformSetting.upsert({
        where: { setting_key: key },
        update: { setting_value: stored, updated_by: adminId ?? null },
        create: {
          setting_key: key,
          setting_value: stored,
          value_type: meta.type,
          label: meta.label,
          description: meta.description,
          category: meta.category,
          updated_by: adminId ?? null,
        },
      })
    }),
  )

  await cache.bustAll()
  return getAllForAdmin()
}

/** Inserts any missing default rows. Idempotent; never overwrites a value an
    admin deliberately changed. */
async function ensureDefaults() {
  const result = await prisma.platformSetting.createMany({
    data: DEFAULT_SETTINGS.map((s) => ({
      setting_key: s.key,
      setting_value: s.value,
      value_type: s.type,
      label: s.label,
      description: s.description,
      category: s.category,
    })),
    skipDuplicates: true,
  })

  await cache.bustAll()
  return result.count
}

module.exports = {
  DEFAULT_SETTINGS,
  get,
  getMap,
  getPublicMap,
  getAllForAdmin,
  updateMany,
  ensureDefaults,
  metaFor: (key) => BY_KEY.get(key) ?? null,
  KEYS: DEFAULT_SETTINGS.map((s) => s.key),
}
