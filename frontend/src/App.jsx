import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/authContext'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Placeholder from './pages/Placeholder'
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
 * WHY ARE MOST PAGES PLACEHOLDERS?
 * Routing is wired up completely NOW, in Phase 2. Each later phase
 * swaps one Placeholder for the real page. That way a broken link
 * surfaces the moment it appears, not five phases later.
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
              Still placeholders until Phases 7-10, but the GUARD is
              real from now on. Wiring it in with the placeholder
              means the redirect behaviour gets tested this phase,
              instead of being written and debugged later at the same
              time as the page itself. */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/items/new"
            element={
              <ProtectedRoute>
                <Placeholder
                  title="Add an item"
                  phase={8}
                  description="List something you no longer need so another user can reuse it."
                />
              </ProtectedRoute>
            }
          />
          {/* Public: anyone can view an item. Requesting one needs an
              account, but browsing does not -- a logged-out visitor
              seeing what is on offer is how they decide to sign up. */}
          <Route
            path="/items/:id"
            element={
              <Placeholder
                title="Item details"
                phase={8}
                description="Full details for a single item, plus the button to request it."
              />
            }
          />
          <Route
            path="/my-items"
            element={
              <ProtectedRoute>
                <Placeholder
                  title="My items"
                  phase={8}
                  description="Everything you have listed, with edit, delete and availability controls."
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests"
            element={
              <ProtectedRoute>
                <Placeholder
                  title="Requests"
                  phase={10}
                  description="Requests you have received on your items, and requests you have sent to others."
                />
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
