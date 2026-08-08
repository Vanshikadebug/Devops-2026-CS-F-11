import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AuthProvider from './context/AuthProvider.jsx'

/**
 * main.jsx -- the ENTRY POINT of the entire frontend.
 *
 * index.html loads exactly one script: this file. Everything you see
 * in the browser is mounted from here into <div id="root">.
 *
 * THE THREE WRAPPERS, OUTSIDE IN:
 *
 * 1. StrictMode
 *    A development-only helper. It intentionally renders components
 *    twice and runs effects twice to surface bugs -- missing cleanup
 *    functions, accidental side effects during render. If you see a
 *    console.log appear twice in development, this is why. It is
 *    stripped out of the production build entirely.
 *
 * 2. BrowserRouter
 *    Gives the app access to the browser URL and history. It MUST
 *    wrap every component that uses <Link>, <Routes> or useNavigate.
 *    Forgetting it produces the very common error:
 *      "useNavigate() may be used only in the context of a <Router>"
 *    It uses the History API, so navigation changes the URL without
 *    a page reload.
 *
 * 3. AuthProvider  (added in Phase 6)
 *    Holds the logged-in user and makes it readable anywhere via
 *    useAuth(). See context/AuthProvider.jsx.
 *
 *    >>> WHY IS IT INSIDE BrowserRouter, NOT OUTSIDE? <<<
 *    Order is not cosmetic here. Anything that uses routing --
 *    useNavigate, useLocation, <Navigate> -- must have a Router
 *    ABOVE it in the tree. AuthProvider itself does not navigate
 *    today, but ProtectedRoute (rendered beneath it) redirects with
 *    <Navigate>, and Login calls useNavigate(). Swapping these two
 *    lines would produce:
 *      "useNavigate() may be used only in the context of a <Router>"
 *
 *    It wraps App rather than living inside it, so the session
 *    survives every route change: navigating from /login to / does
 *    not unmount the provider, so the user is not re-fetched on
 *    every navigation.
 *
 * 4. App
 *    Our own root component, holding the routing table.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
