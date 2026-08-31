export const STATUS_VARIANTS = {
  Available: 'success',
  Reserved: 'warning',
  Unavailable: 'neutral',
  Pending: 'warning',
  Accepted: 'success',
  Rejected: 'danger',
  Approved: 'success',
  Hidden: 'neutral',
  Open: 'info',
  'Under Review': 'warning',
  Resolved: 'success',
  active: 'success',
  blocked: 'danger',
}

export const statusVariant = (status) => STATUS_VARIANTS[status] || 'neutral'

export const ITEM_STATUSES = ['Available', 'Reserved', 'Unavailable']
export const REQUEST_STATUSES = ['Pending', 'Accepted', 'Rejected']

const FALLBACK_ART = { glyph: '📦', tint: 'other' }

export function categoryArt(categoryByLabel, label) {
  const found = categoryByLabel?.[label]
  if (!found) return FALLBACK_ART
  return { glyph: found.glyph || FALLBACK_ART.glyph, tint: found.tint || 'other' }
}

/** "2 hours ago" style relative time, for card timestamps. */
export function timeAgo(value) {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.floor((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'

  const units = [
    ['minute', 60],
    ['hour', 60],
    ['day', 24],
    ['month', 30],
    ['year', 12],
  ]
  let amount = seconds
  let unit = 'second'
  for (const [name, size] of units) {
    if (amount < size) break
    amount = Math.floor(amount / size)
    unit = name
  }
  return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`
}

export const plural = (n, word, suffix = 's') => `${n} ${word}${n === 1 ? '' : suffix}`

/* The API returns dates as pre-formatted strings from utils/sqlDateTime, so
   these guard against an unparseable value rather than assuming ISO. */

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
