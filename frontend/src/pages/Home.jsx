import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useConfig } from '../app/ConfigProvider'
import { api } from '../lib/api'
import ItemCard from '../components/ItemCard'
import ItemImage from '../components/ItemImage'
import {
  ArrowButton, Pill, IconButton, SearchPill, BentoGrid, BentoCard,
  StatBubble, AvatarCluster, Spinner, EmptyState,
} from '../components/ui'
import './Home.css'

export default function Home() {
  const { setting, categories, cities, social } = useConfig()
  const [params, setParams] = useSearchParams()

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [term, setTerm] = useState(params.get('search') || '')

  const activeCategory = params.get('category') || ''
  const activeCity = params.get('city') || ''
  const limit = Number(setting('featured_limit', 8)) || 8

  useEffect(() => {
    // AbortController so a fast sequence of filter clicks cannot have an
    // earlier, slower response overwrite a later one.
    const controller = new AbortController()
    setLoading(true)

    const query = new URLSearchParams({ limit: String(limit), status: 'Available' })
    if (activeCategory) query.set('category', activeCategory)
    if (activeCity) query.set('city', activeCity)
    if (params.get('search')) query.set('search', params.get('search'))

    api
      .get(`/items?${query}`, { signal: controller.signal })
      .then((res) => {
        setItems(res.data)
        setTotal(res.pagination?.total ?? res.count)
        setError(null)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeCategory, activeCity, params, limit])

  function setParam(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const heroImage = setting('hero_image_url')
  const featured = items[0]

  return (
    <div className="home">
      <div className="shell">
        <BentoGrid className="home__hero">
          {/* --- The hero cell ------------------------------------- */}
          <BentoCard span={3} rows={2} className="hero">
            {setting('hero_badge') && (
              <Pill tone="sunk" className="hero__badge">
                <span aria-hidden="true">{setting('logo_glyph', '♻')}</span>
                {setting('hero_badge')}
              </Pill>
            )}

            <h1 className="hero__title">{setting('hero_title')}</h1>

            <div className="hero__lead">
              <span className="hero__step" aria-hidden="true">01</span>
              <span className="hero__rule" aria-hidden="true" />
              <p className="hero__sub muted">{setting('hero_subtitle')}</p>
            </div>

            <div className="hero__cta">
              <ArrowButton to={setting('hero_cta_href', '/items')} size="lg">
                {setting('hero_cta_label', 'Browse items')}
              </ArrowButton>
            </div>

            <div className="hero__art">
              {heroImage ? (
                <img src={heroImage} alt="" className="hero__img" />
              ) : featured ? (
                <Link to={`/items/${featured.id}`} className="hero__feature">
                  <ItemImage item={featured} ratio="1 / 1" />
                </Link>
              ) : null}
            </div>

            {social.length > 0 && (
              <div className="hero__social">
                <span className="muted">Follow us on:</span>
                {social.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer noopener"
                    aria-label={s.platform} title={s.platform} className="hero__socialdot">
                    {s.platform.charAt(0)}
                  </a>
                ))}
              </div>
            )}
          </BentoCard>

          {/* --- Categories, straight from the categories table ---- */}
          <BentoCard span={1}>
            <div className="row row--between">
              <h3>Categories</h3>
              {activeCategory && (
                <button type="button" className="home__clear" onClick={() => setParam('category', '')}>
                  Clear
                </button>
              )}
            </div>

            <div className="home__cats">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`home__cat ${activeCategory === cat.label ? 'is-active' : ''}`}
                  onClick={() => setParam('category', activeCategory === cat.label ? '' : cat.label)}
                  title={cat.label}
                >
                  <span className={`home__catglyph itemimg--${cat.tint}`} aria-hidden="true">
                    {cat.glyph || '📦'}
                  </span>
                  <span className="home__catlabel">{cat.label}</span>
                </button>
              ))}
            </div>
          </BentoCard>

          {/* --- Campus picker, from the cities table --------------- */}
          <BentoCard span={1}>
            <h3>Near you</h3>
            <p className="muted home__nearsub">Pick a city to see what is close.</p>

            <div className="home__cities">
              {cities.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  className={`home__city ${String(activeCity) === String(city.id) ? 'is-active' : ''}`}
                  onClick={() => setParam('city', String(activeCity) === String(city.id) ? '' : String(city.id))}
                >
                  <span>{city.name}</span>
                  <span className="muted">{city.college_count}</span>
                </button>
              ))}
            </div>
          </BentoCard>
        </BentoGrid>

        {/* --- Stat strip ---------------------------------------- */}
        <BentoGrid className="home__strip">
          <BentoCard span={1} className="strip__stat">
            <StatBubble value={total} label="items listed" />
            <div>
              <strong>Live right now</strong>
              <p className="muted">Available to claim on campus.</p>
            </div>
          </BentoCard>

          <BentoCard span={1} className="strip__people">
            <AvatarCluster names={items.map((i) => i.owner_name).filter(Boolean)} />
            <div>
              <strong>Students sharing</strong>
              <p className="muted">Real people on your campus.</p>
            </div>
          </BentoCard>

          <BentoCard span={2} className="strip__search">
            <div>
              <strong>Looking for something specific?</strong>
              <p className="muted">Search every listing by name or description.</p>
            </div>
            <SearchPill
              value={term}
              onChange={setTerm}
              onSubmit={(v) => setParam('search', v.trim())}
              placeholder="Try 'calculator'…"
            />
          </BentoCard>
        </BentoGrid>

        {/* --- Listings ------------------------------------------- */}
        <section className="home__list">
          <div className="row row--between home__listhead">
            <div>
              <h2>{activeCategory || 'Latest listings'}</h2>
              <p className="muted">
                {loading ? 'Loading…' : `${total} item${total === 1 ? '' : 's'} available`}
              </p>
            </div>
            <IconButton to="/items" tone="ink" label="See all listings" size="lg">
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
                <path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
          </div>

          {error && <div className="alert alert--error">{error}</div>}

          {loading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState title="Nothing to show" glyph="🔍">
              {setting('empty_state_text')}
            </EmptyState>
          ) : (
            <div className="item-grid">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
