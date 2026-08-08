/**
 * services/authService.js -- the auth endpoints, named.
 *
 * WHAT IS THIS FILE?
 * The same idea as itemService.js: api.js knows HTTP, this file knows
 * what ReuseHub's auth endpoints are called and what they return. A
 * component calls authService.login(email, password) and never sees a
 * URL.
 *
 * WHY DOES IT NOT TOUCH tokenStorage?
 * Deliberately. This file is transport only -- it sends credentials
 * and returns whatever came back. Deciding to SAVE the token is a
 * session decision, and that belongs to AuthContext, which is also
 * the thing that has to update the UI when the session changes.
 *
 * If this file saved the token itself, the two would be able to
 * disagree: storage would hold a token while React state still said
 * "logged out", and the user would see a login page while every
 * request quietly succeeded. One owner for the session, and it is
 * AuthContext.
 */

import { api } from './api.js'

/**
 * Creates an account. Returns { token, user }.
 * Throws ApiError -- 409 if the email is taken, 400 with a `details`
 * array if a field is invalid.
 */
async function register(payload) {
  const response = await api.post('/auth/register', payload)
  return { token: response.token, user: response.user }
}

/**
 * Exchanges credentials for a token. Returns { token, user }.
 * Throws ApiError with status 401 if they do not match -- and the
 * message is deliberately the same whether the email is unknown or
 * the password is wrong, so the UI cannot leak which it was.
 */
async function login(email, password) {
  const response = await api.post('/auth/login', { email, password })
  return { token: response.token, user: response.user }
}

/**
 * Who does the currently stored token belong to?
 *
 * WHY THIS EXISTS AT ALL -- the important part of the file.
 * On refresh we hold a token from a previous visit, and we cannot
 * trust it: it may have expired, the account may have been deleted,
 * or JWT_SECRET may have been rotated. Nothing in the browser can
 * determine that. Only the server can.
 *
 * We could decode the token's payload locally and read the id without
 * any network call -- and that would be exactly the mistake this
 * project keeps warning about. The payload is base64, not encryption,
 * so anyone can edit it and re-encode. Believing it locally means
 * believing the attacker. So the token is sent to /api/auth/me and
 * the SERVER, holding the secret, decides whether it is genuine.
 *
 * The header is attached automatically by api.js.
 */
async function getCurrentUser({ signal } = {}) {
  const response = await api.get('/auth/me', { signal })
  return response.user
}

export const authService = { register, login, getCurrentUser }
