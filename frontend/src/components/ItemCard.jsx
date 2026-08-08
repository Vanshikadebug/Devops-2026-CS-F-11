import { Link } from 'react-router-dom'
import { PLACEHOLDER_IMAGE, STATUS_VARIANTS } from '../utils/constants'
import './ItemCard.css'

/**
 * ItemCard -- one item in the browse grid.
 *
 * This is the component that appears most often in the app, so it is
 * worth getting right. It receives one `item` object and renders it;
 * it does not fetch anything and it holds no state. That makes it a
 * "presentational component" -- easy to reason about, easy to reuse
 * on the Dashboard, on My Items, and in search results alike.
 *
 * The shape of `item` matches exactly what GET /api/items will return
 * in Phase 8:
 *   { id, name, description, category, condition, location,
 *     image_url, status, owner_name, created_at }
 */
function ItemCard({ item }) {
  const statusVariant = STATUS_VARIANTS[item.status] ?? 'neutral'

  return (
    <article className="item-card">
      <Link to={`/items/${item.id}`} className="item-card__media">
        <img
          src={item.image_url || PLACEHOLDER_IMAGE}
          alt={item.name}
          // If the URL is broken (a user can type anything), swap in
          // the placeholder rather than showing a broken-image icon.
          onError={(e) => {
            e.currentTarget.src = PLACEHOLDER_IMAGE
          }}
          loading="lazy"
        />
        <span className={`badge badge--${statusVariant} item-card__status`}>
          {item.status}
        </span>
      </Link>

      <div className="item-card__body">
        <span className="item-card__category">{item.category}</span>

        <h3 className="item-card__title">
          <Link to={`/items/${item.id}`}>{item.name}</Link>
        </h3>

        <p className="item-card__desc">{item.description}</p>

        <div className="item-card__meta">
          <span title="Condition">◈ {item.condition}</span>
          <span title="Location">⌖ {item.location}</span>
        </div>
      </div>
    </article>
  )
}

export default ItemCard
