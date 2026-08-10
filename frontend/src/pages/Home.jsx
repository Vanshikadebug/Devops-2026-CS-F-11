import { useCallback, useEffect, useMemo, useState } from 'react'
import ItemCard from '../components/ItemCard'
import LocationPicker from '../components/LocationPicker'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useLocationSelection } from '../hooks/useLocationSelection'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { itemService } from '../services/itemService'
import { CATEGORIES, CONDITIONS } from '../utils/constants'
import './Home.css'

/**
 * Home -- browse by campus, then search within it.
 *
 * WHAT THIS PAGE DOES NOW
 * The flow the feature was asked for, in order:
 *
 *   city -> area -> college -> that college's items -> search -> filter
 *
 * Each step narrows the one below it. The selection lives in
 * useLocationSelection (which also persists it and seeds it from the
 * signed-in user's profile); the search text and the dropdown filters
 * live here, because nothing outside this page needs them.
 *
 * =================================================================
 * ONE REQUEST PER STATE, NOT ONE PER CONTROL
 * =================================================================
 * There is a single effect below that fetches items, and it depends
 * on every filter at once. The alternative -- an onChange handler per
 * control, each firing its own fetch -- looks more direct and is
 * where this kind of page usually goes wrong: two controls changed in
 * quick succession produce two in-flight requests, and whichever
 * answers LAST wins, regardless of which was asked last. The grid
 * then shows the result of a query the user has already moved on
 * from.
 *
 * Deriving the request from state instead means there is exactly one
 * description of "what should be on screen", and React re-runs it
 * whenever that description changes. The AbortController in the
 * cleanup cancels the superseded request rather than racing it.
 *
 * =================================================================
 * WHY THE FILTERS GO TO THE SERVER RATHER THAN FILTERING IN JS
 * =================================================================
 * Everything on this page could be done with .filter() on an array
 * the browser already has -- and with thirteen seeded items it would
 * be indistinguishable. It stops working the moment the site holds
 * more items than one page should download, which is the point of
 * having a database at all. Sending the filter to SQL keeps the
 * payload proportional to what is displayed, and the composite index
 * on (college_id, status, created_at) exists precisely to serve this
 * query shape.
 *
 * >>> THE ONE THING THAT IS HARD-CODED, AND WHY IT IS ALLOWED <<<
 * Nothing here names a city, an area or a college. The only literals
 * are CATEGORIES and CONDITIONS, imported from constants.js, and
 * those are not data -- they are the ENUM values in schema.sql, which
 * the database itself will reject if they drift. Every place name on
 * this page arrives from /api/locations.
 */
