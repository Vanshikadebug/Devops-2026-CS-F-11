import { useState } from 'react'
import {
  Link,
  useNavigate,
  useLocation,
} from 'react-router-dom'

import { useAuth } from '../app/authContext'
import { useConfig } from '../app/ConfigProvider'

import './Navbar.css'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { setting } = useConfig()

  const navigate = useNavigate()
  const location = useLocation()

  const [search, setSearch] = useState('')

  function handleSearch(event) {
    event.preventDefault()

    const value = search.trim()

    if (!value) {
      navigate('/items')
      return
    }

    navigate(
      `/items?search=${encodeURIComponent(value)}`
    )
  }

  function handleLogout() {
    logout()
  }

  return (
    <header className="nav">

      <div className="nav__inner">

        {/* LOGO */}

        <Link
          to="/"
          className="nav__brand"
        >
          <span className="nav__brand-name">
            {setting('site_name', 'ReuseHub')}
          </span>
        </Link>


        {/* NAVIGATION */}

        <nav className="nav__links">

          <Link
            to="/"
            className={
              location.pathname === '/'
                ? 'is-active'
                : ''
            }
          >
            Home
          </Link>

          {user && (
            <Link
              to="/profile"
              className={
                location.pathname === '/profile' ||
                location.pathname === '/dashboard'
                  ? 'is-active'
                  : ''
              }
            >
              Profile
            </Link>
          )}

          {user && (
            <Link
              to="/requests"
              className={
                location.pathname === '/requests'
                  ? 'is-active'
                  : ''
              }
            >
              Messages
            </Link>
          )}

        </nav>


        {/* SEARCH */}

        <form
          className="nav__search"
          onSubmit={handleSearch}
        >

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search"
            aria-label="Search"
          />

          <button
            type="submit"
            aria-label="Search"
          >
            <SearchIcon />
          </button>

        </form>


        {/* RIGHT SIDE */}

        <div className="nav__right">

          {user ? (

            <>

              <Link
                to="/items/new"
                className="nav__list-btn"
              >
                + List item
              </Link>

              <button
                type="button"
                className="nav__logout"
                onClick={handleLogout}
              >
                Logout
              </button>

            </>

          ) : (

            <>

              <Link
                to="/login"
                state={{ from: location }}
                className="nav__signin"
              >
                Login
              </Link>

              {setting(
                'allow_registration',
                true
              ) && (
                <Link
                  to="/register"
                  className="nav__join"
                >
                  Join
                </Link>
              )}

            </>

          )}

        </div>

      </div>

    </header>
  )
}


function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      aria-hidden="true"
    >

      <circle
        cx="10.8"
        cy="10.8"
        r="6.3"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M15.5 15.5L20.5 20.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

    </svg>
  )
}