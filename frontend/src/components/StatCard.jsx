import { Link } from 'react-router-dom'
import './StatCard.css'

/**
 * StatCard -- one number on the dashboard.
 *
 * WHY IS A SINGLE NUMBER A COMPONENT?
 * Because the dashboard shows six of them and they must look and
 * behave identically. Written inline, one card would eventually get a
 * different heading level or a missing aria-label, and the difference
 * would only be visible to someone comparing them side by side. One
 * component means one definition of what a stat looks like.
 *
 * PRESENTATIONAL, LIKE ItemCard.
 * It fetches nothing and holds no state -- it renders the props it is
 * given. That is what makes it safe to reuse and trivial to test.
 *
 * PROPS
 *   label  what the number counts ("Items listed")
 *   value  the number itself
 *   hint   optional smaller line underneath ("2 awaiting your reply")
 *   icon   decorative symbol
 *   to     optional route -- makes the whole card a link
 *   tone   'neutral' | 'accent' | 'warn'  -- colour only
 *
 * >>> WHY value IS RENDERED WITH String(value) <<<
 * A `0` is falsy in JavaScript, so the tempting `{value || '—'}`
 * would replace a genuine zero with a dash -- and "0 items listed" is
 * exactly what a new user needs to see. This is the single most
 * common React rendering bug, and it hides in the most innocuous
 * line. `value ?? '—'` treats only null/undefined as missing.
 */
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

  /* A card that navigates must be a real <a>, which is what <Link>
     renders. The alternative -- a <div onClick={navigate}> -- looks
     identical and is broken in ways that are invisible on a mouse:
     it cannot be tabbed to, cannot be opened in a new tab, is not
     announced as a link, and does nothing when Enter is pressed. */
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
