import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../app/authContext'
import { useConfig } from '../app/ConfigProvider'
import { requestService } from '../lib/requestService'

import './Navbar.css'

const THEMES = [
  { id: 'mono', label: 'Black on paper' },
  { id: 'dark', label: 'Dark' },
  { id: 'red', label: 'Red on paper' },
]

/** The chosen theme lives on <html data-theme>; index.html restores it pre-paint. */
function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'red')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('rh-theme', theme) } catch { /* private mode */ }
  }, [theme])
  return [theme, setTheme]
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const { setting } = useConfig()
  const navigate = useNavigate()
  const location = useLocation()

  const [theme, setTheme] = useTheme()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const pending = usePendingRequests(user, location.pathname)

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname])

  function handleSearch(event) {
    event.preventDefault()
    const value = search.trim()
    navigate(value ? `/items?search=${encodeURIComponent(value)}` : '/items')
  }

  const link = ({ isActive }) => `ulink ${isActive ? 'is-active' : ''}`

  return (
    <header className={`nav ${open ? 'nav--open' : ''}`}>
      <div className="nav__inner">
        <Link to="/" className="nav__brand" aria-label={`${setting('site_name', 'ReuseHub')} home`}>
          <LoopMark />
        </Link>

        <nav className="nav__links" aria-label="Main">
          <NavLink to="/items" end className={link}>Index</NavLink>
          {user && <NavLink to="/dashboard" className={link}>Dashboard</NavLink>}
          {user && <NavLink to="/my-items" className={link}>My items</NavLink>}
          {user && (
            <NavLink to="/requests" className={link}>
              Requests
              {pending > 0 && (
                <>
                  <span className="nav__badge" aria-hidden="true">{pending}</span>
                  <span className="sr-only">, {pending} awaiting your reply</span>
                </>
              )}
            </NavLink>
          )}

          <form className="nav__search" onSubmit={handleSearch} role="search">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              aria-label="Search items"
            />
          </form>

          {user ? (
            <>
              <NavLink to="/items/new" className="nav__cta">List item +</NavLink>
              <button type="button" className="nav__plain ulink" onClick={logout}>Log out</button>
            </>
          ) : (
            <>
              <NavLink to="/login" state={{ from: location }} className={link}>Log in</NavLink>
              {setting('allow_registration', true) && (
                <NavLink to="/register" className="nav__cta">Join +</NavLink>
              )}
            </>
          )}
        </nav>

        <div className="nav__end">
          <div className="nav__themes" role="radiogroup" aria-label="Colour theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme === t.id}
                aria-label={t.label}
                className={`nav__dot nav__dot--${t.id}`}
                onClick={() => setTheme(t.id)}
              />
            ))}
          </div>

          <button
            type="button"
            className="nav__menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>
    </header>
  )
}

/** How many requests on the user's items await a reply. Re-checked on every
    route change (answering a request updates it on the next navigation). */
function usePendingRequests(user, pathname) {
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!user) {
      setPending(0)
      return undefined
    }
    const controller = new AbortController()
    requestService
      .getReceived({ signal: controller.signal })
      .then((rows) => setPending(rows.filter((r) => r.status === 'Pending').length))
      .catch(() => {}) // a badge is a hint; a failed check must not break the navbar
    return () => controller.abort()
  }, [user, pathname])

  return pending
}

/** Two linked loops — reuse, drawn the way the "++" mark is in the reference. */
function LoopMark() {
  return (
    <svg viewBox="0 0 34 18" width="34" height="18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="3" />
      <circle cx="25" cy="9" r="6.5" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}
