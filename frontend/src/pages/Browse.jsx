import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConfig } from '../app/ConfigProvider'
import { api } from '../lib/api'
import ItemCard from '../components/ItemCard'
import './Browse.css'

/* The full listing page. Every filter option -- categories, conditions,
   cities -- comes from /api/config, so adding a category in the admin panel
   adds a filter here with no code change. */

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'A–Z' },
]

export default function Browse() {
  const { categories, conditions, cities, setting } = useConfig()
  const [params, setParams] = useSearchParams()

  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [term, setTerm] = useState(params.get('search') || '')

  const get = (key) => params.get(key) || ''
  const page = Number(get('page')) || 1

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)

    const query = new URLSearchParams()
    for (const key of ['search', 'category', 'condition', 'city', 'college', 'status', 'sort']) {
      if (params.get(key)) query.set(key, params.get(key))
    }
    query.set('page', String(page))
    query.set('limit', '24')

    api
      .get(`/items?${query}`, { signal: controller.signal })
      .then((res) => {
        setItems(res.data)
        setPagination(res.pagination)
        setError(null)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [params, page])

  function setParam(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Any filter change invalidates the current page number.
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const activeFilters = ['search', 'category', 'condition', 'city', 'status']
    .filter((k) => get(k))

  function goToPage(next) {
    setParam('page', String(next))
    // The grid swaps in place, so without this the next page opens
    // already scrolled to the bottom of the list.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const total = pagination?.total ?? items.length
  const pad = (n) => String(n).padStart(2, '0')

  return (
    <div className="browse shell">
      <header className="browse__head">
        <h1 className="browse__title">
          Index<sup>{loading ? '··' : total}</sup>
        </h1>
        <hr className="browse__rule" />
        <div className="browse__bar">
          <form
            className="browse__search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setParam('search', term.trim())
            }}
          >
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search the index…"
              aria-label="Search listings"
            />
            <button type="submit" className="label ulink">Search →</button>
          </form>

          <label className="browse__sort">
            <span className="label">Sort</span>
            <select value={get('sort') || 'newest'} onChange={(e) => setParam('sort', e.target.value)}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="browse__body">
        <aside className="browse__filters" aria-label="Filters">
          <FilterGroup label="Category">
            {categories.map((c) => (
              <FilterChip
                key={c.id}
                active={get('category') === c.label}
                onClick={() => setParam('category', get('category') === c.label ? '' : c.label)}
              >
                {c.label}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="Condition">
            {conditions.map((c) => (
              <FilterChip
                key={c.id}
                active={get('condition') === c.label}
                onClick={() => setParam('condition', get('condition') === c.label ? '' : c.label)}
              >
                {c.label}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="City">
            {cities.map((c) => (
              <FilterChip
                key={c.id}
                active={get('city') === String(c.id)}
                onClick={() => setParam('city', get('city') === String(c.id) ? '' : String(c.id))}
              >
                {c.name}
              </FilterChip>
            ))}
          </FilterGroup>

          {activeFilters.length > 0 && (
            <button
              type="button"
              className="browse__clear label ulink is-active"
              onClick={() => {
                setParams({}, { replace: true })
                // `term` is seeded from the URL only on mount, so clearing
                // the params alone would unfilter the results while leaving
                // the old query sitting visibly in the search box.
                setTerm('')
              }}
            >
              Clear all filters ×
            </button>
          )}
        </aside>

        <section className="browse__results" aria-busy={loading}>
          {error && <p className="browse__note">{error}</p>}

          {loading ? (
            <div className="item-grid browse__grid">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="browse__note">
              No matches. {activeFilters.length ? 'Try removing a filter.' : setting('empty_state_text')}
            </p>
          ) : (
            <>
              <div className="item-grid browse__grid">
                {items.map((item, i) => (
                  <div key={item.id} className="browse__cell" style={{ '--i': i % 12 }}>
                    <ItemCard item={item} />
                  </div>
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <nav className="browse__pager" aria-label="Pagination">
                  <button type="button" className="ulink" disabled={!pagination.hasPrev} onClick={() => goToPage(page - 1)}>
                    ← Previous
                  </button>
                  <span>{pad(pagination.page)} / {pad(pagination.totalPages)}</span>
                  <button type="button" className="ulink" disabled={!pagination.hasNext} onClick={() => goToPage(page + 1)}>
                    Next →
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function FilterGroup({ label, children }) {
  return (
    <div className="browse__group">
      <span className="browse__grouplabel">{label}</span>
      <div className="browse__chips">{children}</div>
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      className={`browse__chip ulink ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}
