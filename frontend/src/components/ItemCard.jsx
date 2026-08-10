import { Link } from 'react-router-dom'
import ItemImage from './ItemImage'
import { STATUS_VARIANTS } from '../utils/constants'
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
 * The shape of `item` matches exactly what GET /api/items returns:
 *   { id, name, description, category, condition, location,
 *     college_id, college_name, area_name, city_name,
 *     image_url, status, owner_name, created_at }
 *
 * >>> WHY THERE ARE TWO PLACE FIELDS, AND WHICH ONE IS SHOWN <<<
 * `college_id` is the structured one -- a foreign key, what every
 * filter matches on, and NULL for an off-campus listing. `location`
 * is the human sentence the owner typed, is NOT NULL, and is the only
 * thing an off-campus item has to say about where it is.
 *
 * So the card shows the college when there is one and the free text
 * when there is not. Doing it the other way round -- always showing
 * `location` -- would look fine on the seeded data and then quietly
 * show "Jagatpura, Jaipur" for four different campuses in the same
 * area, which is the sort of thing that reads as correct until
 * someone tries to actually go and collect the item.
 */
function ItemCard({ item }) {
  const statusVariant = STATUS_VARIANTS[item.status] ?? 'neutral'

  /* Deliberately `??` and not `||` on the tooltip: an empty-string
     area would be swallowed by `||`, and this is the same class of
     trap as `{count || '—'}` printing a dash for a real zero. */
  const place = item.college_name ?? item.location
  const placeDetail = item.college_name
    ? [item.area_name, item.city_name].filter(Boolean).join(', ')
    : null

  return (
    <article className="item-card">
      <Link
        to={`/items/${item.id}`}
        className="item-card__media"
        /* The image is decorative here -- the title link right below
           says the same thing -- so this link is hidden from the
           accessibility tree rather than read out as a second,
           identical destination. */
        tabIndex={-1}
        aria-hidden="true"
      >
        <ItemImage item={item} />
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
          <span title={placeDetail ? `${place} — ${placeDetail}` : 'Location'}>
            ⌖ {place}
          </span>
        </div>
      </div>
    </article>
  )
}

export default ItemCard
