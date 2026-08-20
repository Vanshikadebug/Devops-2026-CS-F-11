import { useId } from 'react'
import './FormField.css'

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

      {/* aria-required, not the native `required` attribute: the asterisk
          above is aria-hidden, so a screen reader would otherwise never
          learn the field is required — but native validation would fire the
          browser's own tooltip and block submit before the page's validate()
          runs, replacing its custom error messages. */}
      <input
        id={id}
        type={type}
        className={`field__input ${error ? 'field__input--error' : ''}`}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-required={required || undefined}
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
