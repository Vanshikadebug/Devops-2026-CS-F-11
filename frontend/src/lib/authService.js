import { api } from './api.js'

async function register(payload) {
  const response = await api.post('/auth/register', payload)
  // token and user arrive under `data` -- the same envelope every
  // other service unwraps. The shape returned to callers is unchanged.
  return { token: response.data.token, user: response.data.user }
}

async function login(email, password) {
  const response = await api.post('/auth/login', { email, password })
  // Same { success, message, data: { token, user } } envelope as register.
  return { token: response.data.token, user: response.data.user }
}

async function getCurrentUser({ signal } = {}) {
  const response = await api.get('/auth/me', { signal })
  // /auth/me returns { success, data: { user } } -- unwrap to the user.
  return response.data.user
}

export const authService = { register, login, getCurrentUser }
