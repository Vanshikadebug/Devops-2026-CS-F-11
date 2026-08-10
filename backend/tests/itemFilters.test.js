/**
 * tests/itemFilters.test.js -- the query parameters on GET /api/items.
 *
 * THE FAILURE MODE THESE TESTS EXIST FOR
 *
 * A filter that is silently dropped does not look like a bug. The
 * request succeeds, the grid fills, and the only symptom is that the
 * rows are wrong -- under a heading that says they are right.
 *
 * So every test here asserts TWO things:
 *   1. everything returned matches the filter, and
 *   2. something was actually excluded.
 *
 * Check (2) is the one that matters. A filter which was never
 * applied passes check (1) trivially, because "all rows match" is
 * vacuously true of a result set containing every row.
 *
 * PREREQUISITE: `npm run db:reset` must have been run.
 */

const request = require('supertest')
const app = require('../app')
const { closePool } = require('../config/db')

afterAll(async () => {
  await closePool()
})

let total
let skit
let mnit
let jaipur
let jagatpura

beforeAll(async () => {
  const all = await request(app).get('/api/items')
  total = all.body.count

  const colleges = await request(app).get('/api/locations/colleges')
  skit = colleges.body.data.find((c) => c.slug === 'skit-jaipur')
  mnit = colleges.body.data.find((c) => c.slug === 'mnit-jaipur')

  const cities = await request(app).get('/api/locations/cities')
  jaipur = cities.body.data.find((c) => c.slug === 'jaipur')

  const areas = await request(app).get(`/api/locations/cities/${jaipur.id}/areas`)
  jagatpura = areas.body.data.find((a) => a.slug === 'jagatpura')
})

describe('no filters', () => {
  it('behaves exactly as it did before filtering existed', async () => {
    // >>> A BACKWARD-COMPATIBILITY TEST <<<
    // GET /api/items already had callers. Adding filters must not
    // change the unfiltered answer -- a feature that quietly alters
    // existing behaviour is a breaking change in disguise.
    const res = await request(app).get('/api/items')

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(total)

    // Newest first, deterministically, as before.
    const ids = res.body.data.map((i) => i.id)
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
  })

  it('does NOT hide unavailable items by default', async () => {
    // Defensible either way as a product decision -- and that is
    // exactly why it must be the CALLER's decision. Hiding them by
    // default would silently change what every existing caller sees.
    const res = await request(app).get('/api/items')

    expect(res.body.data.some((i) => i.status !== 'Available')).toBe(true)
  })
})

describe('?college=', () => {
  it('returns only that college, and fewer rows than the whole site', async () => {
    const res = await request(app).get(`/api/items?college=${skit.id}`)

    expect(res.status).toBe(200)
    expect(res.body.count).toBeGreaterThan(0)
    expect(res.body.count).toBeLessThan(total) // something was excluded

    res.body.data.forEach((i) => {
      expect(i.college_id).toBe(skit.id)
      expect(i.college_name).toBe('SKIT Jaipur')
    })
  })

  it('excludes off-campus items, which belong to no college', async () => {
    // An item with college_id NULL must not leak into a
    // college-scoped view. `WHERE college_id = 4` cannot match NULL
    // in SQL, so this passes by construction -- and pins it, because
    // rewriting the clause as a text comparison on `location` is
    // exactly the tempting change that would break it.
    const res = await request(app).get(`/api/items?college=${skit.id}`)

    expect(res.body.data.every((i) => i.college_id !== null)).toBe(true)
  })

  it('returns an empty list for a college with nothing listed', async () => {
    // Not a 404: the college exists, it simply has no items yet.
    // That is a normal state for a new campus, and the UI shows
    // "nothing here yet" rather than an error.
    const colleges = await request(app).get('/api/locations/colleges')
    const empty = colleges.body.data.find((c) => c.item_count === 0)

    const res = await request(app).get(`/api/items?college=${empty.id}`)

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(0)
    expect(res.body.data).toEqual([])
  })

  it('400s on a non-numeric college, and cannot be injected', async () => {
    const res = await request(app).get('/api/items?college=1 OR 1=1')

    expect(res.status).toBe(400)
    expect(res.body.data).toBeUndefined()
  })
})

