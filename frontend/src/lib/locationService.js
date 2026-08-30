import { api } from './api.js'

async function getCities({ signal } = {}) {
  const response = await api.get('/locations/cities', { signal })
  return response.data ?? []
}

async function getAreas(cityId, { signal } = {}) {
  const response = await api.get(`/locations/cities/${cityId}/areas`, { signal })
  return response.data ?? []
}

async function getColleges({ areaId, cityId, signal } = {}) {
  const query = new URLSearchParams()
  if (areaId) query.set('area', areaId)
  if (cityId) query.set('city', cityId)

  const suffix = query.toString() ? `?${query}` : ''
  const response = await api.get(`/locations/colleges${suffix}`, { signal })
  return response.data ?? []
}

async function getCollege(collegeId, { signal } = {}) {
  const response = await api.get(`/locations/colleges/${collegeId}`, { signal })
  return response.data
}

async function saveMyCollege(collegeId, { signal } = {}) {
  const response = await api.put('/users/me/college', { collegeId }, { signal })
  // The updated user arrives under data.user now, the same envelope the
  // auth routes use. The value returned to callers is unchanged.
  return response.data.user
}

export const locationService = {
  getCities,
  getAreas,
  getColleges,
  getCollege,
  saveMyCollege,
}
