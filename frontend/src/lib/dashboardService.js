import { api } from './api.js'

async function get({ signal } = {}) {
  const response = await api.get('/dashboard', { signal })
  return response.data
}

export const dashboardService = { get }
