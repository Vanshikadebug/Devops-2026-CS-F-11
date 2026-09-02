/**
 * ==============================================================================
 * HOME PAGE VIEW (MANIA E-COMMERCE THEME)
 * ==============================================================================
 * 
 * @file Home.jsx
 * @description The primary landing page for the application. Acts as an 
 * orchestrator that manages URL query parameters, handles API data fetching, 
 * and composes several complex UI sections (Hero, Categories, Listings).
 * 
 * ARCHITECTURAL NOTES:
 * - Uses URLSearchParams as the single source of truth for application state,
 *   allowing users to share links with active filters.
 * - Implements an AbortController in the useEffect hook to prevent race 
 *   conditions when users click filters rapidly.
 * - Refactored to use modular render functions for improved readability and 
 *   maintainability, separating the heavy JSX blocks from the business logic.
 * ==============================================================================
 */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useConfig } from '../app/ConfigProvider';
import { api } from '../lib/api';
import ItemCard from '../components/ItemCard';
import ItemImage from '../components/ItemImage';
import {
  ArrowButton, Pill, IconButton, BentoGrid, BentoCard,
  StatBubble, AvatarCluster, Spinner, EmptyState,
} from '../components/ui';
import './Home.css';

/**
 * @typedef {Object} Item
 * @property {string|number} id - Unique item ID.
 * @property {string} name - Title of the item.
 * @property {string} status - Current availability status.
 * @property {string} owner_name - Name of the user who listed the item.
 */

/**
 * Home Page Component
 * 
 * @returns {React.JSX.Element} The rendered home page orchestrator.
 */
