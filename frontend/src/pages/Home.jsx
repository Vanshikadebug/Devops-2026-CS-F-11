/**
 * Home — editorial storefront.
 *
 * A wordmark that fills the page width, a four-column info row, then the
 * live listing index in an asymmetric grid (regular rows broken up by 2×2
 * feature tiles), closing on a statement block. Category, search and sort
 * live in the URL so a filtered view can be shared.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'

import { useConfig } from '../app/ConfigProvider'
import { api } from '../lib/api'
import ItemCard from '../components/ItemCard'

import './Home.css'

const YEAR = new Date().getFullYear()

/** Grid rhythm, period 14: a plain row of four, a feature on the right with
    four smalls beside it, then a feature on the left with four smalls. */
function tileSize(index) {
  const p = index % 14
  if (p === 4) return 'feature-r'
  if (p === 9) return 'feature-l'
  return 'normal'
}

export default function Home() {
  const { setting, categories } = useConfig()
  const [params, setParams] = useSearchParams()

  const activeCategory = params.get('category') || ''
  const activeSearch = params.get('search') || ''
  const activeSort = params.get('sort') || 'newest'

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const limit = Number(setting('featured_limit', 18)) || 18

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ limit: String(Math.max(limit, 18)), status: 'Available', sort: activeSort })
    if (activeCategory) query.set('category', activeCategory)
    if (activeSearch) query.set('search', activeSearch)

    setLoading(true)
    api.get(`/items?${query}`, { signal: controller.signal })
      .then((res) => {
        setItems(Array.isArray(res.data) ? res.data : [])
        setTotal(res.pagination?.total ?? res.count ?? res.data?.length ?? 0)
        setError(null)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load listings.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeCategory, activeSearch, activeSort, limit])

  function updateParam(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const siteName = setting('site_name', 'ReuseHub')

  return (
    <div className="home">
      {/* ---------------------------------------------------------------- HERO */}
      <section className="hero shell">
        <Wordmark text={siteName} />
        <hr className="hero__rule" />

        <div className="hero__info">
          <p className="label">{siteName}</p>

          <div className="hero__why">
            <p className="label">Why</p>
            <p>
              {setting('hero_subtitle') ||
                `${setting('tagline', 'Give your things a second life')}. A free, local index of things people no longer need — so somebody nearby can use them instead of a landfill.`}
            </p>
          </div>

          <div className="hero__links">
            <Link to="/items" className="label ulink">Browse full index →</Link>
            <Link to="/items/new" className="label ulink">List an item →</Link>
          </div>

          <p className="label hero__year">© {YEAR}</p>
        </div>
      </section>

      {/* --------------------------------------------------------------- INDEX */}
      <section className="index shell" aria-label="Listings">
        <div className="index__bar">
          <div className="index__cats" role="group" aria-label="Filter by category">
            <button
              type="button"
              className={`ulink ${!activeCategory ? 'is-active' : ''}`}
              onClick={() => updateParam('category', '')}
            >
              All<sup>{total}</sup>
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.id ?? cat.label}
                className={`ulink ${activeCategory === cat.label ? 'is-active' : ''}`}
                onClick={() => updateParam('category', activeCategory === cat.label ? '' : cat.label)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <label className="index__sort">
            <span className="label">Sort</span>
            <select value={activeSort} onChange={(e) => updateParam('sort', e.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">A–Z</option>
            </select>
          </label>
        </div>

        {activeSearch && (
          <p className="index__search">
            Results for “{activeSearch}” —{' '}
            <button type="button" className="ulink is-active" onClick={() => updateParam('search', '')}>clear</button>
          </p>
        )}

        {error ? (
          <p className="index__note">{error}</p>
        ) : loading ? (
          <div className="home-grid" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="home-grid__cell"><div className="skeleton" /></div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="index__note">{setting('empty_state_text', 'Nothing here yet.')}</p>
        ) : (
          <div className="home-grid">
            {items.map((item, i) => {
              const size = tileSize(i)
              return (
                <motion.div
                  key={item.id}
                  className={`home-grid__cell home-grid__cell--${size}`}
                  initial={{ clipPath: 'inset(100% 0 0 0)', y: 30 }}
                  whileInView={{ clipPath: 'inset(0% 0 0 0)', y: 0 }}
                  viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                  transition={{ duration: 0.9, delay: (i % 4) * 0.06, ease: [0.7, 0, 0.2, 1] }}
                >
                  <ItemCard item={item} size={size === 'normal' ? 'normal' : 'feature'} />
                </motion.div>
              )
            })}
          </div>
        )}

        {total > items.length && (
          <div className="index__more">
            <Link to="/items" className="btn btn--outline">See all {total} items</Link>
          </div>
        )}
      </section>

      {/* ----------------------------------------------------------- STATEMENT */}
      <section className="statement shell">
        <hr className="hero__rule" />
        <div className="statement__row">
          <h2 className="statement__title">
            Made to be reused.
            <span>Or loved. Or both.</span>
          </h2>
          <span className="statement__mark" aria-label={`Copyright ${YEAR}`}>©{String(YEAR).slice(-2)}</span>
        </div>
        <p className="statement__body">
          Built by students, for anyone with a cupboard full of perfectly good things.
          List it in a minute, hand it over in person, keep it out of the bin.
        </p>
      </section>
    </div>
  )
}

/** Giant wordmark, scaled so its letters exactly span the column. */
function Wordmark({ text }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    let lastWidth = 0
    const fit = (force) => {
      const width = el.parentElement.clientWidth
      if (!force && width === lastWidth) return
      lastWidth = width
      el.style.fontSize = '100px'
      el.style.fontSize = `${(100 * width) / el.scrollWidth}px`
    }
    fit(true)
    const ro = new ResizeObserver(() => fit(false))
    ro.observe(el.parentElement)
    // Re-measure once the web font replaces the fallback metrics.
    document.fonts?.ready.then(() => fit(true))
    return () => ro.disconnect()
  }, [text])

  // The wrapper has no padding, so its clientWidth is exactly the space to fill.
  return (
    <div className="wordmark-fit">
      <h1 ref={ref} className="wordmark" aria-label={text}>
        {[...text.toUpperCase()].map((ch, i) => (
          <span className="wordmark__mask" key={i} aria-hidden="true">
            <span className="wordmark__char" style={{ '--i': i }}>{ch}</span>
          </span>
        ))}
        <sup className="wordmark__reg" aria-hidden="true">®</sup>
      </h1>
    </div>
  )
}
