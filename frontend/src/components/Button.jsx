import './Button.css'

/**
 * Button -- the one clickable control used everywhere in ReuseHub.
 *
 * WHY A COMPONENT INSTEAD OF PLAIN <button>?
 * Consistency and accessibility, in one place. Every button in the
 * app gets the same padding, focus ring, disabled behaviour and
 * loading state. When we later decide the corners should be rounder,
 * we change one file rather than hunting through twelve pages.
 *
 * PROPS
 *   variant  'primary' | 'secondary' | 'danger' | 'ghost'
 *   size     'sm' | 'md'
 *   loading  when true, shows a spinner and blocks clicks
 *   fullWidth stretches to the container width
 *   ...rest  every other prop (onClick, type, aria-label, disabled)
 *            is forwarded straight to the real <button>
 *
 * The `...rest` spread is what keeps this component from becoming a
 * cage: we never have to edit it just to pass a new HTML attribute.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className = '',
  disabled,
  type = 'button',
  ...rest
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    fullWidth ? 'btn--full' : '',
    loading ? 'btn--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      // A loading button must not be clickable twice -- that is how
      // you get duplicate items created from one impatient user.
      disabled={disabled || loading}
      // Tells screen readers the control is busy, not broken.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}

export default Button
