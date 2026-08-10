/**
 * context/AuthProvider.jsx -- the single owner of the session.
 *
 * WHAT IS THIS FILE?
 * The component that holds "who is logged in" and the two actions
 * that change it. It wraps the whole app in main.jsx, so every page
 * can call useAuth() and get the same answer.
 *
 * WHY DOES ONE OWNER MATTER SO MUCH?
 * Because a session lives in two places at once -- localStorage (so
 * it survives a refresh) and React state (so the UI re-renders) --
 * and those two CAN disagree. If several files wrote to storage,
 * you would get the classic bug: the Navbar shows "Login" while
 * requests are succeeding, or shows a name after logout. Every write
 * to both happens in this file, in the same function, so they cannot
 * drift apart.
 *
 * =================================================================
 * WHY THERE ARE THREE STATES, NOT TWO
 * =================================================================
 * The obvious model -- user or null, logged in or out -- has a hole
 * in it, and the hole causes a real, visible bug.
 *
 * On a refresh we have a token but do not yet know if it is valid;
 * finding out means asking the server, which takes a moment. During
 * that moment `user` is null. If null meant "logged out", then every
 * refresh of a protected page would:
 *
 *   1. render as logged out
 *   2. redirect to /login
 *   3. get the /me response saying the user is fine
 *   4. bounce back
 *
 * -- a flash of the login page on every refresh, and a lost page if
 * the redirect wins the race. So we track a third state, `loading`,
 * meaning "we do not know yet". ProtectedRoute waits for it rather
 * than deciding on incomplete information.
 *
 * That is the same distinction Home.jsx makes between "loading" and
 * "empty": absence of data is not the same as data showing absence.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContext'
import { authService } from '../services/authService'
import { getToken, setToken, clearToken } from '../services/tokenStorage'

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  /* Starts true only if there is a token to check. With no token we
     already know the answer -- logged out -- and starting `true`
     would make every visitor wait for a request we are not going to
     send. */
  const [loading, setLoading] = useState(() => Boolean(getToken()))

  /* ---------------------------------------------------------------
     RESTORING A SESSION ON PAGE LOAD
     ---------------------------------------------------------------
     Runs once on mount. If a token exists, ask the server who it
     belongs to. The server is the only thing that can answer: it
     holds JWT_SECRET, so only it can tell a genuine token from an
     edited one, and only it knows whether the account still exists.

     A FAILURE HERE IS NOT AN ERROR TO DISPLAY. An expired token is
     the normal end of a session, so we clear it and render as logged
     out. Showing "Session check failed" would alarm the user about
     something completely routine.

     The AbortController matters for the same reason as in Home.jsx:
     StrictMode mounts twice in development, so without cleanup this
     fires two requests and the slower one can overwrite the newer
     result. The abort also prevents setting state after unmount.
  --------------------------------------------------------------- */
  useEffect(() => {
    if (!getToken()) return

    const controller = new AbortController()

    authService
      .getCurrentUser({ signal: controller.signal })
      .then((restored) => setUser(restored))
      .catch((err) => {
        if (err.name === 'AbortError') return
        /* Any failure means this token is no good to us -- expired,
           forged, or the account is gone. Removing it now means the
           next request does not send a header we already know will
           be rejected. */
        clearToken()
        setUser(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  /* ---------------------------------------------------------------
     THE THREE ACTIONS
     ---------------------------------------------------------------
     login and register are near-identical on purpose: both end with
     a token and a user, so both save and set in the same order.

     WHY useCallback? These go into a context value that many
     components depend on. Without it, every render of this provider
     would create new function identities, so any child effect with
     `logout` in its dependency array would re-run on every render.
     Cheap insurance against a class of bug that is hard to spot.
  --------------------------------------------------------------- */

  const login = useCallback(async (email, password) => {
    const { token, user: loggedIn } = await authService.login(email, password)
    setToken(token)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const register = useCallback(async (payload) => {
    const { token, user: created } = await authService.register(payload)
    /* Registering signs you in immediately. Making someone type the
       password they just chose, on a form they just submitted, is
       friction with nothing behind it -- the server already proved
       who they are by creating the account. */
    setToken(token)
    setUser(created)
    return created
  }, [])

  /* Errors from login/register are NOT caught here. The form that
     submitted is the thing that knows where to show "Invalid email or
     password" -- next to the fields, where the user is looking.
     Swallowing them here would leave the form spinning forever with
     no explanation. */

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    /* WHY NO REQUEST TO THE SERVER?
       There is nothing to tell it. A JWT is stateless -- the server
       keeps no session record to delete, it just verifies the
       signature on whatever arrives. Logging out means throwing away
       our copy.

       The honest limitation: a token already copied elsewhere stays
       valid until it expires. Real logout-everywhere needs either
       server-side revocation (a denylist) or short-lived access
       tokens with refresh rotation. Worth knowing the difference
       between "logged out" and "token invalidated" -- this is the
       former. */
  }, [])

  /* ---------------------------------------------------------------
     APPLYING A PROFILE CHANGE MADE ELSEWHERE
     ---------------------------------------------------------------
     Added when the Dashboard gained a "change your campus" control.
     Saving a college returns the updated user, re-read by the server
     after the write, so the fresh object is already in hand -- this
     is how it gets into the session that the rest of the app reads.

     >>> WHY THIS DOES NOT TOUCH THE TOKEN <<<
     The token proves WHO you are. It carries no college, no name and
     no email, so a profile edit cannot invalidate it and there is
     nothing to reissue. Conflating the two -- handing out a new token
     on every profile save -- is a common and genuinely bad idea: it
     makes every edit a re-authentication, and any failure logs the
     user out mid-task.

     >>> WHY IT ACCEPTS THE SERVER'S OBJECT RATHER THAN A PATCH <<<
     A `setCollege(id)` action would have to construct the derived
     fields -- college_name, area_name, city_name -- on the client,
     from lists the picker happened to be holding. Those would then be
     the client's guess at what the database now says. Taking the
     server's re-read row means the session cannot drift from the
     stored truth, which is the same reason the endpoint returns it.

     The guard rejects a null: this is for applying an update to a
     signed-in session, and clearing the session is logout's job.
     Without it, a failed request returning undefined would silently
     log the user out. */
  const applyUser = useCallback((updated) => {
    if (!updated) return
    setUser(updated)
  }, [])

  /* Memoised so the object identity only changes when the session
     genuinely does. Without this, every provider render hands out a
     brand-new object, and every consumer re-renders even though
     nothing about the session changed. */
  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      applyUser,
    }),
    [user, loading, login, register, logout, applyUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
