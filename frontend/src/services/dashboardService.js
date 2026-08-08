/**
 * services/dashboardService.js -- the dashboard endpoint, named.
 *
 * Same job as itemService.js: the page asks for what it wants, and
 * this file knows the URL and the envelope.
 *
 * >>> WHAT THIS FILE DOES *NOT* DO, AND WHY IT MATTERS <<<
 * It does not send a user id. There is nowhere to put one -- the URL
 * has no parameter and the request has no body. That is deliberate.
 * The server reads the id from the token, so this function CANNOT
 * ask for anyone else's dashboard even by mistake.
 *
 * The token itself is attached by api.js, which reads it from
 * tokenStorage on every request. So there is no auth code here
 * either: one file attaches the header, and every service benefits.
 */

import { api } from './api.js'

/**
 * The logged-in user's dashboard: profile, stats and recent items.
 *
 * Returns { user, stats, recentItems }.
 *
 * Throws ApiError with status 401 if the token is missing, expired or
 * invalid -- the page turns that into a redirect to /login rather
 * than an error message, because "log in again" is the actual fix.
 */
async function get({ signal } = {}) {
  const response = await api.get('/dashboard', { signal })
  return response.data
}

export const dashboardService = { get }
