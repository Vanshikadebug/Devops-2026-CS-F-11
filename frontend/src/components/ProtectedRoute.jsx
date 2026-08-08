import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/authContext'
import LoadingSpinner from './LoadingSpinner'
import '../pages/AuthForm.css'

/**
 * ProtectedRoute -- wraps a page that requires a logged-in user.
 *
 * USED LIKE THIS, in App.jsx:
 *
 *     <Route
 *       path="/my-items"
 *       element={<ProtectedRoute><MyItems /></ProtectedRoute>}
 *     />
 *
 * `children` is whatever sits between the tags. This component
 * decides whether to render it, show a spinner, or redirect.
 *
 * =================================================================
 * >>> READ THIS BEFORE TRUSTING IT <<<
 * =================================================================
 * THIS COMPONENT IS NOT SECURITY. It is navigation.
 *
 * Everything here runs in the user's browser, on their machine, in
 * code they can read and edit. Anyone can open devtools, set a fake
 * token, and make this component render whatever it guards. The
 * page would appear -- and then every request it made would come
 * back 401, because the server does not care what the browser
 * decided.
 *
 * The real protection is `protect` in backend/middleware/protect.js.
 * That runs on the server, verifies the signature with JWT_SECRET,
 * and looks the account up in the database. It cannot be bypassed
 * from a browser.
 *
 * So the division is:
 *   ProtectedRoute  -- what the user SEES     (convenience)
 *   protect         -- what the user CAN DO   (security)
 *
 * A guard here with no guard on the server is the single most common
 * way a student project ends up with a data breach: the page is
 * hidden, and the API behind it is wide open to anyone who types the
 * URL into curl.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  /* THE `loading` CHECK IS NOT OPTIONAL -- see the long comment in
     AuthProvider.jsx. On a refresh we hold a token but have not yet
     heard back from /api/auth/me. Treating "do not know yet" as
     "logged out" would redirect the user to /login on every single
     refresh of a protected page, then bounce them back a moment
     later once the answer arrived. */
  if (loading) {
    return (
      <div className="auth__checking">
        <LoadingSpinner label="Checking your session" />
      </div>
    )
  }

  if (!isAuthenticated) {
    /* WHY PASS location.pathname IN state?
       So Login can send them back where they were going. Without it,
       clicking "My Items" while logged out means logging in and
       landing on the home page, then having to find the link again.

       WHY replace INSTEAD OF A NORMAL NAVIGATION?
       It overwrites the current history entry rather than adding
       one. Otherwise the protected URL stays in the back stack: the
       user logs in, presses back, hits the guard again, and is
       redirected forward -- a loop they cannot escape with the back
       button. */
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return children
}

export default ProtectedRoute
