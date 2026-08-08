import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import Button from './Button'
import './Navbar.css'

/**
 * Navbar -- the persistent top navigation bar.
 *
 * WHAT IT DOES
 * Shows the brand, the main links, and either "Login / Register"
 * (logged out) or the user's name plus "Logout" (logged in).
 *
 * WHY NavLink INSTEAD OF Link?
 * NavLink knows whether its route is the current one, and hands us
 * an `isActive` flag so we can highlight the current page. A plain
 * <a href> would reload the whole application and throw away all
 * React state -- the entire point of a single-page app is that
 * navigation does NOT hit the server.
 *
 * AUTH (wired up in Phase 6)
 * `user` and `onLogout` come from App, which reads them from
 * useAuth(). This component stays a plain presentational component
 * that takes props -- it does not call useAuth() itself.
 *
 * WHY PROPS RATHER THAN READING THE CONTEXT DIRECTLY?
 * Because it keeps the Navbar testable and reusable in isolation:
 * rendering it with user={{ name: 'Test' }} needs no provider around
 * it. Reading context here would make the component impossible to
 * render without the whole auth stack behind it.
 */
function Navbar({ user = null, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  /* On a phone the nav is a dropdown, and logging out from inside it
     would otherwise leave it hanging open over the page you land on. */
  const handleLogout = () => {
    closeMenu()
    onLogout?.()
  }

  // Passed to NavLink's className, which React Router calls with
  // { isActive } on every render.
  const linkClass = ({ isActive }) =>
    isActive ? 'navbar__link navbar__link--active' : 'navbar__link'

  return (
    <nav className="navbar">
      <div className="container navbar__inner">
        <Link to="/" className="navbar__brand" onClick={closeMenu}>
          <span className="navbar__logo" aria-hidden="true">♻</span>
          <span className="navbar__brand-text">
            Reuse<span className="navbar__brand-accent">Hub</span>
          </span>
        </Link>

        <button
          type="button"
          className="navbar__toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>

        <div
          className={`navbar__collapse ${menuOpen ? 'navbar__collapse--open' : ''}`}
        >
          <div className="navbar__links">
            <NavLink to="/" className={linkClass} onClick={closeMenu} end>
              Browse
            </NavLink>

            {user && (
              <>
                <NavLink to="/dashboard" className={linkClass} onClick={closeMenu}>
                  Dashboard
                </NavLink>
                <NavLink to="/my-items" className={linkClass} onClick={closeMenu}>
                  My Items
                </NavLink>
                <NavLink to="/requests" className={linkClass} onClick={closeMenu}>
                  Requests
                </NavLink>
              </>
            )}
          </div>

          <div className="navbar__actions">
            {user ? (
              <>
                {/* The name is a link to the dashboard: clicking your
                    own name expecting your account is a near-universal
                    habit, and a <Link> satisfies it without adding
                    another item to the nav. */}
                <Link to="/dashboard" className="navbar__user" onClick={closeMenu}>
                  <span className="navbar__avatar" aria-hidden="true">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                  {user.name}
                </Link>
                <Button variant="secondary" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
                <Link to="/items/new" onClick={closeMenu}>
                  <Button size="sm">+ Add Item</Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" onClick={closeMenu}>
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link to="/register" onClick={closeMenu}>
                  <Button size="sm">Register</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
