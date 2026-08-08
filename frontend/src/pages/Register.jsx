import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/authContext'
import FormField from '../components/FormField'
import Button from '../components/Button'
import './AuthForm.css'

/**
 * Register -- create an account.
 *
 * =================================================================
 * WHY VALIDATE ON THE FRONTEND WHEN THE BACKEND ALREADY DOES?
 * =================================================================
 * Because they are doing two different jobs, and only one of them is
 * about security:
 *
 *   FRONTEND validation is a COURTESY. It answers instantly, with no
 *   round trip, and points at the field. It can be bypassed trivially
 *   -- open devtools, or send the request with curl -- so it protects
 *   nothing.
 *
 *   BACKEND validation is the RULE. It runs on a machine the user
 *   does not control, so it cannot be skipped.
 *
 * The mistake is not having both. The mistake is trusting the first
 * one. If we deleted every check in this file, the app would still be
 * exactly as secure -- just more irritating. If we deleted the
 * backend's checks, the app would be broken, and nothing on this page
 * would tell you.
 *
 * So the rules below intentionally MIRROR authValidators.js rather
 * than exceed it. Anything stricter here would reject input the
 * server would have accepted, and the user could never work out why.
 */

/**
 * Same rules as backend/validators/authValidators.js.
 * Returns { field: message } for whatever is wrong -- empty means OK.
 */
function validate(form) {
  const errors = {}

  const name = form.name.trim()
  if (!name) errors.name = 'Name is required'
  else if (name.length < 2 || name.length > 100)
    errors.name = 'Name must be 2 to 100 characters'

  const email = form.email.trim()
  if (!email) errors.email = 'Email is required'
  // A deliberately loose pattern: something@something.something.
  // Email addresses are far stranger than most patterns allow (quoted
  // strings, plus tags, new TLDs), and a strict regex mostly succeeds
  // at rejecting valid addresses. The server uses a real parser, and
  // ultimately only a delivered email proves an address works.
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'Enter a valid email address'

  const mobile = form.mobile.trim()
  if (!mobile) errors.mobile = 'Mobile number is required'
  else if (!/^(\+91[- ]?)?[6-9]\d{9}$/.test(mobile))
    errors.mobile = 'Enter a valid 10-digit Indian mobile number'

  // NOT trimmed -- a space is a legitimate password character, and
  // trimming here would mean the password sent at registration
  // differs from the one the user typed at login.
  if (form.password.length < 8)
    errors.password = 'Password must be at least 8 characters'
  else if (form.password.length > 72)
    // bcrypt ignores everything past 72 bytes, so the server rejects
    // these rather than silently truncating. Mirrored here so the
    // reason is visible immediately.
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

    /* WHY CLEAR ON TYPING RATHER THAN VALIDATE ON TYPING?
       Validating every keystroke means the moment someone types "V"
       in the email box they are told it is invalid -- scolded for
       being halfway through. Errors appear on submit; typing clears
       them. Calm, and still immediate where it matters. */
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
      /* Registration signs the user in, so go straight to their new
         dashboard -- which greets them by name and explains the next
         step, rather than dropping them on the browse page with no
         indication that anything happened.
         `replace: true` keeps /register out of the history -- pressing
         back should not return to a form for an account that now
         exists. */
      navigate('/dashboard', { replace: true })
    } catch (err) {
      /* ---------------------------------------------------------
         TRANSLATING THE BACKEND'S ERRORS
         ---------------------------------------------------------
         The server can reject this in two shapes, and they deserve
         different treatment:

         400 with a `details` array -- one entry per bad field, e.g.
             [{ field: 'mobile', message: 'Enter a valid...' }]
             Mapped back onto the fields, so the error appears where
             the problem is.

         Anything else (409 for a duplicate email, 500, a dead
             server) -- one message above the form.

         This is why middleware/validate.js bothers to send `details`
         at all: a single string would force the user to hunt for
         which of four fields the server objected to.
      --------------------------------------------------------- */
      if (err.status === 400 && Array.isArray(err.details)) {
        const mapped = {}
        for (const detail of err.details) {
          /* KEEP THE FIRST MESSAGE PER FIELD, NOT THE LAST.
             One field can fail several rules at once: password 'x'
             returns both "must be at least 8 characters" and "must
             contain a number". The validator lists its rules
             most-fundamental-first, so the first message is the one
             worth showing -- telling someone their 1-character
             password needs a digit is technically true and useless.
             Assigning unconditionally would keep the last. */
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
            placeholder="Vanshika Meena"
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
            /* type="tel" rather than type="number".
               A number input allows exponents and a spinner, strips
               a leading +, and drops leading zeros -- all wrong for a
               phone number, which is a string of digits, not a
               quantity. type="tel" also brings up the phone keypad
               on mobile. */
            type="tel"
            value={form.mobile}
            onChange={handleChange('mobile')}
            error={errors.mobile}
            autoComplete="tel"
            placeholder="9876543210"
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
