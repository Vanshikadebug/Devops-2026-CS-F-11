import { Link } from 'react-router-dom'
import './ui.css'

/* The primitives the bento layout is built from. Small, presentational, and
   styled entirely from tokens so an admin theme change reaches all of them. */

/** Small rounded label. The reference's "Music is Classic" chip. */
export function Pill({ children, tone = 'surface', className = '', ...rest }) {
  return (
    <span className={`pill pill--${tone} ${className}`} {...rest}>
      {children}
    </span>
  )
}

/** Circular icon button. `tone="ink"` is the dark filled variant. */
export function IconButton({ tone = 'surface', size = 'md', label, children, as, to, ...rest }) {
  const cls = `iconbtn iconbtn--${tone} iconbtn--${size}`
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={label} {...rest}>
        {children}
      </Link>
    )
  }
  const Tag = as || 'button'
  return (
    <Tag className={cls} aria-label={label} type={Tag === 'button' ? 'button' : undefined} {...rest}>
      {children}
    </Tag>
  )
}

const Arrow = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
    <path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function ArrowButton({ children, to, tone = 'accent', size = 'md', ...rest }) {
  const cls = `arrowbtn arrowbtn--${tone} arrowbtn--${size}`
  const inner = (
    <>
      <span className="arrowbtn__label">{children}</span>
      <span className="arrowbtn__circle" aria-hidden="true"><Arrow /></span>
    </>
  )

  if (to) {
    return <Link to={to} className={cls} {...rest}>{inner}</Link>
  }
  return <button type="button" className={cls} {...rest}>{inner}</button>
}

/** Plain button in the same visual family, for forms and dialogs. */
export function Button({ children, variant = 'primary', size = 'md', as, to, ...rest }) {
  const cls = `btn btn--${variant} btn--${size}`
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>
  const Tag = as || 'button'
  return (
    <Tag className={cls} type={Tag === 'button' ? 'button' : undefined} {...rest}>
      {children}
    </Tag>
  )
}

/** Wide pill search field with a dark circular submit button. */
export function SearchPill({ value, onChange, onSubmit, placeholder = 'Search…', size = 'md' }) {
  return (
    <form
      className={`searchpill searchpill--${size}`}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(value)
      }}
      role="search"
    >
      <input
        className="searchpill__input"
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <button className="searchpill__go" type="submit" aria-label="Search">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  )
}

/** A bento cell. `span`/`rows` drive the grid placement. */
export function BentoCard({ children, span = 1, rows = 1, tone = 'surface', flush = false, className = '', ...rest }) {
  return (
    <div
      className={`bento__cell card ${flush ? 'card--flush' : ''} ${tone !== 'surface' ? `card--${tone}` : ''} ${className}`}
      style={{ '--span': span, '--rows': rows }}
      {...rest}
    >
      {children}
    </div>
  )
}

export function BentoGrid({ children, className = '' }) {
  return <div className={`bento ${className}`}>{children}</div>
}

/** The reference's "5m+ Downloads" circle, reused for a live stat. */
export function StatBubble({ value, label }) {
  return (
    <div className="statbubble">
      <span className="statbubble__value">{value}</span>
      <span className="statbubble__label">{label}</span>
    </div>
  )
}

/** Overlapping circular avatars, initials only (no photos are stored). */
export function AvatarCluster({ names = [], max = 4 }) {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length

  return (
    <div className="avatars">
      {shown.map((name, i) => (
        <span className="avatars__item" key={`${name}-${i}`} title={name} style={{ '--i': i }}>
          {String(name || '?').trim().charAt(0).toUpperCase()}
        </span>
      ))}
      {extra > 0 && (
        <span className="avatars__item avatars__item--more" style={{ '--i': shown.length }}>
          +{extra}
        </span>
      )}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner__ring" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function EmptyState({ glyph = '📦', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty__glyph" aria-hidden="true">{glyph}</span>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}

export { default as ImageDrop } from './ImageDrop'
