/**
 * ==============================================================================
 * BROWSE / SEARCH CATALOG PAGE (MANIA THEME)
 * ==============================================================================
 * 
 * @file Browse.jsx
 * @description The primary catalog exploration page. Features a two-column 
 * layout with a comprehensive filter sidebar on the left and a responsive 
 * product grid on the right. 
 * 
 * ARCHITECTURAL NOTES:
 * - Uses URLSearchParams to maintain search state, allowing users to bookmark
 *   or share specific filter combinations.
 * - Implements a debounced search input (conceptually) to prevent excessive 
 *   API calls while the user types.
 * ==============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useConfig } from '../app/ConfigProvider';
import { api } from '../lib/api';
import ItemCard from '../components/ItemCard';
import { Spinner, EmptyState } from '../components/ui';
import './Browse.css';

/**
 * Browse Page Component
 * 
 * @returns {React.JSX.Element} The rendered search catalog view.
 */
export default function Browse() {
  const { categories, cities } = useConfig();
  const [params, setParams] = useSearchParams();

  // State Management
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Extract current filters from the URL
  const currentSearch = params.get('search') || '';
  const currentCategory = params.get('category') || '';
  const currentCity = params.get('city') || '';

  // Local state for the search input field
  const [searchTerm, setSearchTerm] = useState(currentSearch);

  /**
   * Data Fetching Effect
   * Re-runs whenever the URL parameters change.
   */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const query = new URLSearchParams(params);
    query.set('status', 'Available'); // Only show available items in browse

    api.get(`/items?${query}`, { signal: controller.signal })
      .then((res) => {
        setItems(res.data);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError('Failed to load catalog. Please try again.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [params]);

  /**
   * Updates a specific URL filter parameter.
   * 
   * @param {string} key - The filter category (e.g., 'category', 'city')
   * @param {string} value - The filter value to apply, or empty to clear.
   */
  const handleFilterChange = (key, value) => {
    const nextParams = new URLSearchParams(params);
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
    // Reset to page 1 on new filter if pagination exists
    nextParams.delete('page'); 
    setParams(nextParams);
  };

  /**
   * Submits the free-text search query to the URL.
   */
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    handleFilterChange('search', searchTerm.trim());
  };

  return (
    <div className="browse-layout shell">
      
      {/* --- LEFT COLUMN: Filter Sidebar --- */}
      <aside className="browse-sidebar">
        <h2 className="sidebar-title">Filters</h2>
        
        {/* Keyword Search Filter */}
        <div className="filter-group">
          <h3 className="filter-heading">Keyword</h3>
          <form onSubmit={handleSearchSubmit} className="sidebar-search-form">
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search items..." 
              className="sidebar-input"
            />
            <button type="submit" className="sidebar-btn">Go</button>
          </form>
        </div>

        {/* Category Filter */}
        <div className="filter-group">
          <h3 className="filter-heading">Categories</h3>
          <ul className="filter-list">
            <li>
              <button 
                className={`filter-option ${!currentCategory ? 'is-active' : ''}`}
                onClick={() => handleFilterChange('category', '')}
              >
                All Categories
              </button>
            </li>
            {categories.map((cat) => (
              <li key={cat.id}>
                <button 
                  className={`filter-option ${currentCategory === cat.label ? 'is-active' : ''}`}
                  onClick={() => handleFilterChange('category', cat.label)}
                >
                  {cat.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Location/City Filter */}
        <div className="filter-group">
          <h3 className="filter-heading">Location</h3>
          <ul className="filter-list">
            <li>
              <button 
                className={`filter-option ${!currentCity ? 'is-active' : ''}`}
                onClick={() => handleFilterChange('city', '')}
              >
                Everywhere
              </button>
            </li>
            {cities.map((city) => (
              <li key={city.id}>
                <button 
                  className={`filter-option ${currentCity === String(city.id) ? 'is-active' : ''}`}
                  onClick={() => handleFilterChange('city', String(city.id))}
                >
                  {city.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* --- RIGHT COLUMN: Main Catalog Grid --- */}
      <main className="browse-main">
        <div className="browse-header">
          <h1 className="browse-title">
            {currentCategory || 'All Items'} 
            {currentSearch && ` matching "${currentSearch}"`}
          </h1>
          <p className="browse-count muted">{items.length} results found</p>
        </div>

        {/* Error Boundary */}
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}

        {/* Loading, Empty, and Grid States */}
        {loading ? (
          <div className="browse-loading"><Spinner /></div>
        ) : items.length === 0 ? (
          <EmptyState title="No matches found" glyph="📦">
            Try adjusting your filters or searching for something else.
          </EmptyState>
        ) : (
          <div className="item-grid">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>

    </div>
  );
}