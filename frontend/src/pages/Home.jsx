import { useCallback, useEffect, useState } from 'react'
import ItemCard from '../components/ItemCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { itemService } from '../services/itemService'
import './Home.css'

/**
 * Home -- the public browse page, now reading from the real database.
 *
 * PHASE 5 CHANGE
 * Previously this file imported MOCK_ITEMS from a hard-coded array.
 * Now it calls itemService.getAll(), and the items you see are rows
 * from MySQL. The full path of one page load:
 *
 *   Home.jsx
 *     -> itemService.getAll()
 *     -> api.get('/items')            fetch('/api/items')
 *     -> Vite dev server proxy        localhost:5173 -> localhost:5000
 *     -> Express route  GET /api/items
 *     -> itemController.getItems
 *     -> itemModel.findAll()          SELECT ... JOIN users ...
 *     -> MySQL
 *     -> back up the same chain as JSON
 *     -> setItems(...) -> React re-renders -> ItemCard grid
 *
 * ItemCard, the CSS and the grid layout are all UNCHANGED. That is
 * the payoff from Phase 2 building the components against the real
 * API shape from the start: swapping fake data for live data touched
 * this one file.
 *
 * >>> THE FOUR STATES <<<
 * A component that fetches data must handle four situations, and the
 * common mistake is to write only the last one:
 *
 *   loading -- the request is in flight       -> spinner
 *   error   -- the request failed             -> message + Retry
 *   empty   -- it succeeded, with no rows     -> "nothing listed yet"
 *   ready   -- it succeeded, with rows        -> the grid
 *
 * A single `items` array cannot distinguish "still loading" from
 * "loaded, and there is nothing" -- both are []. So we track an
 * explicit status instead of guessing from the data.
 */
function Home() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  // Changing this number re-runs the effect below. It is how the
  // Retry button works: React re-runs an effect when a dependency
  // changes, so we change one on purpose.
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    /* ---------------------------------------------------------
       WHY AbortController?
       If the user navigates away while this request is still in
       flight, the component unmounts -- but the fetch keeps going,
       and its .then() eventually calls setItems() on a component
       that no longer exists. That is a memory leak, and in React 18
       it is also a warning nobody can find the source of.
       controller.abort() cancels the actual network request when
       the cleanup function runs.

       This is not hypothetical here: React's StrictMode (see
       main.jsx) deliberately mounts every component twice in
       development to expose exactly this class of bug. Without the
       cleanup you would see two requests in the Network tab for
       every page load.
    --------------------------------------------------------- */
    const controller = new AbortController()

    setStatus('loading')
    setError(null)

    itemService
      .getAll({ signal: controller.signal })
      .then((data) => {
        setItems(data)
        setStatus('ready')
      })
      .catch((err) => {
        // An abort is us cancelling on purpose, not a failure.
        // Showing an error for it would flash a scary message on
        // every navigation.
        if (err.name === 'AbortError') return

        setError(err)
        setStatus('error')
      })

    // React runs this when the component unmounts, and before every
    // re-run of the effect.
    return () => controller.abort()
  }, [attempt])

  return (
    <div className="container page">
      <section className="hero">
        <h1 className="hero__title">
          Give your things a <span className="hero__accent">second life</span>
        </h1>
        <p className="hero__subtitle">
          List what you no longer need. Find what someone else is ready to
          pass on. Less waste, more reuse.
        </p>
      </section>

      {/* Still disabled -- made real in Phase 9. The UI should never
          imply a control works before it does. */}
      <div className="toolbar" aria-label="Search and filters">
        <input
          type="search"
          className="toolbar__search"
          placeholder="Search items…  (working in Phase 9)"
          disabled
          aria-label="Search items"
        />
        <select className="toolbar__select" disabled aria-label="Filter by category">
          <option>All categories</option>
        </select>
        <select className="toolbar__select" disabled aria-label="Filter by condition">
          <option>Any condition</option>
        </select>
      </div>

      {/* aria-live tells a screen reader to announce this line when it
          changes, so a blind user hears "Showing 12 items" once the
          data arrives rather than being left in silence. */}
      <div className="home__count" aria-live="polite">
        {status === 'loading' && 'Loading items…'}
        {status === 'ready' && `Showing ${items.length} item${items.length === 1 ? '' : 's'}`}
        {status === 'error' && 'Could not load items'}
      </div>

      {status === 'loading' && <LoadingSpinner size="lg" label="Loading items" />}

      {status === 'error' && (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Could not load items"
          // error.message is safe to display: errorHandler.js on the
          // backend guarantees that unexpected errors are reduced to
          // a generic string, so a database password can never reach
          // this line.
          message={error?.message}
          action={{ label: 'Try again', onClick: retry }}
        />
      )}

      {status === 'ready' && items.length === 0 && (
        <EmptyState
          icon="📦"
          title="No items listed yet"
          message="Nothing has been shared so far. Once someone lists an item it will appear here."
        />
      )}

      {status === 'ready' && items.length > 0 && (
        /* `key` lets React match each card to its data across
           re-renders. Always a stable id, never the array index --
           with an index, deleting the first item makes React reuse
           the wrong DOM node for every card after it. */
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
