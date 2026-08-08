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
 * NOTE ON AUTH (Phase 6)
 * Right now `user` is passed in as a prop and is always null. In
 * Phase 6 this becomes a real `useAuth()` call. The markup below
 * already handles both cases, so that change is a two-line edit.
 */
function Navbar({ user = null, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

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
                <NavLink to="/my-items" className={linkClass} onClick={closeMenu}>
                  My Items
                </NavLink>
                <NavLink to="/requests" className={linkClass} onClick={closeMenu}>
                  Requests
                </NavLink>
                <NavLink to="/profile" className={linkClass} onClick={closeMenu}>
                  Profile
                </NavLink>
              </>
            )}
          </div>

          <div className="navbar__actions">
            {user ? (
              <>
                <span className="navbar__user">
                  <span className="navbar__avatar" aria-hidden="true">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                  {user.name}
                </span>
                <Button variant="secondary" size="sm" onClick={onLogout}>
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
