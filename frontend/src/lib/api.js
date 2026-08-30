import { getToken } from './tokenStorage.js'
import { API_BASE } from './origin.js'

/** Every endpoint lives under /api. Written once, here. */


export class ApiError extends Error {
  constructor(message, status = 0, details = undefined) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function request(path, { method = 'GET', body, signal, headers = {} } = {}) {
  let response

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  const token = getToken()
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      // Only send Content-Type when there IS a body. Sending it on a
      // GET is harmless but misleading, and some servers reject it.
      headers:
        body === undefined || isFormData
          // FormData sets its own Content-Type, including the multipart
          // boundary. Setting it by hand produces a boundary-less header and
          // the server parses no fields at all.
          ? { ...authHeaders, ...headers }
          : { 'Content-Type': 'application/json', ...authHeaders, ...headers },
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      // Lets the caller cancel this request -- see the AbortController
      // in Home.jsx and the note on why that matters.
      signal,
    })
  } catch (err) {
    // Cancellation is not a failure; the caller asked for it. Rethrow
    // unchanged so the caller can recognise and ignore it.
    if (err.name === 'AbortError') throw err

    throw new ApiError(
      'Could not reach the server. Is the backend running on port 5000?',
      0,
    )
  }

  const contentType = response.headers.get('content-type') || ''
  let payload = null

  if (contentType.includes('application/json')) {
    try {
      payload = await response.json()
    } catch {
      payload = null // Content-Type lied, or the body was truncated.
    }
  }

  if (!response.ok) {
    if ([502, 503, 504].includes(response.status)) {
      throw new ApiError(
        'The server is not responding. Make sure the backend is running on port 5000.',
        response.status,
      )
    }

    throw new ApiError(
      payload?.message || `Request failed (HTTP ${response.status})`,
      response.status,
      payload?.details,
    )
  }

  if (payload === null) {
    throw new ApiError(
      'The server replied with something that was not JSON. Check that the backend is running and the Vite proxy is configured.',
      response.status,
    )
  }

  return payload
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' }),

  /** Uploads one File and returns its stored URL. */
  async uploadImage(file, options) {
    const form = new FormData()
    form.append('image', file)
    const res = await request('/uploads/image', { ...options, method: 'POST', body: form })
    return res.data
  },
}