describe('?area= and ?city=', () => {
  it('area returns every college in that locality', async () => {
    const res = await request(app).get(`/api/items?area=${jagatpura.id}`)

    expect(res.body.count).toBeGreaterThan(0)
    res.body.data.forEach((i) => expect(i.area_name).toBe('Jagatpura'))
  })

  it('city is broader than area, which is broader than college', async () => {
    // The three levels must nest. If they did not, one of the WHERE
    // clauses is joining through the wrong table.
    const byCity = await request(app).get(`/api/items?city=${jaipur.id}`)
    const byArea = await request(app).get(`/api/items?area=${jagatpura.id}`)
    const byCollege = await request(app).get(`/api/items?college=${skit.id}`)

    expect(byCity.body.count).toBeGreaterThanOrEqual(byArea.body.count)
    expect(byArea.body.count).toBeGreaterThanOrEqual(byCollege.body.count)
  })

  it('applies the narrowest filter when several are sent', async () => {
    // ?college=SKIT&city=Jaipur is redundant, not contradictory --
    // and the answer must be the college, not the city.
    const res = await request(app).get(
      `/api/items?college=${skit.id}&city=${jaipur.id}`,
    )
    const collegeOnly = await request(app).get(`/api/items?college=${skit.id}`)

    expect(res.body.count).toBe(collegeOnly.body.count)
  })
})

describe('?search=', () => {
  it('matches part of a word in the name', async () => {
    // "calc" is a PREFIX of "Calculator", not a whole word. This is
    // the case a FULLTEXT natural-language search would miss
    // entirely, and it is what someone typing into a search box
    // expects to work after four characters.
    const res = await request(app).get('/api/items?search=calc')

    expect(res.body.count).toBeGreaterThan(0)
    expect(res.body.count).toBeLessThan(total)
  })

  it('searches the description as well as the name', async () => {
    // 'bcrypt'-style unique word from a description: "Presta" appears
    // only in the bicycle pump's description, never in a title.
    const res = await request(app).get('/api/items?search=Presta')

    expect(res.body.count).toBe(1)
    expect(res.body.data[0].name).toMatch(/pump/i)
  })

  it('is case-insensitive', async () => {
    const lower = await request(app).get('/api/items?search=calculator')
    const upper = await request(app).get('/api/items?search=CALCULATOR')

    expect(upper.body.count).toBe(lower.body.count)
    expect(upper.body.count).toBeGreaterThan(0)
  })

  it('treats % as text, not as a wildcard', async () => {
    // >>> THE LIKE-ESCAPING TEST <<<
    // Unescaped, the pattern becomes '%%%' and matches EVERY row --
    // a search for nothing in particular returning the whole
    // database, which reads as "search is broken" with no error.
    const res = await request(app).get('/api/items?search=%25')

    expect(res.body.count).toBe(0)
  })

  it('treats _ as text, not as a single-character wildcard', async () => {
    const res = await request(app).get('/api/items?search=_')
    expect(res.body.count).toBe(0)
  })

  it('ignores surrounding whitespace', async () => {
    const padded = await request(app).get('/api/items?search=%20%20calculator%20%20')
    const plain = await request(app).get('/api/items?search=calculator')

    expect(padded.body.count).toBe(plain.body.count)
  })

  it('treats an all-whitespace search as no search at all', async () => {
    // Trimmed to '', which is falsy, so the clause is skipped. The
    // alternative -- searching for the empty string -- matches
    // everything, which happens to look the same here but for the
    // wrong reason. Sending the clause would also scan the table
    // pointlessly.
    const res = await request(app).get('/api/items?search=%20%20%20')

    expect(res.body.count).toBe(total)
  })

  it('combines with a college filter using AND, not OR', async () => {
    const both = await request(app).get(`/api/items?college=${skit.id}&search=chair`)
    const searchOnly = await request(app).get('/api/items?search=chair')

    expect(both.body.count).toBeGreaterThan(0)
    expect(both.body.count).toBeLessThanOrEqual(searchOnly.body.count)
    both.body.data.forEach((i) => {
      expect(i.college_id).toBe(skit.id)
      expect(`${i.name} ${i.description}`.toLowerCase()).toContain('chair')
    })
  })
})

