/**
 * ==============================================================================
 * NAVBAR COMPONENT (MANIA E-COMMERCE THEME)
 * ==============================================================================
 * 
 * @file Navbar.jsx
 * @description The primary global navigation header for the application. 
 * Orchestrates user authentication state, dynamic configuration rendering, 
 * and the primary search functionality.
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useAuth } from '../app/authContext';
import { useConfig } from '../app/ConfigProvider';
import { ArrowButton } from './ui';
import './Navbar.css';

/**
 * Navbar Component
 * 
 * Renders the top-level sticky navigation bar. Handles routing, dynamic 
 * link generation from the ConfigProvider, authenticated user dropdowns, 
 * and global search query routing.
 * 
 * @returns {React.JSX.Element} The rendered navigation header.
 */
export default function Navbar() {
  // --- Context & Hooks ---
  const { user, logout } = useAuth();
  const { setting, nav } = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  
  // --- Local State ---
  const [term, setTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  
  // --- Refs ---
  const menuRef = useRef(null);

  /**
   * Effect: Click Outside Handler
   * Professionally manages the user dropdown menu state by listening for
   * mousedown events outside of the menu's DOM node. Closes the menu 
   * automatically to improve UX and prevent UI clutter.
   */
  useEffect(() => {
    /**
     * Evaluates the target of a click event.
     * @param {MouseEvent} event - The native mouse event.
     */
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    // Bind the event listener to the document
    document.addEventListener('mousedown', handleClickOutside);
    
    // Cleanup function to prevent memory leaks on component unmount
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuRef]);

  /**
   * handleSearchSubmit
   * 
   * Processes the user's search input, sanitizes the string, and navigates
   * to the global item catalog with the search query appended as a URL parameter.
   * 
   * @param {string} [value] - Optional direct value bypass. Defaults to local state.
   */
  function handleSearchSubmit(value = term) {
    // Sanitize input to prevent empty space queries
    const searchQuery = String(value || '').trim();
    
    // Route to the items catalog, encoding the URI to safely handle special characters
    if (searchQuery) {
      navigate(`/items?search=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate('/items');
    }
    
    // Ensure any open menus are closed upon executing a search
    setMenuOpen(false);
  }

  /**
   * handleKeyDown
   * 
   * Accessibility feature allowing keyboard users to submit the search
   * by pressing the 'Enter' key while focused on the input field.
   * 
   * @param {React.KeyboardEvent} e - The React synthetic keyboard event.
   */
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit();
    }
  }

  return (
    <header className="nav">
      <div className="nav__inner shell">
        
        {/* --- 1. Branding & Logo --- */}
        <Link 
          to="/" 
          className="nav__brand" 
          onClick={() => setMenuOpen(false)}
          aria-label="Navigate to Home"
        >
          <span className="nav__glyph" aria-hidden="true">
            {setting('logo_glyph', '♻')}
          </span>
          <span className="nav__name">
            {setting('site_name', 'ReuseHub')}
          </span>
        </Link>

        {/* --- 2. Dynamic Navigation Links --- */}
        {/* Links are pulled from the nav_links table via ConfigProvider */}
        <nav className="nav__links" aria-label="Main Navigation">
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

        {/* --- 3. Central Search Widget (Mania Theme) --- */}
        <div className="nav__search">
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Search for a nano banana, history notes, electronics...`}
            aria-label="Search the catalog"
          />
          <button 
            type="button" 
            onClick={() => handleSearchSubmit()}
            aria-label="Submit search"
          >
            Search
          </button>
        </div>

        {/* --- 4. User Actions & Authentication --- */}
        <div className="nav__actions">
          {user ? (
            
            // Authenticated State
            <>
              {/* User Dropdown Menu */}
              <div className="nav__user" ref={menuRef}>
                <button
                  className="nav__userbtn"
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label="Open user menu"
                >
                  <span className="nav__avatar" aria-hidden="true">
                    {user.name?.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="nav__username">
                    {user.name?.split(' ')[0]}
                  </span>
                </button>

                {/* Dropdown Options */}
                {menuOpen && (
                  <div className="nav__menu" role="menu">
                    <Link to="/dashboard" role="menuitem" onClick={() => setMenuOpen(false)}>
                      Dashboard
                    </Link>
                    <Link to="/my-items" role="menuitem" onClick={() => setMenuOpen(false)}>
                      My items
                    </Link>
                    <Link to="/requests" role="menuitem" onClick={() => setMenuOpen(false)}>
                      Requests
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      className="nav__logout-btn"
                      onClick={() => { 
                        setMenuOpen(false); 
                        logout(); 
                      }}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>

              {/* Primary Call to Action */}
              <div className="nav__cta">
                <ArrowButton to="/items/new" size="sm">
                  List an item
                </ArrowButton>
              </div>
            </>
          ) : (
            
            // Unauthenticated State
            <>
              <Link 
                to="/login" 
                className="nav__signin" 
                state={{ from: location }}
              >
                Sign in
              </Link>
              
              {/* Render registration CTA only if permitted by admin settings */}
              {setting('allow_registration', true) && (
                <ArrowButton to="/register" size="sm">
                  Join
                </ArrowButton>
              )}
            </>
          )}
        </div>
        
      </div>
    </header>
  );
}