/**
 * services/api.js -- the ONLY file in the frontend that calls fetch().
 *
 * WHAT IS THIS FILE?
 * A thin wrapper around the browser's fetch(), plus the rules every
 * request to our API should follow: how to send JSON, how to read the
 * { success, message, data } envelope, and how to turn a failure into
 * an Error that a component can display.
 *
 * WHY NOT JUST CALL fetch() IN EACH COMPONENT?
 * Because the same six lines of error handling would be copied into
 * every page, and the copies would drift. More importantly, fetch has
 * one genuinely surprising behaviour that catches everyone:
 *
 * >>> fetch() DOES NOT THROW ON 404 OR 500. <<<
 *
 * This looks correct and is badly wrong:
 *
 *     try {
 *       const res = await fetch('/api/items')
 *       const data = await res.json()      // runs even on a 500!
 *       setItems(data)                     // sets an error object
 *     } catch (err) {
 *       setError(err)                      // never reached
 *     }
 *
 * fetch only rejects when the request could not be MADE at all --
 * no network, DNS failure, server not listening. A server that
 * answers "404 Not Found" answered successfully, as far as fetch is
 * concerned, so `res.ok` must be checked by hand. Every single time.
 * Forget once and a failed request renders as a blank page with no
 * error anywhere. Checking it here means it cannot be forgotten.
 *
 * WHY ARE THE URLs RELATIVE ('/api/items', not 'http://localhost:5000/api/items')?
 * See vite.config.js. A relative path is same-origin, so the browser
 * runs no CORS check, and Vite forwards it to the backend. The same
 * relative path also works in production behind nginx. Hard-coding
 * the host would mean editing every call site before deployment --
 * and forgetting one produces a site that works locally and breaks
 * only for real users.
 */

import { getToken } from './tokenStorage.js'

/** Every endpoint lives under /api. Written once, here. */
const API_BASE = '/api'

/**
 * An error carrying the HTTP status alongside the message.
 *
 * Components need the status to react differently: 401 should send
 * the user to the login page (Phase 6), 404 should show "not found",
 * anything else shows the message. A plain Error loses that.
 *
 * `status: 0` is our marker for "the request never arrived" -- there
 * is no HTTP status because there was no HTTP response.
 */
export class ApiError extends Error {
  constructor(message, status = 0, details = undefined) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

/**
 * Performs one request and returns the parsed JSON body.
 * Throws ApiError on any failure.
 */
async function request(path, { method = 'GET', body, signal, headers = {} } = {}) {
  let response

  /* ---------------------------------------------------------------
     THE AUTHORIZATION HEADER
     ---------------------------------------------------------------
     Read fresh from storage on EVERY request, rather than captured
     once when this module loads. That ordering matters: this file is
     imported before the user has logged in, so a value read at import
     time would be null forever, and every protected request after
     login would 401 until a full page refresh.

     Attached to every request, not only the ones we believe need it.
     The alternative -- a `requiresAuth: true` flag per call site --
     means remembering to pass it, and forgetting produces a 401 that
     looks like a backend bug. Sending it unconditionally is safe
     because the token only ever goes to our own origin (the URL is
     relative, so it cannot be pointed at a third party), and public
     endpoints simply ignore it.

     `protect` on the server is what actually enforces anything. This
     header is how we ASK; the backend decides. */
  const token = getToken()
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      // Only send Content-Type when there IS a body. Sending it on a
      // GET is harmless but misleading, and some servers reject it.
      headers:
        body === undefined
          ? { ...authHeaders, ...headers }
          : { 'Content-Type': 'application/json', ...authHeaders, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Lets the caller cancel this request -- see the AbortController
      // in Home.jsx and the note on why that matters.
      signal,
    })
  } catch (err) {
    // Cancellation is not a failure; the caller asked for it. Rethrow
    // unchanged so the caller can recognise and ignore it.
    if (err.name === 'AbortError') throw err

    // The only errors fetch itself raises: the server is down, the
    // machine is offline, DNS failed. The message names the most
    // likely cause during development instead of the browser's
    // unhelpful "Failed to fetch".
    throw new ApiError(
      'Could not reach the server. Is the backend running on port 5000?',
      0,
    )
  }

  // Parse the body BEFORE checking response.ok, because our error
  // responses are JSON too and contain the message worth showing.
  //
  // The content-type guard matters: if the proxy is misconfigured,
  // Vite returns its own HTML error page. Calling .json() on HTML
  // throws "Unexpected token '<'" -- a message that tells you nothing
  // about the real problem, which is that the backend is not running.
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
    /* A 502/503/504 does not come from our API -- it comes from
       whatever sits in front of it. It means the proxy is running
       but the backend behind it is not answering.

       This case was found by testing rather than by reasoning: with
       Express stopped, Vite replies `502 Bad Gateway` as PLAIN TEXT.
       fetch() does not reject (Vite answered perfectly well), and the
       body is not JSON, so without this branch the user would see the
       useless "Request failed (HTTP 502)" instead of being told the
       actual problem. nginx behaves the same way in production. */
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

/**
 * The public interface. Components call api.get('/items'), never
 * fetch() directly.
 *
 * `del`, not `delete` -- `delete` is a reserved word in JavaScript
 * and cannot be used as a shorthand method name here. `patch` is not
 * reserved, so it keeps its real name.
 *
 * WHY BOTH put AND patch, WHEN THEY DIFFER BY ONE STRING?
 * Because the two mean different things to the server, and the
 * distinction is worth keeping visible at the call site. PUT sends
 * the complete new state of a resource; PATCH sends only what
 * changes. `api.patch('/items/7/status', { status })` cannot blank
 * the description by accident, and a reader of the calling code can
 * see that from the method name alone.
 */
export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' }),
}
