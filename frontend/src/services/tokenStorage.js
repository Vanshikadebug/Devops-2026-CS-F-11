/**
 * services/tokenStorage.js -- the only place the JWT is read or written.
 *
 * WHAT IS THIS FILE?
 * Three functions over one localStorage key. That is genuinely all.
 *
 * WHY DOES IT DESERVE ITS OWN FILE?
 * Because two different modules need the token and they must never
 * disagree about where it lives:
 *
 *   - AuthContext WRITES it on login and CLEARS it on logout
 *   - api.js READS it to set the Authorization header
 *
 * If each used a string literal, one typo ('token' vs 'authToken')
 * would produce a bug that is genuinely nasty: login appears to work,
 * the UI shows you as signed in, and every protected request comes
 * back 401. One constant, imported by both, makes that impossible.
 *
 * ===============================================================
 * WHY localStorage? AN HONEST ACCOUNT OF THE TRADE-OFF
 * ===============================================================
 * There are two realistic places to keep a JWT in a browser, and
 * neither is simply "the secure one":
 *
 * 1. localStorage (what we use)
 *    Readable by any JavaScript on the page. If an attacker ever gets
 *    a script running on your origin -- an XSS hole -- they can read
 *    the token and impersonate the user until it expires.
 *    Immune to CSRF, because the browser never attaches it
 *    automatically; our code does, explicitly.
 *
 * 2. httpOnly cookie
 *    JavaScript cannot read it at all, so XSS cannot steal it.
 *    But the browser sends it automatically on every request to the
 *    origin -- including one triggered by a form on another site.
 *    That is CSRF, and it needs its own defence (SameSite plus a CSRF
 *    token) to be safe.
 *
 * So the choice is not "safe vs unsafe": it is which attack you
 * defend against in which way. We chose localStorage because it is
 * simpler to reason about, and because React gives us real XSS
 * resistance for free -- JSX escapes interpolated values, so
 * {item.description} renders <script> as visible text rather than
 * executing it. The rule that follows: never introduce
 * dangerouslySetInnerHTML into this project. That is the one API that
 * would undo the protection this decision depends on.
 *
 * If ReuseHub handled payments or medical data, this would deserve a
 * different answer -- httpOnly cookies with CSRF tokens, and
 * short-lived access tokens with refresh rotation.
 *
 * WHY sessionStorage IS NOT THE ANSWER EITHER: it clears when the tab
 * closes, which sounds safer but is the same XSS exposure with worse
 * usability -- the user is logged out every time they close the tab.
 */

/**
 * Namespaced so it cannot collide with another app on localhost.
 * During development every Vite project shares origin
 * http://localhost:5173, and localStorage is per-origin -- so a bare
 * key like 'token' is genuinely shared between your projects.
 */
const TOKEN_KEY = 'reusehub.token'

/**
 * Every access is wrapped in try/catch, because localStorage can
 * THROW rather than return null:
 *
 *   - Safari private browsing historically threw on setItem
 *   - a full quota throws QuotaExceededError
 *   - browsers configured to block site data throw on access
 *
 * An uncaught throw here would happen during the very first render
 * and blank the entire app. Degrading to "no saved session" is a far
 * better failure: the user logs in again, and everything else works.
 */
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
