import { Link } from 'react-router-dom'

import ItemImage from './ItemImage'

import './ItemCard.css'

/**
 * Editorial product tile: photo on a flat swatch, then a two-column caption
 * (name / condition) and a status line. `size` lets the home grid promote a
 * tile to a feature; `footer` is for owner actions on My Items.
 */
export default function ItemCard({ item, footer, size = 'normal' }) {
  const place = item.college_name || item.city_name || item.location || 'Location unlisted'
  const available = item.status === 'Available'

  return (
    <article className={`item-card item-card--${size}`} aria-labelledby={`item-title-${item.id}`}>
      <Link
        to={`/items/${item.id}`}
        className="item-card__image"
        aria-label={`View ${item.name}`}
        data-cursor="View item"
      >
        <ItemImage item={item} ratio={size === 'feature' ? '1 / 1' : '4 / 5'} />
      </Link>

      <div className="item-card__caption">
        <h3 className="item-card__title" id={`item-title-${item.id}`}>
          <Link to={`/items/${item.id}`}>{item.name}</Link>
        </h3>
        <span className="item-card__cond">{item.condition || item.category || ''}</span>
      </div>

      <p className="item-card__meta">
        <span className={`item-card__dot ${available ? '' : 'item-card__dot--off'}`} aria-hidden="true" />
        {item.status || 'Listed'} · {place}
      </p>

      {footer && <div className="item-card__footer">{footer}</div>}
    </article>
  )
}
