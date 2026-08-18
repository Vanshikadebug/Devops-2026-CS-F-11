import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConfig } from '../app/ConfigProvider'
import { api } from '../lib/api'
import ItemCard from '../components/ItemCard'
import { SearchPill, Pill, Spinner, EmptyState, Button } from '../components/ui'
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

  return (
    <div className="page browse">
      <div className="shell">
        <header className="browse__head">
          <div>
            <h1>Browse listings</h1>
            <p className="muted">
              {loading ? 'Loading…' : `${pagination?.total ?? items.length} items available`}
            </p>
          </div>
          <SearchPill
            value={term}
            onChange={setTerm}
            onSubmit={(v) => setParam('search', v.trim())}
            placeholder="Search listings…"
            size="lg"
          />
        </header>

        <div className="browse__body">
          <aside className="browse__filters card">
            <div className="row row--between">
              <h3>Filters</h3>
              {activeFilters.length > 0 && (
                <button
                  type="button"
                  className="browse__clear"
                  onClick={() => {
                    setParams({}, { replace: true })
                    // `term` is seeded from the URL only on mount, so clearing
                    // the params alone would unfilter the results while leaving
                    // the old query sitting visibly in the search box.
                    setTerm('')
                  }}
                >
                  Clear all
                </button>
              )}
            </div>

            <FilterGroup label="Category">
              {categories.map((c) => (
                <FilterChip
                  key={c.id}
                  active={get('category') === c.label}
                  onClick={() => setParam('category', get('category') === c.label ? '' : c.label)}
                >
                  <span aria-hidden="true">{c.glyph || '📦'}</span> {c.label}
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

            <FilterGroup label="Sort">
              {SORTS.map((s) => (
                <FilterChip
                  key={s.value}
                  active={(get('sort') || 'newest') === s.value}
                  onClick={() => setParam('sort', s.value)}
                >
                  {s.label}
                </FilterChip>
              ))}
            </FilterGroup>
          </aside>

          <section className="browse__results">
            {error && <div className="alert alert--error">{error}</div>}

            {loading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState title="No matches" glyph="🔍">
                {activeFilters.length
                  ? 'Try removing a filter.'
                  : setting('empty_state_text')}
              </EmptyState>
            ) : (
              <>
                <div className="item-grid">
                  {items.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </div>

                {pagination && pagination.totalPages > 1 && (
                  <nav className="browse__pager" aria-label="Pagination">
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={!pagination.hasPrev}
                      onClick={() => setParam('page', String(page - 1))}
                    >
                      Previous
                    </Button>
                    <Pill tone="sunk">Page {pagination.page} of {pagination.totalPages}</Pill>
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={!pagination.hasNext}
                      onClick={() => setParam('page', String(page + 1))}
                    >
                      Next
                    </Button>
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
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
      className={`browse__chip ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}
