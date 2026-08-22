/**
 * models/requestModel.js -- every SQL statement that touches `requests`.
 *
 * One user can request many items; one item can be requested by many
 * users. The UNIQUE key (item_id, requester_id) means that pair exists
 * at most once -- a second POST is a 409, not a second row.
 *
 * Accept and reject run here (not in the controller) because accepting
 * must update THIS request, the OTHER pending requests, and the item's
 * status in one transaction. Splitting that across two models is how
 * you end up with an Accepted request whose item is still Available.
 */

const { pool } = require('../config/db')

const STATUSES = ['Pending', 'Accepted', 'Rejected']
const DECIDABLE = ['Accepted', 'Rejected']

const REQUEST_FIELDS = `
  r.id,
  r.item_id,
  r.requester_id,
  r.message,
  r.status,
  r.created_at,
  r.updated_at,
  i.user_id AS owner_id,
  i.name AS item_name,
  i.status AS item_status,
  i.image_url AS item_image_url,
  i.category AS item_category,
  i.location AS item_location,
  i.moderation_status AS item_moderation_status,
  owner.name AS owner_name,
  owner.email AS owner_email,
  owner.mobile AS owner_mobile,
  owner.status AS owner_status,
  requester.name AS requester_name,
  requester.email AS requester_email,
  requester.mobile AS requester_mobile
`

const REQUEST_SOURCE = `
  FROM requests r
  JOIN items i        ON i.id = r.item_id
  JOIN users owner    ON owner.id = i.user_id
  JOIN users requester ON requester.id = r.requester_id
`

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${REQUEST_FIELDS} ${REQUEST_SOURCE} WHERE r.id = ?`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * Requests THIS user has made, newest first.
 * Optional `itemId` narrows to one listing (used by ItemDetail).
 */
async function findSent(requesterId, { itemId } = {}) {
  const where = ['r.requester_id = ?']
  const params = [requesterId]

  if (itemId) {
    where.push('r.item_id = ?')
    params.push(itemId)
  }

  const [rows] = await pool.execute(
    `SELECT ${REQUEST_FIELDS} ${REQUEST_SOURCE}
      WHERE ${where.join(' AND ')}
      ORDER BY r.created_at DESC, r.id DESC`,
    params,
  )
  return rows
}

/** Requests OTHER people have made on THIS user's items. */
async function findReceived(ownerId) {
  const [rows] = await pool.execute(
    `SELECT ${REQUEST_FIELDS} ${REQUEST_SOURCE}
      WHERE i.user_id = ?
      ORDER BY r.created_at DESC, r.id DESC`,
    [ownerId],
  )
  return rows
}

async function findByItemAndRequester(itemId, requesterId) {
  const [rows] = await pool.execute(
    `SELECT ${REQUEST_FIELDS} ${REQUEST_SOURCE}
      WHERE r.item_id = ? AND r.requester_id = ?`,
    [itemId, requesterId],
  )
  return rows[0] ?? null
}

/**
 * Inserts a Pending request. Duplicate pairs raise ER_DUP_ENTRY;
 * the controller maps that to 409.
 */
async function create({ itemId, requesterId, message = null }) {
  const [result] = await pool.execute(
    `INSERT INTO requests (item_id, requester_id, message, status)
     VALUES (?, ?, ?, 'Pending')`,
    [itemId, requesterId, message],
  )
  return findById(result.insertId)
}

/**
 * Re-opens a previously REJECTED request from the same
 * (item_id, requester_id) pair, flipping it back to Pending with a
 * fresh message.
 *
 * >>> WHY THIS EXISTS: THE re-request POLICY <<<
 * UNIQUE(item_id, requester_id) means one person holds at most one row
 * per item, and reject() leaves that row in place as 'Rejected' rather
 * than deleting it. Without a way to revive it, a second POST is a
 * PERMANENT 409 -- which is unfair in the common case. When an owner
 * ACCEPTS someone, accept() auto-rejects every OTHER pending request
 * for that item; those people were not turned down on their merits, and
 * if the item later returns to Available they still could never ask
 * again. Re-opening the existing row lets them back in while keeping the
 * UNIQUE rule intact -- one row per pair, no pile of duplicates, and the
 * owner sees a single request rather than a fresh one every time.
 *
 * The `AND status = 'Rejected'` guard is the safety belt: this can only
 * ever revive a DEAD request, never quietly overwrite a live Pending or
 * Accepted one. If the row stopped being Rejected between the
 * controller's read and this write (a concurrent decision), zero rows
 * change and we return null -- which the controller reports as a 409,
 * the same answer a live duplicate would get.
 */
async function reopen(id, message = null) {
  const [result] = await pool.execute(
    `UPDATE requests
        SET status = 'Pending', message = ?, updated_at = NOW()
      WHERE id = ? AND status = 'Rejected'`,
    [message, id],
  )
  return result.affectedRows > 0 ? findById(id) : null
}

/**
 * Owner accepts one pending request: this row Accepted, every other
 * pending request for the same item Rejected, the item Reserved.
 *
 * `ownerId` MUST be req.user.id. The function re-checks against the
 * locked row so a race cannot accept on someone else's behalf.
 *
 * Returns { ok: true, data } or { ok: false, reason }.
 */
async function accept(id, ownerId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [rows] = await conn.execute(
      `SELECT r.id, r.status, r.item_id, i.user_id AS owner_id, i.status AS item_status
         FROM requests r
         JOIN items i ON i.id = r.item_id
        WHERE r.id = ?
        FOR UPDATE`,
      [id],
    )
    const row = rows[0]

    if (!row) {
      await conn.rollback()
      return { ok: false, reason: 'not_found' }
    }
    if (row.owner_id !== ownerId) {
      await conn.rollback()
      return { ok: false, reason: 'not_owner' }
    }
    if (row.status !== 'Pending') {
      await conn.rollback()
      return { ok: false, reason: 'not_pending' }
    }
    if (row.item_status !== 'Available') {
      await conn.rollback()
      return { ok: false, reason: 'not_available' }
    }

    await conn.execute(
      `UPDATE requests SET status = 'Accepted' WHERE id = ?`,
      [id],
    )
    await conn.execute(
      `UPDATE requests SET status = 'Rejected'
        WHERE item_id = ? AND id <> ? AND status = 'Pending'`,
      [row.item_id, id],
    )
    await conn.execute(
      `UPDATE items SET status = 'Reserved' WHERE id = ?`,
      [row.item_id],
    )

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }

  return { ok: true, data: await findById(id) }
}

/**
 * Owner rejects one pending request. The item is left alone so other
 * pending requests can still be decided.
 */
async function reject(id, ownerId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [rows] = await conn.execute(
      `SELECT r.id, r.status, i.user_id AS owner_id
         FROM requests r
         JOIN items i ON i.id = r.item_id
        WHERE r.id = ?
        FOR UPDATE`,
      [id],
    )
    const row = rows[0]

    if (!row) {
      await conn.rollback()
      return { ok: false, reason: 'not_found' }
    }
    if (row.owner_id !== ownerId) {
      await conn.rollback()
      return { ok: false, reason: 'not_owner' }
    }
    if (row.status !== 'Pending') {
      await conn.rollback()
      return { ok: false, reason: 'not_pending' }
    }

    await conn.execute(
      `UPDATE requests SET status = 'Rejected' WHERE id = ?`,
      [id],
    )

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }

  return { ok: true, data: await findById(id) }
}

module.exports = {
  findById,
  findSent,
  findReceived,
  findByItemAndRequester,
  create,
  reopen,
  accept,
  reject,
  STATUSES,
  DECIDABLE,
}
