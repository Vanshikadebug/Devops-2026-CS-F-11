/**
 * models/settingsModel.js -- the `platform_settings` table.
 *
 * >>> THE RULE THIS FILE EXISTS TO ENFORCE <<<
 * A setting that no code reads is a switch that lies. The admin
 * toggles it, the UI says "Saved", and nothing changes -- which is
 * worse than not offering the switch at all, because now the operator
 * believes something about the system that is false.
 *
 * So DEFAULT_SETTINGS below is the complete list, and every entry
 * names the file that honours it. If you add a row here, add the
 * reader in the same commit. If you remove a reader, remove the row.
 *
 * WHY THE DEFAULTS LIVE IN JAVASCRIPT AND NOT ONLY IN SQL
 * Two reasons:
 *   1. `get()` falls back to the default when the row is missing, so a
 *      database that has not been migrated yet, or a row someone
 *      deleted by hand, degrades to the documented default instead of
 *      returning undefined into a security check. `maintenance_mode`
 *      resolving to undefined would be falsy and therefore harmless;
 *      `allow_registration` resolving to undefined would silently
 *      close registration. Neither should depend on luck.
 *   2. It gives migrate.js and seed-db.js one shared list to insert,
 *      so the two can never disagree about what a fresh install has.
 */

const { pool } = require('../config/db')
const config = require('../config/env')

/* ---------------------------------------------------------------
   THE COMPLETE SET OF SETTINGS
   --------------------------------------------------------------- */
const DEFAULT_SETTINGS = [
  {
    key: 'site_name',
    value: 'ReuseHub',
    type: 'string',
    category: 'general',
    label: 'Site name',
    description: 'Shown in the admin panel header and returned by GET /api/settings.',
    // READER: controllers/settingsController.getPublic, AdminHeader.jsx
  },
  {
    key: 'support_email',
    value: '',
    type: 'string',
    category: 'general',
    label: 'Support email',
    description: 'Included in the maintenance-mode response so users know who to contact. Blank omits it.',
    // READER: middleware/maintenanceMode.js
  },
  {
    key: 'maintenance_mode',
    value: 'false',
    type: 'boolean',
    category: 'general',
    label: 'Maintenance mode',
    description: 'Blocks all writes for non-admins with 503. Reading the site still works.',
    // READER: middleware/maintenanceMode.js
  },
  {
    key: 'allow_registration',
    value: 'true',
    type: 'boolean',
    category: 'users',
    label: 'Allow new registrations',
    description: 'When off, POST /api/auth/register answers 403. Existing users can still log in.',
    // READER: controllers/authController.register
  },
  {
    key: 'require_item_approval',
    value: 'false',
    type: 'boolean',
    category: 'moderation',
    label: 'Require approval for new listings',
    description: 'When on, new items start as Pending and are hidden from browsing until a moderator approves them.',
    // READER: controllers/itemController.create
  },
  {
    key: 'max_items_per_user',
    value: '0',
    type: 'number',
    category: 'items',
    label: 'Maximum active listings per user',
    description: '0 means unlimited. Counts listings that are not Unavailable.',
    // READER: controllers/itemController.create
  },
  {
    key: 'default_page_size',
    value: '20',
    type: 'number',
    category: 'general',
    label: 'Admin table page size',
    description: 'Rows per page in admin tables when the request does not ask for a specific limit.',
    // READER: utils/pagination.js
  },
  {
    key: 'disabled_categories',
    value: '[]',
    type: 'json',
    category: 'items',
    label: 'Disabled categories',
    description: 'Categories that can no longer be chosen for new or edited listings. Existing listings keep theirs.',
    // READER: validators/itemValidators (via settingsModel.get), controllers/adminCategoryController
  },
]

const BY_KEY = new Map(DEFAULT_SETTINGS.map((s) => [s.key, s]))

/* ---------------------------------------------------------------
   CASTING
   --------------------------------------------------------------- */

/**
 * Turns a stored string into the JavaScript value the app expects.
 *
 * >>> WHY THIS FUNCTION IS A SECURITY BOUNDARY, NOT A CONVENIENCE <<<
 * Everything in this table is a string. The string "false" is TRUTHY
 * in JavaScript. So `if (settings.maintenance_mode)` on a raw row
 * enables maintenance mode permanently and no amount of clicking the
 * toggle off will help -- the value flips between "true" and "false",
 * both of which are truthy. Casting here, once, is what makes every
 * caller's `if` mean what it reads like.
 */
function cast(raw, type) {
  if (raw === null || raw === undefined) return null

  switch (type) {
    case 'boolean':
      // Only the exact string 'true' is true. Anything else -- '',
      // 'false', 'no', a typo -- is false, which is the safe direction
      // for a flag that grants permission.
      return raw === 'true'
    case 'number': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    }
    case 'json':
      try {
        return JSON.parse(raw)
      } catch {
        // A corrupt value must not take the app down on every request.
        return null
      }
    default:
      return String(raw)
  }
}

