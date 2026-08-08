/**
 * Shared constant values for the frontend.
 *
 * WHY CENTRALISE THESE?
 * The category list appears in the Add Item form, the Edit form and
 * the dashboard filter. Typed out three times, the three copies drift
 * apart -- someone adds "Sports" to the form but not the filter, and
 * the item becomes unfindable. One array, imported everywhere, makes
 * that impossible.
 *
 * These strings must match the ENUM values in database/schema.sql
 * (Phase 4) exactly, or MySQL will reject the insert.
 */

export const CATEGORIES = [
  'Books',
  'Electronics',
  'Clothing',
  'Furniture',
  'Stationery',
  'Other',
]

export const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor']

export const ITEM_STATUSES = ['Available', 'Reserved', 'Unavailable']

export const REQUEST_STATUSES = ['Pending', 'Accepted', 'Rejected']

/**
 * Maps a status string to the CSS modifier class that colours its
 * badge. Keeping this next to the statuses means a new status can
 * never be added without someone noticing it needs a colour.
 */
export const STATUS_VARIANTS = {
  Available: 'success',
  Reserved: 'warning',
  Unavailable: 'neutral',
  Pending: 'warning',
  Accepted: 'success',
  Rejected: 'danger',
}

/** Fallback picture when an item has no image_url, or the URL 404s. */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
       <rect width="400" height="300" fill="#f1f5f9"/>
       <text x="50%" y="50%" font-family="system-ui,sans-serif" font-size="18"
             fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">
         No image
       </text>
     </svg>`,
  )
