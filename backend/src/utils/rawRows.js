const { toSqlDateTime } = require('./sqlDateTime')

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