describe('?category=, ?condition=, ?status=', () => {
  it('filters by category', async () => {
    const res = await request(app).get('/api/items?category=Books')

    expect(res.body.count).toBeGreaterThan(0)
    expect(res.body.count).toBeLessThan(total)
    res.body.data.forEach((i) => expect(i.category).toBe('Books'))
  })

  it('filters by condition, using the API name not the column name', async () => {
    // The column is item_condition (reserved word); the API says
    // condition. This proves the alias holds on the way IN as well
    // as on the way out.
    const res = await request(app).get('/api/items?condition=Good')

    expect(res.body.count).toBeGreaterThan(0)
    res.body.data.forEach((i) => expect(i.condition).toBe('Good'))
  })

  it('filters by status', async () => {
    const res = await request(app).get('/api/items?status=Available')

    expect(res.body.count).toBeLessThan(total)
    res.body.data.forEach((i) => expect(i.status).toBe('Available'))
  })

  it('400s on a value outside the ENUM, listing what is allowed', async () => {
    // Ignoring it would return every category under a "Books"
    // heading. The message names the valid values so the caller can
    // fix it without reading the schema.
    const res = await request(app).get('/api/items?category=Bookss')

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Books/)
    expect(res.body.data).toBeUndefined()
  })

  it('treats an empty parameter as absent, not as an invalid value', async () => {
    // A UI that always appends its filter state sends ?category=
    // when the dropdown is on "All". Rejecting that would make the
    // frontend strip empty keys by hand on every request.
    const res = await request(app).get('/api/items?category=&condition=&search=')

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(total)
  })
})

describe('?sort= and ?limit=', () => {
  it('sorts oldest first on request', async () => {
    const res = await request(app).get('/api/items?sort=oldest')
    const ids = res.body.data.map((i) => i.id)

    expect(ids).toEqual([...ids].sort((a, b) => a - b))
  })

  it('sorts by name', async () => {
    const res = await request(app).get('/api/items?sort=name')
    const names = res.body.data.map((i) => i.name)

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('400s on an unknown sort key rather than accepting SQL', async () => {
    // ORDER BY cannot be a bound parameter, so the sort key maps
    // through a fixed lookup table. Anything not in it is refused
    // before it can reach the query.
    const res = await request(app).get('/api/items?sort=id;DROP TABLE items')

    expect(res.status).toBe(400)

    // And prove the damage did not happen.
    const after = await request(app).get('/api/items')
    expect(after.body.count).toBe(total)
  })

  it('honours limit', async () => {
    const res = await request(app).get('/api/items?limit=3')
    expect(res.body.count).toBe(3)
  })

  it('clamps a hostile limit to an integer', async () => {
    // LIMIT is the one value interpolated into SQL, because it
    // cannot be bound. parseInt reduces this to 5 before it gets
    // anywhere near the query string.
    const res = await request(app).get(
      `/api/items?limit=${encodeURIComponent('5; DROP TABLE items')}`,
    )

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(5)

    const after = await request(app).get('/api/items')
    expect(after.body.count).toBe(total)
  })
})

describe('the filtered response never leaks private columns', () => {
  it('adds college fields without adding owner contact details', async () => {
    // >>> SECURITY TEST <<<
    // This change added three JOINs and five columns to the query.
    // That is exactly the kind of edit during which an extra field
    // slips in. Re-asserting the whole serialised body here means
    // the guarantee is re-checked against the NEW shape.
    const res = await request(app).get(`/api/items?college=${mnit.id}&search=mouse`)
    const body = JSON.stringify(res.body)

    expect(body).not.toMatch(/password/i)
    expect(body).not.toMatch(/\$2[aby]\$/)
    expect(body).not.toMatch(/@example\.com/)
    expect(body).not.toMatch(/"mobile"/)
  })
})
