import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ItemImage from '../components/ItemImage'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import Modal from '../components/Modal'
import { itemService } from '../lib/itemService'
import { ITEM_STATUSES, STATUS_VARIANTS } from '../lib/display'
import './MyItems.css'

function MyItems() {
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const [pendingDelete, setPendingDelete] = useState(null)

  const [filter, setFilter] = useState('')

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

  const visible = useMemo(
    () => (filter ? items.filter((item) => item.status === filter) : items),
    [items, filter],
  )

  const counts = useMemo(() => {
    const result = { Available: 0, Reserved: 0, Unavailable: 0 }
    for (const item of items) {
      if (result[item.status] !== undefined) result[item.status] += 1
    }
    return result
  }, [items])

  async function changeStatus(item, next) {
    // The select fires onChange even when the value did not change in
    // some browsers' autofill paths. A no-op write is still a write.
    if (next === item.status) return

    setBusyId(item.id)
    setActionError(null)

    try {
      const updated = await itemService.updateStatus(item.id, next)

      setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
    } catch (err) {
      setActionError(
        err.status === 404
          ? 'That item no longer exists. Refresh to see your current listings.'
          : err.status === 403
            ? 'You can only change items you listed yourself.'
            : err.message,
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

      setItems((prev) => prev.filter((row) => row.id !== item.id))
      setPendingDelete(null)
    } catch (err) {
      setPendingDelete(null)
      setActionError(
        err.status === 404
          ? 'That item had already been deleted.'
          : err.status === 403
            ? 'You can only delete items you listed yourself.'
            : err.message,
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container page my-items">
      <header className="my-items__header">
        <div>
          <h1 className="my-items__title">Your listings</h1>
          <p className="my-items__subtitle">
            Everything you have shared, and the controls to keep it current.
          </p>
        </div>

        <Link to="/items/new">
          <Button>+ Add an item</Button>
        </Link>
      </header>

      <div className="my-items__status" aria-live="polite">
        {status === 'loading' && 'Loading your listings…'}
        {status === 'error' && 'Could not load your listings'}
        {status === 'ready' &&
          `${items.length} item${items.length === 1 ? '' : 's'} listed`}
      </div>

      {actionError && (
        <div className="my-items__alert" role="alert">
          {actionError}
        </div>
      )}

      {status === 'loading' && <LoadingSpinner size="lg" label="Loading your listings" />}

      {status === 'error' && (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Could not load your listings"
          message={error?.message}
          action={{ label: 'Try again', onClick: retry }}
        />
      )}

      {/* The first-visit screen. Every new account sees this, so it
          explains what the page is for rather than reporting a void. */}
      {status === 'ready' && items.length === 0 && (
        <EmptyState
          icon="🌱"
          title="You have not listed anything yet"
          message="List something you no longer need — a textbook, a chair, an old calculator — and someone nearby can put it to use."
          action={{ label: 'Add your first item', onClick: () => navigate('/items/new') }}
        />
      )}

      {status === 'ready' && items.length > 0 && (
        <>
          {/* Tabs, not a dropdown: there are exactly four options and
              the counts are the useful part -- seeing "Reserved 2"
              without clicking is what tells you whether the tab is
              worth opening. */}
          <div className="my-items__tabs" role="tablist" aria-label="Filter by availability">
            <button
              type="button"
              role="tab"
              aria-selected={filter === ''}
              className={`my-items__tab ${filter === '' ? 'my-items__tab--active' : ''}`}
              onClick={() => setFilter('')}
            >
              All {items.length}
            </button>
            {ITEM_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={filter === s}
                className={`my-items__tab ${filter === s ? 'my-items__tab--active' : ''}`}
                onClick={() => setFilter(s)}
              >
                {s} {counts[s]}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={`Nothing marked ${filter}`}
              message="Your other listings are still here — switch back to All to see them."
              action={{ label: 'Show all listings', onClick: () => setFilter('') }}
            />
          ) : (
            <ul className="my-items__list">
              {visible.map((item) => {
                const busy = busyId === item.id
                const variant = STATUS_VARIANTS[item.status] ?? 'neutral'

                return (
                  <li key={item.id} className="my-item">
                    <Link
                      to={`/items/${item.id}`}
                      className="my-item__media"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <ItemImage item={item} />
                    </Link>

                    <div className="my-item__body">
                      <div className="my-item__head">
                        <h2 className="my-item__title">
                          <Link to={`/items/${item.id}`}>{item.name}</Link>
                        </h2>
                        <span className={`badge badge--${variant}`}>{item.status}</span>
                      </div>

                      <p className="my-item__meta">
                        {item.category} · {item.condition} ·{' '}
                        {/* The college when there is one, the typed
                            address when there is not -- the same rule
                            as ItemCard and ItemDetail. */}
                        {item.college_name ?? item.location}
                      </p>

                      <p className="my-item__desc">{item.description}</p>
                    </div>

                    <div className="my-item__actions">
                      <label className="sr-only" htmlFor={`status-${item.id}`}>
                        Availability of {item.name}
                      </label>
                      <select
                        id={`status-${item.id}`}
                        className="my-item__status-select"
                        value={item.status}
                        disabled={busy}
                        onChange={(e) => changeStatus(item, e.target.value)}
                      >
                        {ITEM_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>

                      <Link to={`/items/${item.id}/edit`}>
                        <Button variant="secondary" size="sm" disabled={busy}>
                          Edit
                        </Button>
                      </Link>

                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() => setPendingDelete(item)}
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

      {/* --- Delete confirmation ---------------------------------
          A modal rather than window.confirm(), because the native
          dialog cannot explain what ELSE this removes. Deleting an
          item cascades to requests.item_id, so other students'
          pending requests are deleted by a statement that never names
          their table. That has to be visible before the click. */}
      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => !busyId && setPendingDelete(null)}
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
          <strong>{pendingDelete?.name}</strong> will be removed from ReuseHub,
          along with any requests other students have made for it. This cannot be
          undone.
        </p>
        <p className="my-items__modal-hint">
          If you have already given it away, marking it{' '}
          <strong>Unavailable</strong> keeps the listing visible to the people
          who asked for it.
        </p>
      </Modal>
    </div>
  )
}

export default MyItems
