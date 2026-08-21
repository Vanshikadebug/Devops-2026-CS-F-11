/**
 * services/requestService.js -- request endpoints, named.
 *
 * The requester id is never sent. The server takes it from the token,
 * the same way itemService never sends a userId on create.
 */

import { api } from './api.js'

async function create({ itemId, message }) {
  const response = await api.post('/requests', {
    itemId,
    message: message ?? '',
  })
  return response.data
}

async function getSent(filters = {}, { signal } = {}) {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, value)
  })
  const suffix = query.toString() ? `?${query}` : ''
  const response = await api.get(`/requests/sent${suffix}`, { signal })
  return response.data ?? []
}

async function getReceived({ signal } = {}) {
  const response = await api.get('/requests/received', { signal })
  return response.data ?? []
}

async function updateStatus(id, status) {
  const response = await api.patch(`/requests/${id}`, { status })
  return response.data
}

export const requestService = {
  create,
  getSent,
  getReceived,
  updateStatus,
}
