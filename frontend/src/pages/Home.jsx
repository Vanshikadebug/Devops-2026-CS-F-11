/**
 * ==============================================================================
 * REUSEHUB HOME PAGE
 * ==============================================================================
 *
 * Minimal community marketplace design.
 *
 * Backend-compatible features:
 * - Search
 * - Category filter
 * - City filter
 * - Available items
 * - Newest
 * - Oldest
 * - Name A-Z
 * - Pagination count
 *
 * No price functionality is used because the current backend Item model
 * does not contain a price field.
 * ==============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useConfig } from '../app/ConfigProvider'
import { api } from '../lib/api'

import ItemCard from '../components/ItemCard'
import ItemImage from '../components/ItemImage'

import './Home.css'


export default function Home() {

  /* ==========================================================================
     CONFIG
     ========================================================================== */

  const {
    setting,
    categories,
    cities,
  } = useConfig()


  /* ==========================================================================
     URL PARAMETERS
     ========================================================================== */

  const [params, setParams] = useSearchParams()


  const activeCategory =
    params.get('category') || ''


  const activeCity =
    params.get('city') || ''


  const activeSearch =
    params.get('search') || ''


  const activeSort =
    params.get('sort') || 'newest'


  /* ==========================================================================
     LOCAL STATE
     ========================================================================== */

  const [items, setItems] = useState([])

  const [total, setTotal] = useState(0)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState(null)

  const [searchText, setSearchText] =
    useState(activeSearch)


  /* ==========================================================================
     FEATURED ITEMS FOR HERO
     ========================================================================== */

  const heroItems = useMemo(() => {

    return items
      .filter((item) => item.image_url)
      .slice(0, 5)

  }, [items])


  /* ==========================================================================
     FILTER STATE
     ========================================================================== */

  const hasActiveFilters = useMemo(() => {

    return Boolean(
      activeCategory ||
      activeCity ||
      activeSearch
    )

  }, [
    activeCategory,
    activeCity,
    activeSearch,
  ])


  /* ==========================================================================
     LOAD ITEMS
     ========================================================================== */

  useEffect(() => {

    const controller =
      new AbortController()


    async function loadItems() {

      setLoading(true)

      try {

        const query =
          new URLSearchParams()


        /*
         * Number of items requested from backend.
         *
         * Keep this reasonably large so the homepage has
         * enough images for the hero section.
         */

        const limit =
          Number(
            setting(
              'featured_limit',
              12
            )
          ) || 12


        query.set(
          'limit',
          String(limit)
        )


        /*
         * Only show available marketplace items.
         */

        query.set(
          'status',
          'Available'
        )


        /*
         * SORT
         *
         * Backend supports:
         * newest
         * oldest
         * name
         */

        query.set(
          'sort',
          activeSort
        )


        /*
         * CATEGORY
         */

        if (activeCategory) {

          query.set(
            'category',
            activeCategory
          )

        }


        /*
         * CITY
         */

        if (activeCity) {

          query.set(
            'city',
            activeCity
          )

        }


        /*
         * SEARCH
         */

        if (activeSearch) {

          query.set(
            'search',
            activeSearch
          )

        }


        const response =
          await api.get(
            `/items?${query.toString()}`,
            {
              signal:
                controller.signal,
            }
          )


        setItems(
          Array.isArray(response.data)
            ? response.data
            : []
        )


        setTotal(
          response.pagination?.total ??
          response.count ??
          response.data?.length ??
          0
        )


        setError(null)

      } catch (err) {

        if (
          err.name !==
          'AbortError'
        ) {

          setError(
            err.message ||
            'Failed to load listings.'
          )

        }

      } finally {

        if (
          !controller.signal.aborted
        ) {

          setLoading(false)

        }

      }

    }


    loadItems()


    return () =>
      controller.abort()

  }, [
    activeCategory,
    activeCity,
    activeSearch,
    activeSort,
    setting,
  ])


  /* ==========================================================================
     URL PARAMETER HELPER
     ========================================================================== */

  function updateParam(
    key,
    value
  ) {

    const next =
      new URLSearchParams(
        params
      )


    if (value) {

      next.set(
        key,
        value
      )

    } else {

      next.delete(key)

    }


    setParams(
      next,
      {
        replace: true,
      }
    )

  }


  /* ==========================================================================
     SEARCH
     ========================================================================== */

  function handleSearch(
    event
  ) {

    event.preventDefault()


    updateParam(
      'search',
      searchText.trim()
    )

  }


  /* ==========================================================================
     CATEGORY
     ========================================================================== */

  function handleCategory(
    category
  ) {

    if (
      activeCategory ===
      category
    ) {

      updateParam(
        'category',
        ''
      )

    } else {

      updateParam(
        'category',
        category
      )

    }

  }


  /* ==========================================================================
     CITY
     ========================================================================== */

  function handleCity(
    cityId
  ) {

    const value =
      String(cityId)


    if (
      activeCity === value
    ) {

      updateParam(
        'city',
        ''
      )

    } else {

      updateParam(
        'city',
        value
      )

    }

  }


  /* ==========================================================================
     SORT
     ========================================================================== */

  function handleSort(
    value
  ) {

    updateParam(
      'sort',
      value
    )

  }


  /* ==========================================================================
     CLEAR FILTERS
     ========================================================================== */

  function clearFilters() {

    setSearchText('')

    setParams(
      {},
      {
        replace: true,
      }
    )

  }


  /* ==========================================================================
     RENDER
     ========================================================================== */

  return (

    <div className="home">


      {/* ======================================================================
          HERO
          ====================================================================== */}

      <section className="home__hero">


        {/* --------------------------------------------------------------------
            HERO TEXT
            -------------------------------------------------------------------- */}

        <div className="home__hero-content">


          <p className="home__eyebrow">
            {setting(
              'logo_glyph',
              '♻'
            )}{' '}
            ReuseHub Community
          </p>


          <h1>

            Buy &amp; Sell within

            <br />

            the ReuseHub

            <br />

            Community

          </h1>


          {/* SEARCH */}

          <form
            className="home__hero-search"
            onSubmit={
              handleSearch
            }
          >

            <input
              type="text"
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
              placeholder="Search Marketplace"
              aria-label="Search Marketplace"
            />


            <button
              type="submit"
              aria-label="Search"
            >

              <SearchIcon />

            </button>

          </form>


          {/* OR */}

          <div className="home__hero-or">

            <span>
              or
            </span>

          </div>


          {/* CREATE LISTING */}

          <Link
            to="/items/new"
            className="home__create-btn"
          >
            Create A Listing
          </Link>


        </div>


        {/* --------------------------------------------------------------------
            CIRCULAR PRODUCT ART
            -------------------------------------------------------------------- */}

        <div className="home__hero-art">


          {heroItems[0] && (

            <HeroCircle
              item={
                heroItems[0]
              }
              className="hero-circle--one"
            />

          )}


          {heroItems[1] && (

            <HeroCircle
              item={
                heroItems[1]
              }
              className="hero-circle--two"
            />

          )}


          {heroItems[2] && (

            <HeroCircle
              item={
                heroItems[2]
              }
              className="hero-circle--three"
            />

          )}


          {heroItems[3] && (

            <HeroCircle
              item={
                heroItems[3]
              }
              className="hero-circle--four"
            />

          )}


          {heroItems[4] && (

            <HeroCircle
              item={
                heroItems[4]
              }
              className="hero-circle--five"
            />

          )}


        </div>


      </section>


      {/* ======================================================================
          MARKETPLACE
          ====================================================================== */}

      <section className="home__market">


        {/* ====================================================================
            LEFT SIDEBAR
            ==================================================================== */}

        <aside className="home__sidebar">


          {/* ------------------------------------------------------------------
              SORT
              ------------------------------------------------------------------ */}

          <div className="filter-section">


            <h3>
              Sort
            </h3>


            {/* NEWEST */}

            <label
              className="radio-option"
            >

              <input
                type="radio"
                name="sort"
                value="newest"
                checked={
                  activeSort ===
                  'newest'
                }
                onChange={() =>
                  handleSort(
                    'newest'
                  )
                }
              />

              <span>
                Most Recent
              </span>

            </label>


            {/* OLDEST */}

            <label
              className="radio-option"
            >

              <input
                type="radio"
                name="sort"
                value="oldest"
                checked={
                  activeSort ===
                  'oldest'
                }
                onChange={() =>
                  handleSort(
                    'oldest'
                  )
                }
              />

              <span>
                Oldest
              </span>

            </label>


            {/* NAME */}

            <label
              className="radio-option"
            >

              <input
                type="radio"
                name="sort"
                value="name"
                checked={
                  activeSort ===
                  'name'
                }
                onChange={() =>
                  handleSort(
                    'name'
                  )
                }
              />

              <span>
                Name A-Z
              </span>

            </label>


          </div>


          {/* ------------------------------------------------------------------
              CATEGORY FILTER
              ------------------------------------------------------------------ */}

          <div className="filter-section">


            <div className="filter-heading-row">

              <h3>
                Filter
              </h3>


              {hasActiveFilters && (

                <button
                  type="button"
                  className="clear-filter"
                  onClick={
                    clearFilters
                  }
                >
                  Clear
                </button>

              )}

            </div>


            <div className="checkbox-list">


              {categories.map(
                (category) => {

                  const isActive =
                    activeCategory ===
                    category.label


                  return (

                    <label
                      className="checkbox-option"
                      key={
                        category.id
                      }
                    >

                      <input
                        type="checkbox"
                        checked={
                          isActive
                        }
                        onChange={() =>
                          handleCategory(
                            category.label
                          )
                        }
                      />


                      <span>
                        {category.label}
                      </span>

                    </label>

                  )

                }
              )}


            </div>


          </div>


          {/* ------------------------------------------------------------------
              LOCATION
              ------------------------------------------------------------------ */}

          {cities.length > 0 && (

            <div className="filter-section">


              <h3>
                Location
              </h3>


              <div className="checkbox-list">


                {cities.map(
                  (city) => {

                    const isActive =
                      activeCity ===
                      String(
                        city.id
                      )


                    return (

                      <label
                        className="checkbox-option"
                        key={
                          city.id
                        }
                      >

                        <input
                          type="checkbox"
                          checked={
                            isActive
                          }
                          onChange={() =>
                            handleCity(
                              city.id
                            )
                          }
                        />


                        <span>
                          {city.name}
                        </span>

                      </label>

                    )

                  }
                )}


              </div>


            </div>

          )}


        </aside>


        {/* ====================================================================
            LISTINGS
            ==================================================================== */}

        <main
          className="home__listings"
        >


          {/* ------------------------------------------------------------------
              LISTING HEADER
              ------------------------------------------------------------------ */}

          <div
            className="home__listings-header"
          >


            <div>

              <h2>

                {activeCategory ||
                  'Listings'}

              </h2>


              <p>

                {loading
                  ? 'Loading listings...'
                  : `${total} item${
                      total === 1
                        ? ''
                        : 's'
                    } available`}

              </p>

            </div>


            <Link
              to="/items"
              className="view-all"
            >
              View all →
            </Link>


          </div>


          {/* ------------------------------------------------------------------
              ERROR
              ------------------------------------------------------------------ */}

          {error && (

            <div
              className="home__error"
            >
              {error}
            </div>

          )}


          {/* ------------------------------------------------------------------
              LOADING
              ------------------------------------------------------------------ */}

          {loading ? (

            <div
              className="home__loading"
            >
              Loading listings...
            </div>


          ) : items.length === 0 ? (

            /* ---------------------------------------------------------------
               EMPTY
               --------------------------------------------------------------- */

            <div
              className="home__empty"
            >

              <div
                className="home__empty-icon"
              >
                ♻
              </div>


              <h3>
                No listings found
              </h3>


              <p>
                Try changing your
                filters or search
                for something else.
              </p>


              <button
                type="button"
                onClick={
                  clearFilters
                }
              >
                Clear filters
              </button>

            </div>


          ) : (

            /* ---------------------------------------------------------------
               GRID
               --------------------------------------------------------------- */

            <div
              className="home__grid"
            >

              {items.map(
                (item) => (

                  <ItemCard
                    key={item.id}
                    item={item}
                  />

                )
              )}

            </div>

          )}


        </main>


      </section>


    </div>

  )
}


/* =============================================================================
   HERO CIRCLE
   ============================================================================= */

function HeroCircle({
  item,
  className,
}) {

  return (

    <Link
      to={`/items/${item.id}`}
      className={`hero-circle ${className}`}
      aria-label={
        `View ${item.name}`
      }
    >

      <ItemImage
        item={item}
        ratio="1 / 1"
      />

    </Link>

  )

}


/* =============================================================================
   SEARCH ICON
   ============================================================================= */

function SearchIcon() {

  return (

    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      aria-hidden="true"
    >

      <circle
        cx="11"
        cy="11"
        r="6.5"
        stroke="currentColor"
        strokeWidth="2"
      />


      <path
        d="M16 16L21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

    </svg>

  )

}