const request = require('supertest')
const app = require('../src/app')

describe('GET /metrics', () => {
  it('returns 200 and Prometheus metrics format', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.text).toContain('reusehub_')
    expect(res.text).toContain('reusehub_http_requests_total')
  })
})
