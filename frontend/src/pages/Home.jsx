import ItemCard from '../components/ItemCard'
import { MOCK_ITEMS } from '../utils/mockItems'
import './Home.css'

/**
 * Home -- the public browse page and the app's landing screen.
 *
 * PHASE 2 SCOPE
 * Static layout only, rendered from MOCK_ITEMS. There is no fetch
 * call yet because there is no backend yet. Phase 5 swaps the mock
 * import for a real API call; Phase 9 adds working search and
 * filters. Building the layout first means we can see and fix the
 * responsive grid before any network complexity is involved.
 *
 * The search box and filter dropdowns below are intentionally
 * non-functional and marked `disabled`, so the UI never lies to the
 * user about what works.
 */
function Home() {
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

      {/* Placeholder toolbar -- made real in Phase 9. */}
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

      <div className="home__count">
        Showing {MOCK_ITEMS.length} items
        <span className="home__mock-note">sample data — live in Phase 5</span>
      </div>

      {/* The grid. `key` lets React track each card across re-renders;
          without it, React re-creates DOM nodes unnecessarily and can
          mix up component state. Always use a stable id, never the
          array index. */}
      <div className="item-grid">
        {MOCK_ITEMS.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

export default Home
