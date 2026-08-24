/**
 * tests/pagination.test.js -- the two numbers that reach SQL as text.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS UNIT AND NOT HTTP
 * Every other test here drives the API through supertest. These do not,
 * for a deliberate reason: the functions this guards -- the LIMIT/OFFSET
 * clamps in utils/pagination.js -- protect the five admin list queries
 * (items, users, colleges, reports, audit log), and those have no HTTP
 * route yet. There is no URL to send a hostile ?limit= to. So the guard
 * is tested where it lives.
 *
 * >>> THE FAILURE MODE <<<
 * LIMIT and OFFSET cannot be bound parameters in MySQL's prepared-
 * statement protocol -- `LIMIT ?` is a syntax error. They are therefore
 * the ONLY two values in this project interpolated into SQL text rather
 * than sent as bound parameters. That makes them the one place an
 * injection could live, and the whole job of clampLimitOffset is to
 * guarantee that whatever comes in, an integer comes out. Every test
 * below is a hostile or malformed input paired with the integer it must
 * become.
 *
 * These functions are pure -- no database, no network -- but requiring
 * the module pulls in settingsModel, which opens the connection pool.
 * closePool in afterAll stops Jest hanging on the open handle.
 */

const {
  clampLimitOffset,
  parsePagination,
  paginationMeta,
  MAX_LIMIT,
} = require('../utils/pagination')
const { closePool } = require('../config/db')

afterAll(async () => {
  await closePool()
})

describe('clampLimitOffset -- the last line before interpolation', () => {
  it('reduces an injected LIMIT to the integer at its front', () => {
    // The classic payload. parseInt stops at the first non-digit, so the
    // string never survives as a string -- it becomes 5, and `; DROP
    // TABLE users` is gone before the value is anywhere near the query.
    const { limit } = clampLimitOffset('5; DROP TABLE users', 0)
    expect(limit).toBe(5)
  })

  it('reduces an injected OFFSET the same way', () => {
    const { offset } = clampLimitOffset(20, '40; DELETE FROM items')
    expect(offset).toBe(40)
  })

  it('falls back when the input is not a number at all', () => {
    // 'abc' has no leading digits, so parseInt gives NaN. The limit
    // falls back to its default; the offset, which has no sensible
    // non-zero default, falls back to 0 (the first row).
    const { limit, offset } = clampLimitOffset('abc', 'xyz')
    expect(limit).toBe(20)
    expect(offset).toBe(0)
  })

  it('floors a negative limit at 1 and a negative offset at 0', () => {
    // A LIMIT of 0 or below returns nothing or errors; an OFFSET cannot
    // be a negative row position. Both are floored rather than rejected
    // so a bad caller gets the safe edge of the range, not a 500.
    const { limit, offset } = clampLimitOffset(-4, -100)
    expect(limit).toBe(1)
    expect(offset).toBe(0)
  })

  it('caps a huge limit at MAX_LIMIT so one request cannot dump the table', () => {
    const { limit } = clampLimitOffset(99999, 0)
    expect(limit).toBe(MAX_LIMIT)
  })

  it('leaves an ordinary page of values untouched, offset 0 included', () => {
    // The common case must pass through cleanly: this is what a correct
    // caller sends, and clamping must not corrupt a valid request.
    expect(clampLimitOffset(20, 0)).toEqual({ limit: 20, offset: 0 })
    expect(clampLimitOffset(50, 100)).toEqual({ limit: 50, offset: 100 })
  })

  it('uses a caller-supplied default, itself clamped', () => {
    // A bad default in code should not be able to produce an unbounded
    // query any more than a bad one in a URL can.
    expect(clampLimitOffset(undefined, undefined, 30).limit).toBe(30)
    expect(clampLimitOffset(undefined, undefined, 99999).limit).toBe(MAX_LIMIT)
  })
})

describe('parsePagination -- ?page=&limit= into limit + offset', () => {
  it('computes the offset from page and limit', () => {
    // Page 3 at 20 per page starts after the first 40 rows.
    expect(parsePagination({ page: 3, limit: 20 })).toEqual({
      page: 3,
      limit: 20,
      offset: 40,
    })
  })

  it('defaults to page 1 at the fallback size', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 })
    expect(parsePagination({}, 50)).toEqual({ page: 1, limit: 50, offset: 0 })
  })

  it('clamps a hostile page and limit before doing the arithmetic', () => {
    // Both values are interpolated downstream, so both are clamped here.
    const { page, limit } = parsePagination({
      page: '2; DROP TABLE items',
      limit: '5; DROP TABLE items',
    })
    expect(page).toBe(2)
    expect(limit).toBe(5)
  })
})

describe('paginationMeta -- what the pager reads', () => {
  it('marks the boundaries with hasPrev / hasNext', () => {
    const first = paginationMeta({ page: 1, limit: 10 }, 25)
    expect(first).toMatchObject({ totalPages: 3, hasPrev: false, hasNext: true })

    const last = paginationMeta({ page: 3, limit: 10 }, 25)
    expect(last).toMatchObject({ totalPages: 3, hasPrev: true, hasNext: false })
  })

  it('answers 1 page for an empty table, never 0', () => {
    // Math.ceil(0 / 10) is 0, which renders as "Page 1 of 0". Reporting
    // at least one page keeps the pager honest when there is nothing yet.
    const meta = paginationMeta({ page: 1, limit: 10 }, 0)
    expect(meta.totalPages).toBe(1)
    expect(meta.hasNext).toBe(false)
  })
})
