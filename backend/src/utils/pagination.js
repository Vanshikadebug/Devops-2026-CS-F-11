const settingsModel = require('../models/settingsModel')

/* The ceiling exists so one request cannot ask the database to
   assemble 100,000 rows and the server to serialise them. An admin
   who genuinely wants everything pages through it. */
const MAX_LIMIT = 100
const MAX_PAGE = 100_000

/** An integer in [1, max], or `fallback` when the input is not a number. */
function clamp(value, fallback, max) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, 1), max)
}

function clampOffset(value) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, MAX_PAGE * MAX_LIMIT)
}

function clampLimitOffset(limit, offset, fallbackLimit = 20) {
  return {
    limit: clamp(limit, clamp(fallbackLimit, 20, MAX_LIMIT), MAX_LIMIT),
    offset: clampOffset(offset),
  }
}

function parsePagination(query = {}, fallbackLimit = 20) {
  const limit = clamp(query.limit, clamp(fallbackLimit, 20, MAX_LIMIT), MAX_LIMIT)
  const page = clamp(query.page, 1, MAX_PAGE)
  return { page, limit, offset: (page - 1) * limit }
}

async function resolvePagination(query = {}) {
  const fallback = await settingsModel.get('default_page_size')
  return parsePagination(query, fallback)
}

function paginationMeta({ page, limit }, total) {
  const totalPages = Math.max(Math.ceil(total / limit), 1)
  return {
    page,
    limit,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  }
}

module.exports = { parsePagination, resolvePagination, paginationMeta, clampLimitOffset, MAX_LIMIT }
