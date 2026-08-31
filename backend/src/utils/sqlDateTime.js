const pad = (n) => String(n).padStart(2, '0')

function toSqlDateTime(value) {
  if (value === null || value === undefined) return value
  if (!(value instanceof Date)) return value

  return (
    `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}` +
    ` ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
  )
}

function formatDates(row, fields) {
  if (!row) return row
  const out = { ...row }
  for (const f of fields) {
    if (f in out) out[f] = toSqlDateTime(out[f])
  }
  return out
}

module.exports = { toSqlDateTime, formatDates }
