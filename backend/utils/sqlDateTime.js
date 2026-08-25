/**
 * utils/sqlDateTime.js -- renders a Date the way mysql2 used to.
 *
 * >>> WHY THIS EXISTS <<<
 * config/db.js sets `dateStrings: true`, so every timestamp arrived as
 * the literal column value: "2026-08-24 09:26:38". Prisma has no such
 * option -- it returns a real Date, which Express then serialises as
 * "2026-08-24T09:26:38.000Z". Same instant, different text.
 *
 * That difference is invisible in a diff and breaks things at the edges:
 * the React app parses the old shape, and the API contract is what the
 * tests assert on. So the Prisma repositories run their timestamps back
 * through here and the responses stay byte-identical to before.
 *
 * UTC components, deliberately. MySQL stores TIMESTAMP as UTC and Prisma
 * hands back a Date whose UTC reading equals the stored digits, so
 * getUTC* reproduces the original string exactly. Using the local getters
 * would shift every timestamp by the server's offset -- here, +05:30.
 *
 * Worth revisiting later: ISO 8601 is the better wire format. Switching
 * is a deliberate breaking change to make with the frontend, not a
 * side effect of moving to Prisma.
 */

const pad = (n) => String(n).padStart(2, '0')

/**
 * @param {Date|null|undefined} value
 * @returns {string|null|undefined} "YYYY-MM-DD HH:mm:ss", or the input
 *   unchanged when it is null/undefined so nullable columns stay nullable.
 */
function toSqlDateTime(value) {
  if (value === null || value === undefined) return value
  if (!(value instanceof Date)) return value

  return (
    `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}` +
    ` ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
  )
}

/**
 * Returns a copy of `row` with the named fields date-formatted. Keeps the
 * repositories from repeating the same three lines for every timestamp.
 */
function formatDates(row, fields) {
  if (!row) return row
  const out = { ...row }
  for (const f of fields) {
    if (f in out) out[f] = toSqlDateTime(out[f])
  }
  return out
}

module.exports = { toSqlDateTime, formatDates }
