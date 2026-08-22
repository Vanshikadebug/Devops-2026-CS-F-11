/**
 * utils/pagination.js -- turns `?page=&limit=` into safe SQL numbers.
 *
 * WHY THIS IS A SHARED UTILITY AND NOT THREE LINES IN EACH CONTROLLER
 * Every admin list endpoint needs the same thing, and the interesting
 * part is not the arithmetic -- it is that LIMIT and OFFSET are the
 * two places in this project where a value from the query string is
 * INTERPOLATED into SQL rather than bound as a parameter.
 *
 * >>> WHY INTERPOLATED AT ALL, WHEN EVERYTHING ELSE IS BOUND? <<<
 * MySQL's prepared-statement protocol does not accept a placeholder in
 * LIMIT or OFFSET. `LIMIT ?` fails with a syntax error, so there is no
 * "just use ?" available. That makes these two numbers the only path
 * by which a query-string value reaches the SQL text, which is
 * precisely why the conversion belongs in ONE reviewed function
 * instead of being retyped in a dozen controllers.
 *
 * The guarantee below is absolute: whatever comes in, what comes out
 * is a JavaScript integer inside a fixed range. `Number.parseInt`
 * stops at the first non-digit and `Math.min/max` bound the result, so
 *
 *   '20; DROP TABLE users'  ->  20
 *   'abc'                   ->  the default
 *   -5                      ->  1
 *   99999                   ->  100
 *
 * There is no string that survives this as a string.
 */

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

/** A non-negative integer offset, 0 when the input is not a usable number.
    Unlike `clamp`, the floor is 0, not 1 -- page one legitimately starts
    at row 0, and there is no such thing as a negative row position. The
    ceiling mirrors the largest offset parsePagination can itself produce
    ((MAX_PAGE - 1) * MAX_LIMIT), so a hand-built offset cannot ask the
    database to skip further than paging ever would. */
function clampOffset(value) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, MAX_PAGE * MAX_LIMIT)
}

/**
 * Forces a caller-supplied LIMIT and OFFSET into safe integers.
 *
 * >>> WHY THIS EXISTS ALONGSIDE parsePagination <<<
 * parsePagination turns `?page=&limit=` INTO a limit and offset -- it is
 * what a controller calls at the edge. This is the other end: a last-line
 * clamp for the MODEL functions that interpolate those two numbers into
 * SQL. The admin listings receive { limit, offset } already computed and
 * then write `LIMIT ${limit} OFFSET ${offset}` -- the only two values in
 * the whole project interpolated rather than bound, because MySQL's
 * prepared-statement protocol refuses a placeholder there.
 *
 * In the normal flow parsePagination has already made these safe, so this
 * changes nothing. It is here so the query is safe REGARDLESS of how the
 * values arrived -- a new admin endpoint that forgets parsePagination, a
 * unit test calling the model directly, a future refactor. Defence in
 * depth: the guarantee lives next to the interpolation, not only at the
 * far-away edge that happens to call it today.
 *
 *   clampLimitOffset('5; DROP TABLE users', 40)  ->  { limit: 5,   offset: 40 }
 *   clampLimitOffset(undefined, undefined)       ->  { limit: 20,  offset: 0 }
 *   clampLimitOffset(-4, -100)                   ->  { limit: 1,   offset: 0 }
 *   clampLimitOffset(99999, 50_000_000)          ->  { limit: 100, offset: 10_000_000 }
 *
 * There is no string that survives either clamp as a string.
 */
function clampLimitOffset(limit, offset, fallbackLimit = 20) {
  return {
    limit: clamp(limit, clamp(fallbackLimit, 20, MAX_LIMIT), MAX_LIMIT),
    offset: clampOffset(offset),
  }
}

/**
 * Page and limit as integers, plus the OFFSET they imply.
 *
 * `fallbackLimit` is the caller's default, itself clamped -- a bad
 * default in code should not be able to produce an unbounded query
 * any more than a bad one in a URL can.
 */
function parsePagination(query = {}, fallbackLimit = 20) {
  const limit = clamp(query.limit, clamp(fallbackLimit, 20, MAX_LIMIT), MAX_LIMIT)
  const page = clamp(query.page, 1, MAX_PAGE)
  return { page, limit, offset: (page - 1) * limit }
}

/**
 * The same thing, with the default taken from the `default_page_size`
 * platform setting so the admin's choice on /admin/settings actually
 * changes the page size. (Without this, that setting would be a switch
 * that lies -- see the note at the top of settingsModel.js.)
 */
async function resolvePagination(query = {}) {
  const fallback = await settingsModel.get('default_page_size')
  return parsePagination(query, fallback)
}

/**
 * The envelope every paginated admin response carries.
 *
 * `totalPages` is computed here rather than in the frontend because
 * the frontend would have to duplicate the ceiling division, and the
 * two would disagree the first time `total` was 0 -- Math.ceil(0/20)
 * is 0 pages, which renders as "Page 1 of 0". Answering 1 keeps the
 * pager honest for an empty table.
 */
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
