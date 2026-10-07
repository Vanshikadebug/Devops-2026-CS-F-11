/**
 * Home — editorial storefront.
 *
 * A wordmark that fills the page width, a four-column info row, then the
 * live listing index in an asymmetric grid (regular rows broken up by 2×2
 * feature tiles), closing on a statement block. Category, search and sort
 * live in the URL so a filtered view can be shared.
 */
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  motion, useAnimationFrame, useInView, useMotionValue, useScroll, useSpring, useTransform, useVelocity,
} from 'framer-motion'

import { useConfig } from '../app/ConfigProvider'
import { api } from '../lib/api'
import { assetUrl } from '../lib/origin'
import { categoryArt } from '../lib/display'
import ItemCard from '../components/ItemCard'
import LiveIndex from '../components/LiveIndex'

// three.js is ~0.7 MB; it only loads when the orbit section is reached.
const ReuseOrbit = lazy(() => import('../components/ReuseOrbit'))

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

      <OrbitSection />
      <Marquee words={['Reduce', 'Reuse', 'Reshare', 'Repeat']} />

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

      <LiveIndex />

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

/** Sticky full-screen 3D ring of real listings, turned by scrolling. */
function OrbitSection() {
  const ref = useRef(null)
  const navigate = useNavigate()
  const { categoryByLabel } = useConfig()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const near = useInView(ref, { margin: '300px 0px' })
  const [mounted, setMounted] = useState(false)
  const [items, setItems] = useState([])
  const [hovered, setHovered] = useState(null)

  useEffect(() => { if (near) setMounted(true) }, [near])

  useEffect(() => {
    if (!mounted) return undefined
    const controller = new AbortController()
    api.get('/items?limit=16&status=Available', { signal: controller.signal })
      .then((res) => setItems(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
    return () => controller.abort()
  }, [mounted])

  const glyphFor = useCallback((label) => categoryArt(categoryByLabel, label).glyph, [categoryByLabel])
  const titleY = useTransform(scrollYProgress, [0.15, 0.85], ['30%', '-30%'])

  return (
    <section ref={ref} className="orbit" aria-label="Listings in orbit">
      <div className="orbit__sticky" data-cursor={hovered ? 'View item' : undefined}>
        {mounted && (
          <Suspense fallback={null}>
            <ReuseOrbit
              items={items}
              glyphFor={glyphFor}
              photoUrl={assetUrl}
              progress={scrollYProgress}
              active={near}
              onHover={setHovered}
              onOpen={(card) => navigate(`/items/${card.id}`)}
            />
          </Suspense>
        )}

        <motion.h2 className="orbit__title" style={{ y: titleY }}>
          Every thing,
          <span>another orbit.</span>
        </motion.h2>

        <p className="orbit__caption label" aria-live="polite">
          {hovered
            ? <>{hovered.name}<span> — {hovered.category} · click to open</span></>
            : <>Scroll to turn the ring<span> — every card is a real listing</span></>}
        </p>
      </div>
    </section>
  )
}

const wrap = (min, max, v) => {
  const range = max - min
  return ((((v - min) % range) + range) % range) + min
}

/** Huge text band; scroll speed pushes it, scroll direction flips it. */
function Marquee({ words }) {
  const base = useMotionValue(0)
  const { scrollY } = useScroll()
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 })
  const boost = useTransform(velocity, [0, 1000], [0, 5], { clamp: false })
  const direction = useRef(1)
  const x = useTransform(base, (v) => `${wrap(-50, 0, v)}%`)
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useAnimationFrame((_, delta) => {
    if (reduced.current) return
    if (boost.get() < 0) direction.current = -1
    else if (boost.get() > 0) direction.current = 1
    const step = direction.current * -2.2 * (delta / 1000)
    base.set(base.get() + step + step * Math.abs(boost.get()))
  })

  const run = words.flatMap((w, i) => [
    <span key={`w${i}`} className={i % 2 ? 'marquee__word marquee__word--outline' : 'marquee__word'}>{w}</span>,
    <span key={`s${i}`} className="marquee__star" aria-hidden="true">✺</span>,
  ])

  return (
    <div className="marquee" aria-label={words.join(', ')}>
      <motion.div className="marquee__track" style={{ x }} aria-hidden="true">
        <div className="marquee__run">{run}</div>
        <div className="marquee__run">{run}</div>
      </motion.div>
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
