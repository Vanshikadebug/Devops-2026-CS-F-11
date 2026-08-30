import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ItemImage from '../components/ItemImage'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import Modal from '../components/Modal'
import { itemService } from '../services/itemService'
import { ITEM_STATUSES, STATUS_VARIANTS } from '../utils/constants'
import './MyItems.css'

function MyItems() {
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setAttempt((current) => current + 1)
  }, [])

  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [filter, setFilter] = useState('')

  /*
   * Load the current user's listings.
   * Abort the request if the component unmounts.
   */
  useEffect(() => {
    const controller = new AbortController()

    setStatus('loading')
    setError(null)

    itemService
      .getMine({}, { signal: controller.signal })
      .then((data) => {
        setItems(data)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return

        setError(err)
        setStatus('error')
      })

    return () => controller.abort()
  }, [attempt])

  /*
   * Filtering happens locally because this endpoint only contains
   * the current user's listings.
   */
  const visibleItems = useMemo(() => {
    if (!filter) return items

    return items.filter((item) => item.status === filter)
  }, [items, filter])

  /*
   * Calculate all status counts in one pass.
   */
  const counts = useMemo(() => {
    const result = Object.fromEntries(
      ITEM_STATUSES.map((status) => [status, 0])
    )

    items.forEach((item) => {
      if (result[item.status] !== undefined) {
        result[item.status] += 1
      }
    })

    return result
  }, [items])

  async function changeStatus(item, nextStatus) {
    if (nextStatus === item.status) return

    setBusyId(item.id)
    setActionError(null)

    try {
      const updatedItem = await itemService.updateStatus(
        item.id,
        nextStatus
      )

      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === updatedItem.id
            ? updatedItem
            : currentItem
        )
      )
    } catch (err) {
      setActionError(
        err.status === 404
          ? 'That item no longer exists. Refresh to see your current listings.'
          : err.status === 403
            ? 'You can only change items you listed yourself.'
            : err.message
      )
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    const item = pendingDelete

    if (!item) return

    setBusyId(item.id)
    setActionError(null)

    try {
      await itemService.remove(item.id)

      setItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id)
      )

      setPendingDelete(null)
    } catch (err) {
      setPendingDelete(null)

      setActionError(
        err.status === 404
          ? 'That item had already been deleted.'
          : err.status === 403
            ? 'You can only delete items you listed yourself.'
            : err.message
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container page my-items">
      {/* Header */}
      <header className="my-items__header">
        <div className="my-items__heading">
          <span className="my-items__eyebrow">Manage listings</span>

          <h1 className="my-items__title">
            Your listings
          </h1>

          <p className="my-items__subtitle">
            Everything you have shared, and the controls to keep it current.
          </p>
        </div>

        <Link to="/items/new" className="my-items__add-link">
          <Button>
            + Add an item
          </Button>
        </Link>
      </header>

      {/* Page status */}
      <div className="my-items__status" aria-live="polite">
        {status === 'loading' && 'Loading your listings…'}

        {status === 'error' && 'Could not load your listings'}

        {status === 'ready' &&
          `${items.length} item${items.length === 1 ? '' : 's'} listed`}
      </div>

      {/* Action error */}
      {actionError && (
        <div className="my-items__alert" role="alert">
          <span className="my-items__alert-icon">!</span>
          <span>{actionError}</span>
        </div>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <div className="my-items__loading">
          <LoadingSpinner
            size="lg"
            label="Loading your listings"
          />
        </div>
      )}

      {/* Loading error */}
      {status === 'error' && (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Could not load your listings"
          message={error?.message}
          action={{
            label: 'Try again',
            onClick: retry,
          }}
        />
      )}

      {/* No listings */}
      {status === 'ready' && items.length === 0 && (
        <EmptyState
          icon="🌱"
          title="You have not listed anything yet"
          message="List something you no longer need — a textbook, a chair, an old calculator — and someone nearby can put it to use."
          action={{
            label: 'Add your first item',
            onClick: () => navigate('/items/new'),
          }}
        />
      )}

      {/* Listings */}
      {status === 'ready' && items.length > 0 && (
        <>
          <div
            className="my-items__tabs"
            role="tablist"
            aria-label="Filter by availability"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filter === ''}
              className={`my-items__tab ${
                filter === '' ? 'my-items__tab--active' : ''
              }`}
              onClick={() => setFilter('')}
            >
              <span>All</span>
              <span className="my-items__tab-count">
                {items.length}
              </span>
            </button>

            {ITEM_STATUSES.map((itemStatus) => (
              <button
                key={itemStatus}
                type="button"
                role="tab"
                aria-selected={filter === itemStatus}
                className={`my-items__tab ${
                  filter === itemStatus
                    ? 'my-items__tab--active'
                    : ''
                }`}
                onClick={() => setFilter(itemStatus)}
              >
                <span>{itemStatus}</span>
                <span className="my-items__tab-count">
                  {counts[itemStatus]}
                </span>
              </button>
            ))}
          </div>

          {visibleItems.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={`Nothing marked ${filter}`}
              message="Your other listings are still here — switch back to All to see them."
              action={{
                label: 'Show all listings',
                onClick: () => setFilter(''),
              }}
            />
          ) : (
            <ul className="my-items__list">
              {visibleItems.map((item) => {
                const busy = busyId === item.id
                const variant =
                  STATUS_VARIANTS[item.status] ?? 'neutral'

                return (
                  <li
                    key={item.id}
                    className={`my-item ${
                      busy ? 'my-item--busy' : ''
                    }`}
                  >
                    {/* Image */}
                    <Link
                      to={`/items/${item.id}`}
                      className="my-item__media"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <ItemImage item={item} />
                    </Link>

                    {/* Information */}
                    <div className="my-item__body">
                      <div className="my-item__head">
                        <h2 className="my-item__title">
                          <Link to={`/items/${item.id}`}>
                            {item.name}
                          </Link>
                        </h2>

                        <span
                          className={`badge badge--${variant}`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <p className="my-item__meta">
                        <span>{item.category}</span>
                        <span className="my-item__separator">•</span>
                        <span>{item.condition}</span>
                        <span className="my-item__separator">•</span>
                        <span>
                          {item.college_name ?? item.location}
                        </span>
                      </p>

                      <p className="my-item__desc">
                        {item.description}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="my-item__actions">
                      <label
                        className="sr-only"
                        htmlFor={`status-${item.id}`}
                      >
                        Availability of {item.name}
                      </label>

                      <select
                        id={`status-${item.id}`}
                        className="my-item__status-select"
                        value={item.status}
                        disabled={busy}
                        onChange={(event) =>
                          changeStatus(
                            item,
                            event.target.value
                          )
                        }
                      >
                        {ITEM_STATUSES.map((itemStatus) => (
                          <option
                            key={itemStatus}
                            value={itemStatus}
                          >
                            {itemStatus}
                          </option>
                        ))}
                      </select>

                      <Link
                        to={`/items/${item.id}/edit`}
                        className="my-item__edit-link"
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                        >
                          Edit
                        </Button>
                      </Link>

                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          setPendingDelete(item)
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {/* Delete confirmation */}
      <Modal
        open={Boolean(pendingDelete)}
        onClose={() =>
          !busyId && setPendingDelete(null)
        }
        title="Delete this listing?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={Boolean(busyId)}
            >
              Keep it
            </Button>

            <Button
              variant="danger"
              loading={Boolean(busyId)}
              onClick={confirmDelete}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p>
          <strong>{pendingDelete?.name}</strong> will be
          removed from ReuseHub, along with any requests
          other students have made for it. This cannot be
          undone.
        </p>

        <p className="my-items__modal-hint">
          If you have already given it away, marking it{' '}
          <strong>Unavailable</strong> keeps the listing
          visible to the people who asked for it.
        </p>
      </Modal>
    </div>
  )
}

export default MyItems