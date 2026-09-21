/**
 * ==============================================================================
 * ITEM CARD COMPONENT (MANIA E-COMMERCE THEME)
 * ==============================================================================
 * 
 * @file ItemCard.jsx
 * @description A highly reusable UI component for displaying individual items 
 * in a catalog grid. Supports dynamic status badges, category metadata, 
 * and custom footer injections.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import ItemImage from './ItemImage';
import { statusVariant } from '../lib/display';
import './ItemCard.css';

/**
 * @typedef {Object} ItemObject
 * @property {string|number} id - Unique identifier for the item.
 * @property {string} name - The display title of the item.
 * @property {string} [category] - The categorical classification of the item.
 * @property {string} [condition] - The physical condition (e.g., 'New', 'Used').
 * @property {string} [status] - The availability status (e.g., 'Available', 'Claimed').
 * @property {string} [college_name] - The primary institutional location.
 * @property {string} [location] - Secondary or specific physical location details.
 */

/**
 * @typedef {Object} ItemCardProps
 * @property {ItemObject} item - The data object containing all item details.
 * @property {React.ReactNode} [footer] - Optional React node to inject action buttons 
 *                                        or extra metadata at the bottom of the card.
 */

/**
 * ArrowRightUpIcon Component
 * 
 * Extracted SVG icon component for the hover state of the item card.
 * Keeping icons as separate components improves readability and reusability.
 * 
 * @returns {React.JSX.Element} The rendered SVG element.
 */
function ArrowRightUpIcon() {
  return (
    <svg 
      viewBox="0 0 16 16" 
      width="13" 
      height="13" 
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M4 12L12 4M12 4H6M12 4v6" 
        stroke="currentColor" 
        strokeWidth="1.8"
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  );
}

/**
 * ItemCard Component
 * 
 * Renders a stylized, boxy retail card. Features an image thumbnail, 
 * conditional status badging, title, location, and an optional footer slot.
 * 
 * @param {ItemCardProps} props - The component properties.
 * @returns {React.JSX.Element} The rendered article component.
 */
export default function ItemCard({ item, footer }) {
  
  // --- Derived State & Fallbacks ---
  // Ensure we have a valid location string by falling back gracefully
  const displayLocation = item.college_name || item.location || 'Location unlisted';
  
  // Determine if the item needs a special status badge (anything other than 'Available')
  const requiresStatusBadge = item.status && item.status !== 'Available';

  return (
    <article className="icard" aria-labelledby={`item-title-${item.id}`}>
      
      {/* --- 1. Media Area (Image & Badges) --- */}
      <Link 
        to={`/items/${item.id}`} 
        className="icard__media"
        aria-label={`View details for ${item.name}`}
      >
        {/* Render the extracted image component */}
        <ItemImage item={item} />
        
        {/* Conditionally render the status badge if applicable */}
        {requiresStatusBadge && (
          <span 
            className={`badge badge--${statusVariant(item.status)} icard__status`}
            aria-live="polite"
          >
            {item.status}
          </span>
        )}
        
        {/* Hover interaction icon */}
        <span className="icard__arrow" aria-hidden="true">
          <ArrowRightUpIcon />
        </span>
      </Link>

      {/* --- 2. Content Body --- */}
      <div className="icard__body">
        
        {/* Item Metadata (Category & Condition) */}
        <div className="icard__meta">
          <span className="icard__cat">
            {item.category || 'Uncategorized'}
          </span>
          <span className="icard__dot" aria-hidden="true">·</span>
          <span>
            {item.condition || 'Condition unknown'}
          </span>
        </div>

        {/* Item Title */}
        <h3 className="icard__title" id={`item-title-${item.id}`}>
          <Link to={`/items/${item.id}`}>
            {item.name}
          </Link>
        </h3>

        {/* Item Location */}
        <p className="icard__where muted">
          {displayLocation}
        </p>

        {/* --- 3. Optional Footer Injection --- */}
        {/* Useful for injecting Edit/Delete buttons on user dashboards */}
        {footer && (
          <div className="icard__footer">
            {footer}
          </div>
        )}
        
      </div>
    </article>
  );
}