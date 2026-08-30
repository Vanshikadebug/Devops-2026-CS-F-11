import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/authContext'
import FormField from '../components/FormField'
import Button from '../components/Button'
import './AuthForm.css'

function validate(form) {
  const errors = {}

  const name = form.name.trim()
  if (!name) errors.name = 'Name is required'
  else if (name.length < 2 || name.length > 100)
    errors.name = 'Name must be 2 to 100 characters'

  const email = form.email.trim()
  if (!email) errors.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'Enter a valid email address'

  const mobile = form.mobile.trim()
  if (!mobile) errors.mobile = 'Mobile number is required'
  else if (!/^(\+91[- ]?)?[6-9]\d{9}$/.test(mobile))
    errors.mobile = 'Enter a valid 10-digit Indian mobile number'

  if (form.password.length < 8)
    errors.password = 'Password must be at least 8 characters'
  else if (form.password.length > 72)
    errors.password = 'Password must be 72 characters or fewer'
  else if (!/[a-zA-Z]/.test(form.password))
    errors.password = 'Password must contain a letter'
  else if (!/\d/.test(form.password))
    errors.password = 'Password must contain a number'

  // Purely a frontend concern: the server never sees this field.
  // It exists to catch a typo in a value the user cannot read back.
  if (form.confirmPassword !== form.password)
    errors.confirmPassword = 'Passwords do not match'

  return errors
}

const EMPTY = { name: '', email: '', mobile: '', password: '', confirmPassword: '' }

function Register() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))

    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    if (formError) setFormError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const found = validate(form)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return // Nothing is sent. No round trip for a problem we can see.
    }

    setSubmitting(true)
    setErrors({})
    setFormError(null)

    try {
      await auth.register({
        name: form.name.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        password: form.password, // never trimmed
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err.status === 400 && Array.isArray(err.details)) {
        const mapped = {}
        for (const detail of err.details) {
          if (detail.field && !mapped[detail.field]) {
            mapped[detail.field] = detail.message
          }
        }
        setErrors(mapped)
        /* If the details name a field we do not render, the mapping
           would silently show nothing. Keep a general message so the
           form can never fail invisibly. */
        if (Object.keys(mapped).length === 0) setFormError(err.message)
      } else if (err.status === 409) {
        // A duplicate email is the one case worth pointing at a
        // specific field, with a route out of the dead end.
        setErrors({ email: 'An account with this email already exists' })
      } else {
        setFormError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page auth">
      <div className="auth__card">
        <header className="auth__header">
          <h1 className="auth__title">Create your account</h1>
          <p className="auth__subtitle">
            Free, and takes about a minute.
          </p>
        </header>

        <form className="auth__form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="auth__alert" role="alert">
              {formError}
            </div>
          )}

          <FormField
            label="Full name"
            value={form.name}
            onChange={handleChange('name')}
            error={errors.name}
            autoComplete="name"
            placeholder="Enter your full name"
            required
          />

          <FormField
            label="Email address"
            type="email"
            value={form.email}
            onChange={handleChange('email')}
            error={errors.email}
            autoComplete="username"
            placeholder="you@example.com"
            required
          />

          <FormField
            label="Mobile number"
            type="tel"
            value={form.mobile}
            onChange={handleChange('mobile')}
            error={errors.mobile}
            autoComplete="tel"
            placeholder="+91 XXXXXXXXXX"
            hint="Shared with a user only after you accept their request."
            required
          />

          <FormField
            label="Password"
            type="password"
            value={form.password}
            onChange={handleChange('password')}
            error={errors.password}
            /* new-password, not current-password. This is the value
               that makes a password manager offer to GENERATE one
               instead of autofilling an existing login. */
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
            required
          />

          <FormField
            label="Confirm password"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange('confirmPassword')}
            error={errors.confirmPassword}
            autoComplete="new-password"
            required
          />

          <Button type="submit" fullWidth loading={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="auth__switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  )
}

export default Register
