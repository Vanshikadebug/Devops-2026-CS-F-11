const request = require('supertest')
const app = require('../src/app')

describe('GET /api/health', () => {
  it('returns 200 and confirms the API is running', async () => {
    const response = await request(app).get('/api/health')

    expect(response.statusCode).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.message).toBe('ReuseHub API is running')
    expect(response.body).toHaveProperty('database')
    expect(response.body).toHaveProperty('redis')
  })
})