/** Turns a JavaScript value into the string that gets stored. */
function serialise(value, type) {
  if (type === 'json') return JSON.stringify(value ?? null)
  if (type === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/* ---------------------------------------------------------------
   CACHE
   ---------------------------------------------------------------
   Some of these are consulted on requests that must stay fast --
   maintenanceMode runs before every write. Re-reading nine rows per
   request is wasteful, so values are cached for a few seconds and the
   cache is dropped whenever a write happens in this process.

   IN TESTS THE CACHE IS DISABLED ENTIRELY. A test that flips a
   setting with pool.execute (not through the API) would otherwise
   race a stale cache, and a test suite whose result depends on
   timing is worse than no test. Correctness first; the cache is an
   optimisation for a path tests do not measure. */
const CACHE_TTL_MS = config.isTest ? 0 : 5_000
let cache = null
let cacheStamp = 0

/** Drops the cache. Called after every write, and by tests. */
function clearCache() {
  cache = null
  cacheStamp = 0
}

/**
 * Every setting as a plain { key: castValue } object, defaults filled
 * in for any row the database does not have.
 */
async function getMap() {
  if (cache && Date.now() - cacheStamp < CACHE_TTL_MS) return cache

  // Start from the documented defaults, then let the database override
  // them. A missing row therefore behaves exactly like a fresh install
  // rather than like `undefined`.
  const map = {}
  for (const s of DEFAULT_SETTINGS) map[s.key] = cast(s.value, s.type)

  const [rows] = await pool.execute(
    'SELECT setting_key, setting_value, value_type FROM platform_settings',
  )
  for (const row of rows) {
    // Ignore any key the code does not know about. A stale row left
    // behind by an older version must not appear as a live setting.
    if (!BY_KEY.has(row.setting_key)) continue
    map[row.setting_key] = cast(row.setting_value, row.value_type)
  }

  cache = map
  cacheStamp = Date.now()
  return map
}

/** One setting's cast value, or its documented default. */
async function get(key) {
  if (!BY_KEY.has(key)) {
    throw new Error(`settingsModel.get: unknown setting "${key}"`)
  }
  return (await getMap())[key]
}

/**
 * Every setting with its metadata, for the admin settings page.
 * Ordered by category then by the order declared above, so the page
 * renders in a deliberate order rather than whatever MySQL returns.
 */
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

/**
 * Writes a batch of settings.
 *
 * >>> ONLY KNOWN KEYS ARE WRITABLE <<<
 * The body arrives as { key: value } from the browser. Looping over
 * it and writing whatever it contains would let anyone with admin
 * access invent rows -- harmless on its own, but it also means a
 * typo'd key saves successfully and silently does nothing, which is
 * the "switch that lies" failure this file exists to prevent. An
 * unknown key is rejected by the validator before it reaches here;
 * this check is the second line, because the model should not depend
 * on being called correctly.
 *
 * Runs in a TRANSACTION: a settings save is one administrative act,
 * and half-applying it (registration closed, maintenance mode not on)
 * could leave the site in a state the admin never asked for.
 */
async function updateMany(entries, adminId) {
  const keys = Object.keys(entries)
  const unknown = keys.filter((k) => !BY_KEY.has(k))
  if (unknown.length) {
    throw new Error(`settingsModel.updateMany: unknown settings ${unknown.join(', ')}`)
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    for (const key of keys) {
      const meta = BY_KEY.get(key)
      const stored = serialise(entries[key], meta.type)

      /* INSERT ... ON DUPLICATE KEY UPDATE, not UPDATE.
         The row may legitimately not exist yet -- on a database
         migrated before this setting was added, for instance. A plain
         UPDATE would affect zero rows and report success. */
      await conn.execute(
        `INSERT INTO platform_settings
           (setting_key, setting_value, value_type, label, description, category, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           updated_by    = VALUES(updated_by)`,
        [key, stored, meta.type, meta.label, meta.description, meta.category, adminId ?? null],
      )
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }

  clearCache()
  return getAllForAdmin()
}

/**
 * Inserts any missing default rows. Idempotent, so it is safe to call
 * from the migration, from the seed, and repeatedly.
 *
 * INSERT IGNORE, not INSERT: this must never overwrite a value an
 * admin has deliberately changed. Running the migration twice on a
 * site with maintenance mode on must not switch it off.
 */
async function ensureDefaults() {
  let inserted = 0

  for (const s of DEFAULT_SETTINGS) {
    const [result] = await pool.execute(
      `INSERT IGNORE INTO platform_settings
         (setting_key, setting_value, value_type, label, description, category)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.key, s.value, s.type, s.label, s.description, s.category],
    )
    if (result.affectedRows > 0) inserted++
  }

  clearCache()
  return inserted
}

module.exports = {
  DEFAULT_SETTINGS,
  get,
  getMap,
  getAllForAdmin,
  updateMany,
  ensureDefaults,
  clearCache,
  // Exported for the validator, which needs to know the type of a key
  // before it can check the incoming value against it.
  metaFor: (key) => BY_KEY.get(key) ?? null,
}
