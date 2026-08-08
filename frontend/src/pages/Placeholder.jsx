import { Link } from 'react-router-dom'
import Button from '../components/Button'
import './Placeholder.css'

/**
 * Placeholder -- a temporary stand-in for pages built in later phases.
 *
 * WHY BUILD THIS AT ALL?
 * So routing can be tested NOW. Every link in the navbar leads
 * somewhere real, which means a broken route shows up immediately
 * instead of three phases later. Each placeholder names the phase
 * that will replace it, so the app doubles as a progress board.
 */
function Placeholder({ title, phase, description }) {
  return (
    <div className="container page">
      <div className="placeholder">
        <span className="placeholder__badge">Coming in Phase {phase}</span>
        <h1 className="placeholder__title">{title}</h1>
        <p className="placeholder__text">{description}</p>
        <Link to="/">
          <Button variant="secondary">← Back to Browse</Button>
        </Link>
      </div>
    </div>
  )
}

export default Placeholder
