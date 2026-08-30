import { useState } from 'react'
import { Link, useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useAuth } from '../app/authContext'
import { useConfig } from '../app/ConfigProvider'
import { SearchPill, ArrowButton } from './ui'
import './Navbar.css'


export default function Navbar() {
  const { user, logout } = useAuth()
  const { setting, nav } = useConfig()
  const navigate = useNavigate()
  const location = useLocation()
  const [term, setTerm] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)


  function search(value) {
    const q = String(value || '').trim()
    navigate(q ? `/items?search=${encodeURIComponent(q)}` : '/items')
    setMenuOpen(false)
  }

  return (
    <header className="nav">
      <div className="nav__inner shell">
        <Link to="/" className="nav__brand" onClick={() => setMenuOpen(false)}>
          <span className="nav__glyph" aria-hidden="true">{setting('logo_glyph', '♻')}</span>
          <span className="nav__name">{setting('site_name', 'ReuseHub')}</span>
        </Link>

        {/* Links come from the nav_links table, so the header is editable. */}
        <nav className="nav__links" aria-label="Main">
          {nav.header.map((link) => (
            <NavLink
              key={link.id}
              to={link.href}
              className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="nav__search">
          <SearchPill
            value={term}
            onChange={setTerm}
            onSubmit={search}
            placeholder={`Search ${setting('site_name', 'ReuseHub')}…`}
          />
        </div>

        <div className="nav__actions">
          {user ? (
            <>
              <div className="nav__user">
                <button
                  className="nav__userbtn"
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <span className="nav__avatar" aria-hidden="true">
                    {user.name?.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="nav__username">{user.name?.split(' ')[0]}</span>
                </button>

                {menuOpen && (
                  <div className="nav__menu" role="menu">
                    <Link to="/dashboard" role="menuitem" onClick={() => setMenuOpen(false)}>Dashboard</Link>
                    <Link to="/my-items" role="menuitem" onClick={() => setMenuOpen(false)}>My items</Link>
                    <Link to="/requests" role="menuitem" onClick={() => setMenuOpen(false)}>Requests</Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); logout() }}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>

              <div className="nav__cta">
                <ArrowButton to="/items/new" size="sm">List an item</ArrowButton>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="nav__signin" state={{ from: location }}>Sign in</Link>
              {setting('allow_registration', true) && (
                <ArrowButton to="/register" size="sm">Join</ArrowButton>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  )
}