function Home() {
  const { selection, setSelection, college } = useLocationSelection()

  /* Two variables for one search box. `search` is what is in the
     input and must update on every keystroke or the field feels
     broken; `debouncedSearch` is what gets sent, 300ms after typing
     stops. See useDebouncedValue for why sending every keystroke is
     both wasteful and racy. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const [category, setCategory] = useState('')
  const [condition, setCondition] = useState('')

  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  /* Memoised so its identity only changes when a value inside it
     does. Without this, a brand-new object every render would make
     the effect below re-run on every render -- fetching in a loop. */
  const filters = useMemo(
    () => ({
      college: selection.collegeId,
      /* Sent only when no college is chosen. The backend applies the
         narrowest filter it is given, so sending all three is
         harmless -- but sending only what is meant keeps the URL in
         the network tab honest about what the page is asking for. */
      area: selection.collegeId ? null : selection.areaId,
      city: selection.collegeId || selection.areaId ? null : selection.cityId,
      search: debouncedSearch,
      category,
      condition,
    }),
    [selection, debouncedSearch, category, condition],
  )

  useEffect(() => {
    /* Cancels the in-flight request when the filters change again, or
       when the user navigates away. Without it, an unmounted
       component would still call setItems, and a superseded response
       could overwrite a newer one. StrictMode's deliberate
       double-mount in development makes both immediately visible. */
    const controller = new AbortController()

    setStatus('loading')
    setError(null)

    itemService
      .getAll(filters, { signal: controller.signal })
      .then((data) => {
        setItems(data)
        setStatus('ready')
      })
      .catch((err) => {
        // An abort is us cancelling on purpose, not a failure.
        if (err.name === 'AbortError') return
        setError(err)
        setStatus('error')
      })

    return () => controller.abort()
  }, [filters, attempt])

  const hasFilters = Boolean(debouncedSearch || category || condition)

  const clearFilters = () => {
    setSearch('')
    setCategory('')
    setCondition('')
  }

  /* What the page calls the place it is showing. Every branch comes
     from the server: `college` was resolved by id, so a shared link
     prints "SKIT Jaipur" rather than "college 1". */
  const scopeLabel = college
    ? college.short_name
    : selection.cityId
      ? 'nearby'
      : 'everywhere'

  return (
    <div className="container page">
      <section className="hero">
        <h1 className="hero__title">
          Give your things a <span className="hero__accent">second life</span>
        </h1>
        <p className="hero__subtitle">
          Find what students near you are passing on. Pick your college to see
          what is available on your campus.
        </p>
      </section>

      {/* --- Step 1-3: where -------------------------------------- */}
      <section className="browse-scope" aria-labelledby="scope-heading">
        <h2 id="scope-heading" className="browse-scope__heading">
          Where are you looking?
        </h2>

        <LocationPicker value={selection} onChange={setSelection} />

        {college && (
          <p className="browse-scope__resolved">
            Showing items at <strong>{college.short_name}</strong> —{' '}
            {college.area_name}, {college.city_name}, {college.state}
          </p>
        )}
      </section>

      {/* --- Steps 6-7: search and filter within that scope --------
          Placed BELOW the picker deliberately: it reads as "narrow
          what you just chose", which is the order the flow asks for.
          A search box above the location would invite searching the
          whole site and then wondering why the campus dropdown did
          nothing. */}
      <div className="toolbar" aria-label="Search and filters">
        <input
          type="search"
          className="toolbar__search"
          placeholder={`Search items at ${scopeLabel}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search items"
        />

        <select
          className="toolbar__select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          className="toolbar__select"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          aria-label="Filter by condition"
        >
          <option value="">Any condition</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {hasFilters && (
          <button type="button" className="toolbar__clear" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* aria-live tells a screen reader to announce this line when it
          changes, so a blind user hears "Showing 6 items" once the
          data arrives rather than being left in silence. */}
      <div className="home__count" aria-live="polite">
        {status === 'loading' && 'Loading items…'}
        {status === 'ready' &&
          `Showing ${items.length} item${items.length === 1 ? '' : 's'}` +
            (college ? ` at ${college.short_name}` : '')}
        {status === 'error' && 'Could not load items'}
      </div>

      {status === 'loading' && <LoadingSpinner size="lg" label="Loading items" />}

      {status === 'error' && (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Could not load items"
          /* error.message is safe to display: errorHandler.js on the
             backend guarantees that unexpected errors are reduced to
             a generic string, so a database password can never reach
             this line. */
          message={error?.message}
          action={{ label: 'Try again', onClick: retry }}
        />
      )}

      {/* Three different empty states, because they need three
          different things from the user. Collapsing them into one
          "No items found" would leave someone staring at a campus
          with nothing listed, wondering whether their search was
          wrong. */}
      {status === 'ready' && items.length === 0 && hasFilters && (
        <EmptyState
          icon="🔍"
          title="Nothing matched"
          message={
            college
              ? `No items at ${college.short_name} match what you are looking for. Try clearing the filters, or pick a different college.`
              : 'No items match what you are looking for. Try clearing the filters.'
          }
          action={{ label: 'Clear filters', onClick: clearFilters }}
        />
      )}

      {status === 'ready' && items.length === 0 && !hasFilters && college && (
        <EmptyState
          icon="🌱"
          title={`Nothing listed at ${college.short_name} yet`}
          message="This campus is in the directory but nobody has posted here so far. If you have something to pass on, you would be the first."
        />
      )}

      {status === 'ready' && items.length === 0 && !hasFilters && !college && (
        <EmptyState
          icon="📦"
          title="No items listed yet"
          message="Nothing has been shared so far. Once someone lists an item it will appear here."
        />
      )}

      {status === 'ready' && items.length > 0 && (
        /* `key` lets React match each card to its data across
           re-renders. Always a stable id, never the array index --
           with an index, changing the filter would make React reuse
           the wrong DOM node for every card, and ItemImage's memory
           of which URL failed would follow the position instead of
           the item. */
        <div className="item-grid">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

export default Home
