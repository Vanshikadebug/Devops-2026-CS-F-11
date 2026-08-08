import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
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
 */
function App() {
  return (
    <div className="app">
      {/* user={null} for now -- Phase 6 replaces this with real auth
          state from useAuth(), which is why Navbar already accepts
          a `user` prop it currently never receives. */}
      <Navbar user={null} />

      <main className="app__main">
        <Routes>
          <Route path="/" element={<Home />} />

          <Route
            path="/login"
            element={
              <Placeholder
                title="Login"
                phase={6}
                description="Email and password sign-in. The backend will verify your credentials and return a JWT."
              />
            }
          />
          <Route
            path="/register"
            element={
              <Placeholder
                title="Create your account"
                phase={6}
                description="Name, email, mobile and password, with validation on both the frontend and the backend."
              />
            }
          />
          <Route
            path="/items/new"
            element={
              <Placeholder
                title="Add an item"
                phase={8}
                description="List something you no longer need so another user can reuse it."
              />
            }
          />
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
              <Placeholder
                title="My items"
                phase={8}
                description="Everything you have listed, with edit, delete and availability controls."
              />
            }
          />
          <Route
            path="/requests"
            element={
              <Placeholder
                title="Requests"
                phase={10}
                description="Requests you have received on your items, and requests you have sent to others."
              />
            }
          />
          <Route
            path="/profile"
            element={
              <Placeholder
                title="Your profile"
                phase={7}
                description="Your account details, plus a count of your listed items and requests."
              />
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
