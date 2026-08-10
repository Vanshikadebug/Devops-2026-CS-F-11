import { useState } from 'react'
import { CATEGORY_ART, DEFAULT_CATEGORY_ART } from '../utils/constants'
import './ItemImage.css'

/**
 * ItemImage -- the picture area of an item, which is never blank.
 *
 * WHAT IS THIS FILE?
 * One small component with one job: show an item's photo if there is
 * one that actually loads, and something deliberate if there is not.
 * ItemCard used to do this inline; it is a component now because the
 * item detail page and My Items will need exactly the same behaviour,
 * and three copies of it would drift apart.
 *
 * =================================================================
 * THE THREE WAYS AN ITEM PICTURE GOES WRONG
 * =================================================================
 * All three end up looking the same to a user -- an ugly gap where a
 * photo should be -- but they need different handling:
 *
 *   1. image_url IS NULL.
 *      Perfectly normal. Most of our seeded listings have no photo,
 *      because we would rather show nothing than show a stock image
 *      of a different object. Rendering <img src={null}> gives you
 *      the browser's broken-image icon, which reads as "this site is
 *      broken" rather than "this listing has no picture".
 *
 *   2. THE URL IS THERE BUT DOES NOT LOAD.
 *      A user can type any URL they like into the Add Item form. The
 *      host goes down, the file moves, the link was a typo, or it is
 *      a hotlink the other site now blocks. This is the case that
 *      leaves a broken-image glyph in production forever.
 *
 *   3. THE URL LOADS, SLOWLY.
 *      Between mount and the image arriving there is a hole in the
 *      layout. Brief, but on a grid of twelve cards over a slow
 *      connection it is the whole first impression.
 *
 * >>> HOW ALL THREE ARE HANDLED AT ONCE <<<
 * The fallback is ALWAYS rendered, underneath, filling the frame.
 * The photo is layered on top of it and simply hides it once it
 * arrives. So there is no moment, in any of the three cases, when
 * the frame is empty -- case 3 stops being a special case at all,
 * because the "loading" state and the "no photo" state look the
 * same, which is exactly right: in both, we do not have a picture
 * to show yet.
 *
 * =================================================================
 * WHY `failedSrc` IS A STRING AND NOT A BOOLEAN
 * =================================================================
 * The obvious version is `const [failed, setFailed] = useState(false)`.
 * It has a bug that only shows up when React reuses a component
 * instance for a DIFFERENT item -- which happens constantly in a
 * filtered grid, where the same DOM position holds a chair one second
 * and a textbook the next.
 *
 * With a boolean: the chair's URL fails, `failed` becomes true, the
 * filter changes, this instance is handed the textbook's props -- and
 * `failed` is still true, because state survives a re-render. The
 * textbook's perfectly good photo is never even requested.
 *
 * Remembering WHICH src failed makes the check self-correcting:
 * `failedSrc === src` is false the instant the src changes, with no
 * effect, no cleanup and nothing to remember to reset. Deriving state
 * during render instead of synchronising it in a useEffect is the
 * pattern React's own docs recommend, and this is why.
 */
function ItemImage({ item, className = '' }) {
  const [failedSrc, setFailedSrc] = useState(null)

  const src = item?.image_url || null
  const category = item?.category
  const art = CATEGORY_ART[category] ?? DEFAULT_CATEGORY_ART

  // The photo is worth attempting unless we already watched this exact
  // URL fail. See the long note above on why this is not a boolean.
  const showPhoto = Boolean(src) && failedSrc !== src

  return (
    <span className={`item-image item-image--${art.tint} ${className}`.trim()}>
      {/* The fallback layer. aria-hidden because the glyph is
          decoration -- a screen reader announcing "books emoji" is
          noise. The real text alternative is chosen below, where we
          know whether a photo is actually being shown. */}
      <span className="item-image__fallback" aria-hidden="true">
        <span className="item-image__glyph">{art.glyph}</span>
        <span className="item-image__label">{category ?? 'Item'}</span>
      </span>

      {showPhoto && (
        <img
          className="item-image__photo"
          src={src}
          alt={item?.name ?? ''}
          /* onError fires for a 404, a DNS failure, a file that is not
             really an image, and a host refusing to serve us. Recording
             the URL that failed unmounts this <img> entirely, so the
             browser's broken-image glyph never gets a chance to render
             -- and, unlike reassigning `e.currentTarget.src`, it cannot
             loop if the replacement fails too. */
          onError={() => setFailedSrc(src)}
          /* Below the fold, the browser skips the request until the
             card is nearly in view. On a long grid that is most of the
             images on the page. */
          loading="lazy"
          /* Reserves the aspect box before the bytes arrive, so cards
             below do not jump downward as each photo lands. */
          width="400"
          height="300"
        />
      )}

      {!showPhoto && (
        /* Visually hidden, still read aloud. Someone using a screen
           reader hears that there is no photo rather than silence,
           which is indistinguishable from an image that failed to get
           an alt attribute. */
        <span className="sr-only">No photo available for this item</span>
      )}
    </span>
  )
}

export default ItemImage
