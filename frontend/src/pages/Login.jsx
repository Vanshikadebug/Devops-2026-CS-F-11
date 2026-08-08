import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/authContext'
import FormField from '../components/FormField'
import Button from '../components/Button'
import './AuthForm.css'

/**
 * Login -- email and password, exchanged for a token.
 *
 * WHAT HAPPENS WHEN THE USER PRESSES "Log in":
 *
 *   1. this component  -> auth.login(email, password)
 *   2. AuthProvider    -> authService.login(...)
 *   3. authService     -> api.post('/auth/login', ...)
 *   4. api.js          -> fetch('/api/auth/login')
 *   5. Vite proxy      -> http://localhost:5000/api/auth/login
 *   6. authRoutes      -> loginRules, validate, login controller
 *   7. controller      -> findByEmailWithPassword, bcrypt.compare
 *   8. back up the chain with { token, user }
 *   9. AuthProvider saves the token and sets `user`
 *  10. every component reading useAuth() re-renders -- the Navbar
 *      swaps "Login / Register" for the user's name
 *  11. this component navigates away
 *
 * Eleven steps, and each layer only knows about the one next to it.
 * That is the whole argument for the layering: this file contains no
 * URL, no fetch, no token, no localStorage.
 */
function Login() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  /* WHERE SHOULD WE SEND THEM AFTERWARDS?
     If ProtectedRoute bounced them here, it recorded the page they
     were trying to reach in location.state. Returning them there is
     the difference between "log in and carry on" and "log in and
     start again from the home page".
     `replace: true` removes /login from the history stack, so the
     back button does not return to a login form they have already
     used.

     The fallback became /dashboard in Phase 7: someone who typed
     /login directly wants their own account, not the public browse
     page they could already see while logged out. */
  const from = location.state?.from ?? '/dashboard'

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    /* Clear the error as soon as they start fixing it. Leaving
       "Invalid email or password" on screen while someone retypes
       their password reads as though it is still failing. */
    if (error) setError(null)
  }

  async function handleSubmit(event) {
    /* WHY preventDefault()?
       A <form> submit is an old-fashioned full page navigation: the
       browser serialises the fields, requests the URL, and throws
       away the entire React app. Without this line the page reloads,
       the password appears in the URL bar on a GET form, and nothing
       works. */
    event.preventDefault()

    setSubmitting(true)
    setError(null)

    try {
      await auth.login(form.email.trim(), form.password)
      navigate(from, { replace: true })
    } catch (err) {
      /* The backend deliberately returns ONE message for both an
         unknown email and a wrong password, so we display exactly
         what it sent rather than trying to be more helpful. Being
         more helpful here would mean telling an attacker which
         addresses are registered. */
      setError(err.message)
      /* Note what we do NOT clear: the email field. Making someone
         retype it after a typo in the password is a small cruelty
         that forms commit constantly. */
    } finally {
      /* `finally` matters. If this lived only in the catch block, an
         unexpected throw would leave the button spinning forever with
         no way to retry. */
      setSubmitting(false)
    }
  }

  return (
    <div className="page auth">
      <div className="auth__card">
        <header className="auth__header">
          <h1 className="auth__title">Welcome back</h1>
          <p className="auth__subtitle">
            Log in to list items and send requests.
          </p>
        </header>

        {/* noValidate turns OFF the browser's own validation bubbles.
            We show our errors under each field instead -- consistently
            styled, screen-reader friendly, and identical in every
            browser. The backend validates regardless, which is the
            check that actually counts. */}
        <form className="auth__form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="auth__alert" role="alert">
              {error}
            </div>
          )}

          <FormField
            label="Email address"
            type="email"
            value={form.email}
            onChange={handleChange('email')}
            autoComplete="username"
            placeholder="you@example.com"
            required
          />

          <FormField
            label="Password"
            type="password"
            value={form.password}
            onChange={handleChange('password')}
            autoComplete="current-password"
            placeholder="Your password"
            required
          />

          <Button type="submit" fullWidth loading={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <p className="auth__switch">
          New to ReuseHub? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
