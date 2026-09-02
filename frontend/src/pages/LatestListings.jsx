/**
 * ==============================================================================
 * LATEST LISTINGS GRID COMPONENT (MANIA THEME)
 * ==============================================================================
 * 
 * @file LatestListings.jsx
 * @description A dedicated section component that fetches and displays the 
 * newest available items on the platform. It handles its own asynchronous 
 * state, error boundaries, and loading fallbacks independently of the parent.
 * 
 * ARCHITECTURAL NOTES:
 * - Built as an autonomous widget: it can be dropped into ANY page (Home, 
 *   Dashboard, etc.) and it will manage its own data lifecycle.
 * - Utilizes an AbortController to gracefully cancel pending network requests 
 *   if the user navigates away before the fetch completes, preventing memory leaks.
 * ==============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useConfig } from '../app/ConfigProvider';
import { api } from '../lib/api';
import ItemCard from '../components/ItemCard';
import { IconButton, Spinner, EmptyState } from '../components/ui';

/**
 * @typedef {Object} PaginationMeta
 * @property {number} total - Total number of items matching the query.
 * @property {number} limit - Maximum number of items returned per page.
 */

/**
 * @typedef {Object} APIResponse
 * @property {Array<Object>} data - The array of item objects.
 * @property {PaginationMeta} [pagination] - Optional pagination metadata.
 * @property {number} [count] - Fallback count if pagination object is missing.
 */

/**
 * LatestListings Component
 * 
 * @returns {React.JSX.Element} The rendered recent products grid.
 */
export default function LatestListings() {
  const { setting } = useConfig();
  
  // Pull the maximum number of items to display from the global config, default to 8
  const limit = Number(setting('featured_limit', 8)) || 8;

  // --- Local State Management ---
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchLatestItems
   * 
   * Asynchronous function to pull the newest inventory from the backend.
   * Wrapped in useCallback so it can be safely used in useEffect and 
   * triggered manually by a user "refresh" action.
   * 
   * @param {AbortSignal} [signal] - Optional signal to cancel the network request.
   */
  const fetchLatestItems = useCallback(async (signal) => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ 
      limit: String(limit), 
      status: 'Available',
      sort: 'newest' // Assuming backend supports sorting by date added
    });

    try {
      const res = await api.get(`/items?${query}`, { signal });
      setItems(res.data || []);
      setTotal(res.pagination?.total ?? res.count ?? 0);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch latest listings:', err);
        setError(err.message || 'Unable to connect to the catalog.');
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [limit]);

  /**
   * Component Mount Effect
   * 
   * Triggers the initial data fetch when the component renders.
   */
  useEffect(() => {
    const controller = new AbortController();
    
    fetchLatestItems(controller.signal);

    // Cleanup function triggers the abort controller on unmount
    return () => controller.abort();
  }, [fetchLatestItems]);

  // --- Render Helpers ---

  /**
   * Renders the section header, including the title, item count, and 
   * a call-to-action to view the entire catalog.
   */
  const renderHeader = () => (
    <div className="row row--between home__listhead" style={{ alignItems: 'flex-end', marginBottom: 'var(--s6)' }}>
      <div>
        <h2 style={{ fontSize: '2rem', letterSpacing: '-0.02em', margin: 0 }}>
          Latest arrivals
        </h2>
        <p className="muted" style={{ marginTop: 'var(--s1)', fontWeight: '500' }}>
          {loading ? 'Refreshing catalog...' : `${total} items recently added`}
        </p>
      </div>
      
      <div style={{ display: 'flex', gap: 'var(--s3)' }}>
        {/* Manual Refresh Button (Great for high-traffic apps) */}
        <button 
          onClick={() => fetchLatestItems()} 
          className="btn-secondary"
          style={{ padding: '8px 16px', fontSize: '0.9rem', cursor: 'pointer' }}
          disabled={loading}
          aria-label="Refresh latest listings"
        >
          {loading ? '...' : 'Refresh'}
        </button>

        {/* View All Button */}
        <IconButton to="/items" tone="ink" label="See all listings" size="lg">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path 
              d="M4 12L12 4M12 4H6M12 4v6" 
              stroke="currentColor" 
              strokeWidth="2"
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
        </IconButton>
      </div>
    </div>
  );

  return (
    <section className="home__list">
      
      {/* 1. Header Block */}
      {renderHeader()}

      {/* 2. Error Boundary */}
      {error && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: 'var(--s5)' }}>
          <strong>Error loading items: </strong>{error}
        </div>
      )}

      {/* 3. Main Content Area (Loading, Empty, or Grid) */}
      {loading && items.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s10) 0' }}>
          <Spinner />
        </div>
      ) : items.length === 0 && !error ? (
        <EmptyState title="No items available" glyph="📦">
          {setting('empty_state_text', 'Be the first to list an item on campus!')}
        </EmptyState>
      ) : (
        <div className="item-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', 
          gap: 'var(--s5)' 
        }}>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
      
    </section>
  );
}