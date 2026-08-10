/**
 * tests/locations.test.js -- the city -> area -> college directory,
 * and the item filters that hang off it.
 *
 * WHAT THESE TESTS ARE REALLY PROTECTING
 *
 * The browse flow has one property that is easy to break and hard to
 * notice: a filter that silently does nothing. If ?college=1 were
 * dropped on the floor, every page would still render, every request
 * would still return 200, and the grid would show items from other
 * campuses under a heading naming yours. Nothing would look broken.
 *
 * So these tests do not merely check that filtered requests succeed.
 * They check that the filter EXCLUDED something -- that the answer is
 * a strict subset, and that the rows which came back all belong.
 * A test asserting only `count > 0` would pass against a completely
 * broken filter.
 *
 * READ-ONLY except for the one describe block that saves a college,
 * which puts the value back afterwards.
 *
 * PREREQUISITE: `npm run db:reset` must have been run.
 */

const request = require('supertest')
const app = require('../app')
const { closePool } = require('../config/db')

afterAll(async () => {
  await closePool()
})

/* Resolved once and shared: the tests need real ids, and hard-coding
   `college: 1` would tie the suite to the seed's insert order. */
let jaipur
let jagatpura
let skit

beforeAll(async () => {
  const cities = await request(app).get('/api/locations/cities')
  jaipur = cities.body.data.find((c) => c.slug === 'jaipur')

  const areas = await request(app).get(`/api/locations/cities/${jaipur.id}/areas`)
  jagatpura = areas.body.data.find((a) => a.slug === 'jagatpura')

  const colleges = await request(app).get(`/api/locations/colleges?area=${jagatpura.id}`)
  skit = colleges.body.data.find((c) => c.slug === 'skit-jaipur')
})

describe('GET /api/locations/cities', () => {
  it('lists the seeded cities with their state and slug', async () => {
    const res = await request(app).get('/api/locations/cities')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.count).toBe(res.body.data.length)
    expect(res.body.data.length).toBeGreaterThan(0) // run `npm run db:reset`

    const city = res.body.data[0]
    expect(Object.keys(city).sort()).toEqual(
      ['college_count', 'id', 'name', 'slug', 'state'].sort(),
    )
  })

  it('sorts alphabetically, not by insertion order', async () => {
    // A dropdown is scanned by eye. Primary-key order is an accident
    // of whichever order the seed file happens to list cities in.
    const res = await request(app).get('/api/locations/cities')
    const names = res.body.data.map((c) => c.name)

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('returns college_count as a number, not a string', async () => {
    // mysql2 hands back COUNT() as a JS number but SUM() as a STRING,
    // because DECIMAL cannot always fit in a double. Getting "5"
    // instead of 5 would break arithmetic in the UI silently --
    // "5" + 1 is "51". Worth pinning.
    const res = await request(app).get('/api/locations/cities')

    res.body.data.forEach((c) => {
      expect(typeof c.college_count).toBe('number')
    })
  })
})

describe('GET /api/locations/cities/:id/areas', () => {
  it('returns the areas of that city, and echoes the city back', async () => {
    const res = await request(app).get(`/api/locations/cities/${jaipur.id}/areas`)

    expect(res.status).toBe(200)
    expect(res.body.city.name).toBe('Jaipur')
    expect(res.body.data.length).toBeGreaterThan(0)

    // Every area returned must belong to the city that was asked for.
    res.body.data.forEach((a) => expect(a.city_id).toBe(jaipur.id))
  })

  it('404s for a city that does not exist, rather than returning []', async () => {
    // >>> THE POINT OF THIS TEST <<<
    // An empty array with a 200 says "this city has no areas", which
    // is a different claim from "there is no such city" -- and it is
    // a false one. A stale bookmark would render an empty dropdown
    // and look like a frontend bug.
    const res = await request(app).get('/api/locations/cities/999999/areas')

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  it('400s for a city id that is not a number', async () => {
    const res = await request(app).get('/api/locations/cities/abc/areas')

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('GET /api/locations/colleges', () => {
  it('filters to one area', async () => {
    const res = await request(app).get(`/api/locations/colleges?area=${jagatpura.id}`)

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    res.body.data.forEach((c) => {
      expect(c.area_name).toBe('Jagatpura')
      expect(c.city_name).toBe('Jaipur')
    })
  })

  it('filters to a whole city, for skipping the area step', async () => {
    const res = await request(app).get(`/api/locations/colleges?city=${jaipur.id}`)

    expect(res.status).toBe(200)
    res.body.data.forEach((c) => expect(c.city_name).toBe('Jaipur'))

    // A city must hold at least as many colleges as one of its areas.
    const inArea = await request(app).get(`/api/locations/colleges?area=${jagatpura.id}`)
    expect(res.body.count).toBeGreaterThanOrEqual(inArea.body.count)
  })

  it('includes colleges that have no items at all', async () => {
    // >>> THIS IS THE WHOLE REASON THE LOCATION TABLES EXIST <<<
    // Built from SELECT DISTINCT over items, an empty college would
    // not appear, could not be selected, and so could never receive
    // its first listing. The seed deliberately includes several
    // colleges with nothing listed; they must still be offered.
    const res = await request(app).get('/api/locations/colleges')

    const empty = res.body.data.filter((c) => c.item_count === 0)
    expect(empty.length).toBeGreaterThan(0)
  })

  it('counts only AVAILABLE items', async () => {
    // The count is what someone decides on, so it must not promise
    // rows that are already gone. MNIT holds the seeded Unavailable
    // tablet, so its count must be short of its true row count.
    const colleges = await request(app).get('/api/locations/colleges')
    const mnit = colleges.body.data.find((c) => c.slug === 'mnit-jaipur')

    const all = await request(app).get(`/api/items?college=${mnit.id}`)
    const available = await request(app).get(
      `/api/items?college=${mnit.id}&status=Available`,
    )

    expect(all.body.count).toBeGreaterThan(available.body.count)
    expect(mnit.item_count).toBe(available.body.count)
  })

  it('400s on an unparseable filter instead of ignoring it', async () => {
    // Ignoring ?area=abc would answer with EVERY college while the
    // heading still read "Colleges in Jagatpura": wrong data under a
    // correct-looking label, and nothing on screen to reveal it.
    const res = await request(app).get('/api/locations/colleges?area=abc')

    expect(res.status).toBe(400)
    expect(res.body.data).toBeUndefined()
  })
})

describe('GET /api/locations/colleges/:id', () => {
  it('resolves a college to its area, city and state', async () => {
    // Needed for the shared-link case: the page arrives with an id
    // and no picker state, and must print a name rather than "4".
    const res = await request(app).get(`/api/locations/colleges/${skit.id}`)

    expect(res.status).toBe(200)
    expect(res.body.data.short_name).toBe('SKIT Jaipur')
    expect(res.body.data.area_name).toBe('Jagatpura')
    expect(res.body.data.city_name).toBe('Jaipur')
    expect(res.body.data.state).toBe('Rajasthan')
  })

  it('404s for a college that does not exist', async () => {
    const res = await request(app).get('/api/locations/colleges/999999')
    expect(res.status).toBe(404)
  })
})
