import { useId } from 'react'
import './FormField.css'

/**
 * FormField -- one labelled input, with its error message.
 *
 * WHAT IS THIS COMPONENT?
 * The unit both auth forms are built from: a <label>, an <input>, and
 * the space where that field's error appears. Login uses two; Register
 * uses four.
 *
 * WHY NOT JUST WRITE <input> IN THE FORMS?
 * Because getting an input RIGHT is about eight lines, and they are
 * easy to get subtly wrong in ways that only affect people using a
 * screen reader -- who will never file a bug report about your college
 * project. Doing it once means every field in ReuseHub is correct.
 *
 * =================================================================
 * WHAT MAKES AN INPUT ACCESSIBLE -- the four things below
 * =================================================================
 *
 * 1. htmlFor / id
 *    This is what CONNECTS the label to the input. With it, a screen
 *    reader announces "Email address, edit text" instead of just
 *    "edit text", and clicking the label focuses the input. Without
 *    it, the label is decorative text that happens to sit nearby.
 *
 *    `htmlFor`, not `for` -- `for` is a reserved word in JavaScript,
 *    so JSX renames it, the same way `class` becomes `className`.
 *
 * 2. useId()
 *    Generates the unique id. Hard-coding id="email" breaks the
 *    moment two forms appear on one page -- duplicate ids mean the
 *    label points at whichever input the browser finds first, so
 *    clicking one label focuses the other field. useId() is a React
 *    hook made for exactly this, and it produces ids that match
 *    between server and client rendering.
 *
 * 3. aria-invalid
 *    Tells assistive technology this field is currently wrong.
 *    The red border communicates that to sighted users; this is the
 *    same information for everyone else.
 *
 * 4. aria-describedby + role="alert"
 *    describedby links the input to its error text, so focusing the
 *    field reads the error out. role="alert" makes the error announce
 *    itself the moment it appears, without stealing focus. Both
 *    matter: one for arriving at a broken field, one for a field that
 *    breaks while you are elsewhere.
 */
function FormField({
  label,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  autoComplete,
  required = false,
  ...rest
}) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      <input
        id={id}
        type={type}
        className={`field__input ${error ? 'field__input--error' : ''}`}
        value={value}
        onChange={onChange}
        /* THE AUTOCOMPLETE ATTRIBUTE IS NOT COSMETIC.
           It is how a password manager knows this is a login form
           rather than a registration form, and therefore whether to
           offer a saved password or generate a new one. Getting it
           wrong actively discourages people from using a password
           manager -- which is worse for security than any hashing
           decision on the backend. Values used here:
             username          -- the email on both forms
             current-password  -- login
             new-password      -- register (triggers "suggest strong") */
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        {...rest}
      />

      {/* The hint is hidden once there is an error, so the two do not
          compete for the same spot under the field. */}
      {hint && !error && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}

      {error && (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default FormField
