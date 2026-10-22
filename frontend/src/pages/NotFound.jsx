import { Link, useLocation } from 'react-router-dom'
import { useConfig } from '../app/ConfigProvider'
import './NotFound.css'
import { usePageTitle } from '../hooks/usePageTitle'

/** Fallback for any route that does not exist. */
export default function NotFound() {
  usePageTitle('Page not found')
  const { setting } = useConfig()
  const { pathname } = useLocation()

  return (
    <div className="nf shell">
      <h1 className="nf__code" aria-label="Error 404">
        <span>4</span><span className="nf__zero">0</span><span>4</span>
      </h1>
      <hr className="nf__rule" />
      <div className="nf__body">
        <div>
          <p className="nf__title">That page does not exist.</p>
          <p className="nf__text">
            Nothing lives at <code>{pathname}</code>. The link may be out of date, or the
            listing may have been removed.
          </p>
        </div>
        <nav className="nf__links" aria-label="Where to go instead">
          <Link to="/" className="btn btn--primary">Back to {setting('site_name', 'ReuseHub')}</Link>
          <Link to="/items" className="label ulink">Browse the index →</Link>
        </nav>
      </div>
    </div>
  )
}