export default function Home() {
  // --- 1. Global Context & Routing ---
  const { setting, categories, cities, social } = useConfig();
  const [params, setParams] = useSearchParams();

  // --- 2. Local State Management ---
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Controlled input for the search bar, initialized from URL
  const [term, setTerm] = useState(params.get('search') || '');

  // --- 3. Derived State ---
  const activeCategory = params.get('category') || '';
  const activeCity = params.get('city') || '';
  const limit = Number(setting('featured_limit', 8)) || 8;
  const heroImage = setting('hero_image_url');
  const featured = items[0];

  // --- 4. Side Effects & Data Fetching ---
  
  /**
   * Primary Data Fetching Effect
   * 
   * Triggers whenever URL parameters (category, city, search) or the limit changes.
   * Utilizes an AbortController to cancel stale requests if the user changes 
   * filters faster than the network can respond.
   */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    // Construct the API query string dynamically
    const query = new URLSearchParams({ 
      limit: String(limit), 
      status: 'Available' 
    });
    
    if (activeCategory) query.set('category', activeCategory);
    if (activeCity) query.set('city', activeCity);
    if (params.get('search')) query.set('search', params.get('search'));

    // Execute the network request
    api.get(`/items?${query}`, { signal: controller.signal })
      .then((res) => {
        setItems(res.data);
        setTotal(res.pagination?.total ?? res.count);
        setError(null);
      })
      .catch((err) => {
        // Ignore AbortErrors as they are intentional cancellations
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load items.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    // Cleanup function: aborts the request on component unmount or re-render
    return () => controller.abort();
  }, [activeCategory, activeCity, params, limit]);

  // --- 5. Event Handlers ---

  /**
   * Updates a specific URL parameter without losing the others.
   * 
   * @param {string} key - The parameter key (e.g., 'category').
   * @param {string} value - The new value, or empty string to delete.
   */
  function handleParamChange(key, value) {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setParams(next, { replace: true });
  }

  /**
   * Handles the submission of the global search widget.
   * 
   * @param {string} searchQuery - The raw user input.
   */
  function handleSearchSubmit(searchQuery) {
    const cleanedQuery = searchQuery.trim();
    handleParamChange('search', cleanedQuery);
  }

  // --- 6. Render Helpers ---
  // Breaking the UI into smaller render functions drastically increases 
  // readability and allows for easier unit testing later.

  const renderHeroBanner = () => (
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
          <img src={heroImage} alt="Platform showcase" className="hero__img" />
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
            <a 
              key={s.id} 
              href={s.url} 
              target="_blank" 
              rel="noreferrer noopener"
              aria-label={s.platform} 
              title={s.platform} 
              className="hero__socialdot"
            >
              {s.platform.charAt(0)}
            </a>
          ))}
        </div>
      )}
    </BentoCard>
  );

  const renderCategoryPicker = () => (
    <BentoCard span={1}>
      <div className="row row--between">
        <h3>Categories</h3>
        {activeCategory && (
          <button 
            type="button" 
            className="home__clear" 
            onClick={() => handleParamChange('category', '')}
          >
            Clear
          </button>
        )}
      </div>

      <div className="home__cats">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.label;
          return (
            <button
              key={cat.id}
              type="button"
              className={`home__cat ${isActive ? 'is-active' : ''}`}
              onClick={() => handleParamChange('category', isActive ? '' : cat.label)}
              title={cat.label}
            >
              <span className={`home__catglyph itemimg--${cat.tint}`} aria-hidden="true">
                {cat.glyph || '📦'}
              </span>
              <span className="home__catlabel">{cat.label}</span>
            </button>
          );
        })}
      </div>
    </BentoCard>
  );

  const renderCityPicker = () => (
    <BentoCard span={1}>
      <h3>Near you</h3>
      <p className="muted home__nearsub">Pick a location to filter.</p>

      <div className="home__cities">
        {cities.map((city) => {
          const isActive = String(activeCity) === String(city.id);
          return (
            <button
              key={city.id}
              type="button"
              className={`home__city ${isActive ? 'is-active' : ''}`}
              onClick={() => handleParamChange('city', isActive ? '' : String(city.id))}
            >
              <span>{city.name}</span>
              <span className="muted">{city.college_count}</span>
            </button>
          );
        })}
      </div>
    </BentoCard>
  );

  const renderListingsGrid = () => (
    <section className="home__list">
      <div className="row row--between home__listhead">
        <div>
          <h2>{activeCategory || 'Latest listings'}</h2>
          <p className="muted">
            {loading ? 'Loading catalog…' : `${total} item${total === 1 ? '' : 's'} available`}
          </p>
        </div>
        <IconButton to="/items" tone="ink" label="See all listings" size="lg">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
            <path 
              d="M4 12L12 4M12 4H6M12 4v6" 
              stroke="currentColor" 
              strokeWidth="1.8"
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
        </IconButton>
      </div>

      {/* Error Boundary */}
      {error && (
        <div className="alert alert--error" role="alert">
          <strong>Error: </strong>{error}
        </div>
      )}

      {/* Loading & Empty States */}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing to show" glyph="🔍">
          {setting('empty_state_text', 'No items found matching your current filters.')}
        </EmptyState>
      ) : (
        /* Render the actual ItemCards */
        <div className="item-grid">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );

  // --- 7. Main Component Return ---
  return (
    <div className="home">
      <div className="shell">
        
        {/* Top Grid: Hero & Navigation */}
        <BentoGrid className="home__hero">
          {renderHeroBanner()}
          {renderCategoryPicker()}
          {renderCityPicker()}
        </BentoGrid>

        {/* Middle Grid: Stats & Search (Mania Styling Applied) */}
        <BentoGrid className="home__strip">
          
          <BentoCard span={1} className="strip__stat">
            <StatBubble value={total} label="items listed" />
            <div>
              <strong>Live right now</strong>
              <p className="muted">Available in the catalog.</p>
            </div>
          </BentoCard>

          <BentoCard span={1} className="strip__people">
            <AvatarCluster names={items.map((i) => i.owner_name).filter(Boolean)} />
            <div>
              <strong>Active Members</strong>
              <p className="muted">Real people in your area.</p>
            </div>
          </BentoCard>

          {/* Replaced soft SearchPill with raw Mania-style inputs */}
          <BentoCard span={2} className="strip__search">
            <div>
              <strong>Looking for something specific?</strong>
              <p className="muted">Search every listing by name or description.</p>
            </div>
            
            <div className="mania-search-widget">
              <input 
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit(term)}
                placeholder="Try searching for textbooks or electronics..."
                className="mania-search-input"
              />
              <button 
                type="button" 
                onClick={() => handleSearchSubmit(term)}
                className="mania-search-btn"
              >
                Search
              </button>
            </div>
          </BentoCard>

        </BentoGrid>

        {/* Bottom Section: Product Grid */}
        {renderListingsGrid()}

      </div>
    </div>
  );
}