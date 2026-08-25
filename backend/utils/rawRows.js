/**
 * utils/rawRows.js -- makes $queryRaw output safe to serialise.
 *
 * >>> THE FAILURE THIS PREVENTS <<<
 * `JSON.stringify` THROWS on a BigInt -- "Do not know how to serialize a
 * BigInt" -- so a stray one does not show up as a wrong number in the
 * response. It takes the whole endpoint down with a 500, from inside
 * res.json(), far away from the query that produced it.
 *
 * Prisma hands back BigInt for more columns than you would guess. The
 * obvious one is COUNT(), which MySQL types as BIGINT. The one that
 * actually bites is `id`: every key in this schema is INT UNSIGNED, whose
 * maximum (4294967295) does not fit a signed 32-bit int, so Prisma widens
 * it. That means ids, foreign keys and counts are all affected -- and
 * listing the columns to convert by hand guarantees missing one the day a
 * SELECT gains a field.
 *
 * So this converts by TYPE, not by name. Nothing to keep in sync.
 *
 * Precision: Number cannot hold every BigInt, but INT UNSIGNED tops out
 * around 4.3e9 and Number is exact to 9e15, so no id or count in this
 * schema can lose a digit. A genuinely large BIGINT column would need
 * different handling, and there is none here.
 *
 * Only needed for $queryRaw. The query builder already returns Int
 * columns as JavaScript numbers and DateTime as Date.
 */

const { toSqlDateTime } = require('./sqlDateTime')

/**
 * One row with BigInt values narrowed to Number and the named date
 * fields rendered the way mysql2 used to (see utils/sqlDateTime.js).
 */
function normaliseRawRow(row, dateFields = []) {
  if (!row) return row

  const out = {}
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'bigint' ? Number(value) : value
  }
  for (const field of dateFields) {
    if (field in out) out[field] = toSqlDateTime(out[field])
  }
  return out
}

/** The same, for an array of rows. */
function normaliseRawRows(rows, dateFields = []) {
  return rows.map((row) => normaliseRawRow(row, dateFields))
}

module.exports = { normaliseRawRow, normaliseRawRows }
