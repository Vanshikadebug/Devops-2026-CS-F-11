import './LoadingSpinner.css'

/**
 * LoadingSpinner -- shown while we wait for the backend.
 *
 * WHY THIS MATTERS
 * Network requests take time. Without a spinner the screen simply
 * sits blank and the user assumes the app is broken and clicks
 * again. A visible "working on it" state is a real feature, not
 * decoration.
 *
 * ACCESSIBILITY
 * role="status" tells assistive technology this region announces
 * progress. The visible text is hidden with .sr-only so screen
 * readers say "Loading" while sighted users just see the spinner.
 */
function LoadingSpinner({ size = 'md', label = 'Loading', fullPage = false }) {
  const spinner = (
    <div className="spinner-wrap" role="status">
      <span className={`spinner spinner--${size}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )

  if (fullPage) {
    return <div className="spinner-page">{spinner}</div>
  }
  return spinner
}

export default LoadingSpinner
