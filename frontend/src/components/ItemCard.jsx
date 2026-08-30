import { Link } from 'react-router-dom'
import ItemImage from './ItemImage'
import { statusVariant } from '../lib/display'
import './ItemCard.css'

export default function ItemCard({ item, footer }) {
  return (
    <article className="icard">
      <Link to={`/items/${item.id}`} className="icard__media">
        <ItemImage item={item} />
        {item.status && item.status !== 'Available' && (
          <span className={`badge badge--${statusVariant(item.status)} icard__status`}>
            {item.status}
          </span>
        )}
        <span className="icard__arrow" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
            <path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Link>

      <div className="icard__body">
        <div className="icard__meta">
          <span className="icard__cat">{item.category}</span>
          <span className="icard__dot" aria-hidden="true">·</span>
          <span>{item.condition}</span>
        </div>

        <h3 className="icard__title">
          <Link to={`/items/${item.id}`}>{item.name}</Link>
        </h3>

        <p className="icard__where muted">
          {item.college_name || item.location}
        </p>

        {footer && <div className="icard__footer">{footer}</div>}
      </div>
    </article>
  )
}
