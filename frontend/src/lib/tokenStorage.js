const TOKEN_KEY = 'reusehub.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // The session will not survive a refresh. Not worth breaking the
    // app over -- the token still lives in memory for this visit.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing useful to do. Not being able to remove a key we could
    // not write is consistent, at least.
  }
}
