import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/authContext'
import FormField from '../components/FormField'
import Button from '../components/Button'
import './AuthForm.css'

function Login() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const from = location.state?.from ?? '/dashboard'

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    /* Clear the error as soon as they start fixing it. Leaving
       "Invalid email or password" on screen while someone retypes
       their password reads as though it is still failing. */
    if (error) setError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    setSubmitting(true)
    setError(null)

    try {
      await auth.login(form.email.trim(), form.password)
      navigate(from, { replace: true })
    } catch (err) {
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
