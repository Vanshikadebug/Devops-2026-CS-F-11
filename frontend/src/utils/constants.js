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

/**
 * The fallback artwork for an item with no photo, keyed by category.
 *
 * >>> WHY THIS REPLACED THE OLD `PLACEHOLDER_IMAGE` DATA-URI <<<
 * That constant was a base64-ish SVG string reading "No image", fed
 * into an <img src>. It worked, but it had two problems worth naming:
 *
 *  1. IT WAS STILL AN IMAGE REQUEST. An <img> whose src fails leaves
 *     the browser's broken-image glyph -- and a data-URI can fail too
 *     if it is ever mistyped. Real markup cannot 404.
 *  2. IT SAID NOTHING. Every empty card looked identical. A reader
 *     scanning the grid learned nothing from the grey rectangle.
 *
 * A category glyph is honest -- it does not pretend to be a
 * photograph of the actual object -- while still telling you at a
 * glance that the row is a book rather than a chair. That directly
 * serves the rule that we do not put random unrelated stock photos on
 * listings: when we do not have the real thing, we say so, in a way
 * that is still useful.
 *
 * The `tint` picks the background wash in ItemImage.css. The keys
 * must match the CATEGORIES array above, because that array is what
 * the ENUM in schema.sql allows.
 */
export const CATEGORY_ART = {
  Books: { glyph: '📚', tint: 'books' },
  Electronics: { glyph: '🎧', tint: 'electronics' },
  Clothing: { glyph: '👕', tint: 'clothing' },
  Furniture: { glyph: '🪑', tint: 'furniture' },
  Stationery: { glyph: '✏️', tint: 'stationery' },
  Other: { glyph: '📦', tint: 'other' },
}

/** Used when `category` is missing or is a value we do not know. */
export const DEFAULT_CATEGORY_ART = { glyph: '📦', tint: 'other' }
