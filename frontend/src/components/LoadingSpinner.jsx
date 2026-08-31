import './LoadingSpinner.css'

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
