import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/authContext'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import ItemForm from './pages/ItemForm'
import ItemDetail from './pages/ItemDetail'
import MyItems from './pages/MyItems'
import Requests from './pages/Requests'
import NotFound from './pages/NotFound'
import './App.css'

/**
 * App -- the root component and the app's ROUTING TABLE.
 *
 * HOW ROUTING WORKS HERE
 * <Routes> looks at the browser's current URL and renders the ONE
 * <Route> whose `path` matches. Everything outside <Routes> (the
 * Navbar, the footer) stays mounted across navigations -- which is
 * why moving between pages feels instant: only the middle swaps.
 *
 * DYNAMIC SEGMENTS
 * `path="/items/:id"` -- the `:id` part is a wildcard. /items/7 and
 * /items/42 both match, and the page reads the value with
 * useParams(). This is how one component serves every item.
 *
 * ORDER MATTERS FOR THE LAST ROUTE
 * `path="*"` matches anything not caught above, so it must stay
 * last. It renders the 404 page.
 *
 * WHY WAS ROUTING WIRED UP BEFORE THE PAGES EXISTED?
 * Routing was wired completely in Phase 2, with every not-yet-built
 * page pointing at a shared Placeholder. Each later phase then swapped
 * one Placeholder for its real page -- so a broken link surfaced the
 * moment it appeared, not five phases later. As of Phase 10 there are
 * no placeholders left: every route below renders its real page.
 *
 * TWO KINDS OF ROUTE, ADDED IN PHASE 6
 *
 *   <ProtectedRoute> -- requires a logged-in user. Sends anyone else
 *   to /login, remembering where they were headed.
 *
 *   <GuestOnly> -- the mirror image, for /login and /register. There
 *   is no point showing a login form to someone already logged in,
 *   and a signed-in user reaching /login usually got there from a
 *   stale bookmark or the back button.
 *
 * Both are convenience. Neither is security -- see the long note in
 * ProtectedRoute.jsx. Every protected route below has a matching
 * `protect` check on the server, and that is what actually enforces
 * anything.
 */

/**
 * Keeps a logged-in user away from the auth forms.
 *
 * The `loading` case renders nothing rather than a spinner: this
 * guard only ever wraps the login and register forms, and flashing a
 * spinner over a form that is about to appear anyway is more jarring
 * than the brief blank it replaces.
 */
function GuestOnly({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return null
  if (isAuthenticated) return <Navigate to="/" replace />
  return children
}

function App() {
  /* The Navbar's `user` prop has been waiting for this since Phase 2.
     Because AuthProvider sits above App in main.jsx, `user` updates
     the instant login or logout runs, and the Navbar re-renders
     itself -- no event, no manual refresh. */
  const { user, logout } = useAuth()

  return (
    <div className="app">
      <Navbar user={user} onLogout={logout} />

      <main className="app__main">
        <Routes>
          <Route path="/" element={<Home />} />

          {/* --- Public, and pointless once logged in ------------- */}
          <Route
            path="/login"
            element={
              <GuestOnly>
                <Login />
              </GuestOnly>
            }
          />
          <Route
            path="/register"
            element={
              <GuestOnly>
                <Register />
              </GuestOnly>
            }
          />

          {/* --- Requires an account ------------------------------
              Every route here now serves its real page -- /requests
              was the last placeholder, filled in Phase 10. The GUARD
              was wired in Phase 6 with the placeholders still in place,
              which is why swapping in each real page needed no change
              to the redirect behaviour -- it had already been tested. */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* --- The item routes, in the order Express taught us ---
              `/items/new` MUST come before `/items/:id`. React Router
              v6 ranks routes by specificity rather than by source
              order, so a literal segment beats a dynamic one and this
              would work either way -- but relying on that means the
              file no longer reads as the list of rules it is. Written
              in the order that would be correct under plain
              first-match, the intent survives a router upgrade.

              ItemForm serves BOTH /items/new and /items/:id/edit. It
              is one component because the two are the same eight
              fields; the presence of :id is what puts it in edit
              mode. See the note at the top of that file for why the
              URL, not a prop, decides. */}
          <Route
            path="/items/new"
            element={
              <ProtectedRoute>
                <ItemForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/items/:id/edit"
            element={
              <ProtectedRoute>
                <ItemForm />
              </ProtectedRoute>
            }
          />
          {/* Public: anyone can view an item. Requesting one needs an
              account, but browsing does not -- a logged-out visitor
              seeing what is on offer is how they decide to sign up.

              The page shows Edit and Delete only to the owner. That
              is presentation, not protection: the server answers 403
              to the same request regardless of what this page chose
              to render. */}
          <Route path="/items/:id" element={<ItemDetail />} />

          <Route
            path="/my-items"
            element={
              <ProtectedRoute>
                <MyItems />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests"
            element={
              <ProtectedRoute>
                <Requests />
              </ProtectedRoute>
            }
          />
          {/* /profile was going to be "your details plus your counts"
              -- which is exactly what /dashboard now is. Rather than
              build a second page showing the same data, the old URL
              redirects. `replace` keeps it out of the back-button
              history, so pressing Back does not bounce the user
              between the two. */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            }
          />

          {/* Catch-all -- must remain the final route. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="app__footer">
        <div className="container">
          <p>
            ReuseHub &middot; A full-stack &amp; DevOps college project
            &middot; Built with React, Express and MySQL
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
