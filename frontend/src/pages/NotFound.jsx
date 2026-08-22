import { Link } from 'react-router-dom'
import Button from '../components/Button'
import './Placeholder.css'

/**
 * NotFound -- rendered when no route matches the URL.
 *
 * Without this, typing a wrong URL renders a blank white page and
 * looks like a crash. This is the frontend equivalent of the
 * backend's 404 handler we build in Phase 3.
 */
function NotFound() {
  return (
    <div className="container page">
      <div className="placeholder">
        <span className="placeholder__badge">Error 404</span>
        <h1 className="placeholder__title">Page not found</h1>
        <p className="placeholder__text">
          We couldn&apos;t find that page. It may have been moved, or the
          link might be incorrect.
        </p>
        <Link to="/">
          <Button>← Back to Browse</Button>
        </Link>
      </div>
    </div>
  )
}

export default NotFound
