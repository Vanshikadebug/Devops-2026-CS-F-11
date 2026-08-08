import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

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
 * 3. App
 *    Our own root component, holding the routing table.
 *
 * Phase 6 adds a fourth wrapper here -- AuthProvider -- placed
 * inside BrowserRouter so auth logic can redirect after login.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
