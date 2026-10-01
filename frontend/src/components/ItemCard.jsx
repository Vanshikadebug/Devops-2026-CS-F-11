import React from 'react'
import { Link } from 'react-router-dom'

import ItemImage from './ItemImage'
import { statusVariant } from '../lib/display'

import './ItemCard.css'

export default function ItemCard({ item, footer }) {

  const displayLocation =
    item.college_name ||
    item.city_name ||
    item.location ||
    'Location unlisted'


  const condition =
    item.condition ||
    'Good condition'


  const requiresStatusBadge =
    item.status &&
    item.status !== 'Available'


  return (
    <article
      className="icard"
      aria-labelledby={`item-title-${item.id}`}
    >

      {/* PRODUCT IMAGE */}

      <Link
        to={`/items/${item.id}`}
        className="icard__media"
        aria-label={`View ${item.name}`}
      >

        <ItemImage
          item={item}
          ratio="4 / 3"
        />

        {requiresStatusBadge && (
          <span
            className={`badge badge--${statusVariant(
              item.status
            )} icard__status`}
          >
            {item.status}
          </span>
        )}

        <span
          className="icard__favorite"
          aria-hidden="true"
        >
          ♡
        </span>

      </Link>


      {/* CARD CONTENT */}

      <div className="icard__body">

        {/* CATEGORY */}

        <div className="icard__category">
          {item.category || 'Other'}
        </div>


        {/* NAME */}

        <h3
          className="icard__title"
          id={`item-title-${item.id}`}
        >
          <Link to={`/items/${item.id}`}>
            {item.name}
          </Link>
        </h3>


        {/* CONDITION */}

        <div className="icard__condition">
          {condition}
        </div>


        {/* LOCATION */}

        <div className="icard__details">

          <span>
            📍 {displayLocation}
          </span>

        </div>


        {/* SELLER */}

        {item.owner_name && (
          <div className="icard__seller">

            <span className="icard__avatar">
              {item.owner_name
                .charAt(0)
                .toUpperCase()}
            </span>

            <span>
              {item.owner_name}
            </span>

          </div>
        )}


        {/* OPTIONAL FOOTER */}

        {footer && (
          <div className="icard__footer">
            {footer}
          </div>
        )}

      </div>

    </article>
  )
}