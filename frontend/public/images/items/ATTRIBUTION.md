# Demo item photographs — sources and licences

## Why these files are committed to the repo

The seed data originally pointed `image_url` at a third-party image CDN.
Two things were wrong with that:

1. **The pictures did not match the items.** Every one of the twelve
   seeded URLs showed something else — the "Engineering Mathematics"
   listing showed a poetry book, the "wired mouse" showed a wireless
   one, the "wooden desk with a drawer" showed a white metal desk with
   an iMac on it. A URL cannot be reviewed by reading it, so nobody had
   ever looked.
2. **A remote URL can disappear.** When it 404s the card is left with a
   blank grey rectangle, and the app has no way to know it happened.

So the photographs below were each opened and visually checked against
the listing they are attached to, then committed here. Vite serves
`frontend/public/` at the site root, so `/images/items/foo.jpg` is a
same-origin request that cannot break because someone else's CDN
changed.

Items with **no** honest photograph available deliberately store
`image_url = NULL` rather than a decorative stand-in. `ItemImage`
renders the category placeholder for those — see
`frontend/src/components/ItemImage.jsx`.

## Sources

Every file comes from Wikimedia Commons and is freely licensed.
Follow the link for the photographer, the exact licence and the
full file history.

| File | Commons source |
|---|---|
| `casio-fx991es-calculator.jpg` | [File:Casio fx-991ES Calculator New.jpg](https://commons.wikimedia.org/wiki/File:Casio_fx-991ES_Calculator_New.jpg) |
| `assorted-notebooks.jpg` | [File:Notebooks-rainbow.jpg](https://commons.wikimedia.org/wiki/File:Notebooks-rainbow.jpg) |
| `android-tablet.jpg` | [File:Baslate 7sch android tablet computer.jpg](https://commons.wikimedia.org/wiki/File:Baslate_7sch_android_tablet_computer.jpg) |
| `drawing-instrument-box.jpg` | [File:Estoig geomètric.jpg](https://commons.wikimedia.org/wiki/File:Estoig_geom%C3%A8tric.jpg) |
| `cotton-kurta-set.jpg` | [File:Blue khadi kurta.jpg](https://commons.wikimedia.org/wiki/File:Blue_khadi_kurta.jpg) |
| `led-desk-lamp.jpg` | [File:Led desk lmap 1.png](https://commons.wikimedia.org/wiki/File:Led_desk_lmap_1.png) |
| `folding-study-chair.jpg` | [File:Folding chair - have a seat in Oy, Bavaria, Germany.jpeg](https://commons.wikimedia.org/wiki/File:Folding_chair_-_have_a_seat_in_Oy,_Bavaria,_Germany.jpeg) |

## Listings intentionally left without a photograph

| Listing | Why |
|---|---|
| Higher Engineering Mathematics — B.S. Grewal | Book covers are under copyright; Commons cannot host them. |
| Data Structures Using C — Tenenbaum | Same. |
| Wooden Study Desk with Drawer | No freely-licensed photo found of a plain study desk with a drawer. Antique dressing tables are not the same object. |
| Winter Jacket, Size M | Searches returned shopfronts and historical uniforms, nothing resembling a plain padded jacket. |
| Logitech Wired Mouse | Candidates were a bare optical-sensor circuit board and a mouse with a PS/2 plug, which contradicts the "USB" in the description. |

These are honest gaps, not bugs. Attaching a plausible-looking but
wrong photograph is the exact defect this file exists to document.
