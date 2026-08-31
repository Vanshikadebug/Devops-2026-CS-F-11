import { api } from './api.js'

async function getAll(filters = {}, { signal } = {}) {
  const query = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, value)
  })

  const suffix = query.toString() ? `?${query}` : ''
  const response = await api.get(`/items${suffix}`, { signal })
  return response.data ?? []
}

/** One item by id. Throws ApiError with status 404 if absent. */
async function getById(id, { signal } = {}) {
  const response = await api.get(`/items/${id}`, { signal })
  return response.data
}

/** The signed-in user's own items. GET /api/items/mine. */
async function getMine(filters = {}, { signal } = {}) {
  const query = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, value)
  })

  const suffix = query.toString() ? `?${query}` : ''
  const response = await api.get(`/items/mine${suffix}`, { signal })
  return response.data ?? []
}

function toRequestBody(form) {
  return {
    name: form.name,
    description: form.description,
    category: form.category,
    condition: form.condition,
    /* `?? null` and not `|| null`: both give null for an unchosen
       college, but || would also swallow a legitimate 0 if ids ever
       started there. The habit is what matters more than this case. */
    collegeId: form.collegeId ?? null,
    location: form.collegeId ? '' : form.location ?? '',
    imageUrl: form.imageUrl ?? '',
    status: form.status || 'Available',
  }
}

async function create(form) {
  const response = await api.post('/items', toRequestBody(form))
  return response.data
}

/** PUT /api/items/:id -- full replacement. 403 if not yours. */
async function update(id, form) {
  const response = await api.put(`/items/${id}`, toRequestBody(form))
  return response.data
}

async function updateStatus(id, status) {
  const response = await api.patch(`/items/${id}/status`, { status })
  return response.data
}

async function remove(id) {
  await api.del(`/items/${id}`)
  return true
}

export const itemService = {
  getAll,
  getById,
  getMine,
  create,
  update,
  updateStatus,
  remove,
}
