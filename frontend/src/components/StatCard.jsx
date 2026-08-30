import { Link } from 'react-router-dom'
import './StatCard.css'

function StatCard({ label, value, hint, icon, to, tone = 'neutral' }) {
  const content = (
    <>
      {icon && (
        // aria-hidden: a screen reader reading out "package emoji"
        // before the number adds nothing. The label carries meaning.
        <span className="stat-card__icon" aria-hidden="true">
          {icon}
        </span>
      )}

      <span className="stat-card__value">{value ?? '—'}</span>
      <span className="stat-card__label">{label}</span>
      {hint && <span className="stat-card__hint">{hint}</span>}
    </>
  )

  const className = `stat-card stat-card--${tone}`

  if (to) {
    return (
      <Link to={to} className={`${className} stat-card--link`}>
        {content}
      </Link>
    )
  }

  return <div className={className}>{content}</div>
}

export default StatCard
