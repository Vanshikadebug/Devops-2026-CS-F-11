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

/**
 * MyItems -- everything you have listed, and the controls to manage it.
 *
 * WHAT IS THIS PAGE?
 * The owner's view of their own listings: one row per item, with edit,
 * delete and a status control on each. It is where an item's life
 * actually gets managed, so it is deliberately a dense list rather
 * than the browse grid -- you are scanning your own things to find
 * one, not window-shopping.
 *
 * >>> WHY IT USES /api/items/mine AND NOT /api/items?user=N <<<
 * There is no user parameter to pass. The server reads the owner from
 * the verified token, so this page CANNOT request someone else's
 * listings even by mistake -- there is nowhere in the request to say
 * whose items you want. A ?user= filter would put that decision in
 * the URL, and the day someone forgets to check it, the whole site is
 * readable user by user. See the note on getMyItems in
 * itemController.js.
 *
 * =================================================================
 * OPTIMISTIC vs SERVER-CONFIRMED UPDATES -- and why this page is the
 * second kind
 * =================================================================
 * When the status dropdown changes, this page could update the row
 * immediately and send the request in the background. That feels
 * instant, and it means the screen is asserting something the
 * database has not agreed to yet. If the write fails -- expired
 * token, item deleted in another tab, server down -- the row shows
 * "Reserved" while the database still says "Available", and nothing
 * on screen is wrong enough to notice.
 *
 * So the row is replaced with THE SERVER'S ANSWER, which is the item
 * as re-read after the write. The cost is a few hundred milliseconds
 * of a disabled control. The benefit is that this list can never
 * display a state the database does not hold.
 *
 * That trade is not universal -- a chat app that blocked on every
 * message would be unusable. It is right HERE because these writes
 * are rare, deliberate, and consequential.
 */
function MyItems() {
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  /* The id currently being written, or null. A single value rather
     than a boolean because only ONE row should be disabled while its
     own request is in flight -- a page-wide `busy` flag would freeze
     every row on the screen because one of them is saving. */
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  /* The item awaiting delete confirmation. Holding the ITEM and not
     just its id means the dialog can name it -- "Delete Casio
     FX-991EX?" is a question you can answer; "Delete this item?" over
     a list of nine is not. */
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

  /* Filtered in the browser, unlike Home's filters which go to SQL.
     The difference is the size of the set: this endpoint returns only
     YOUR items, which is tens at most, and they are all already
     downloaded. Sending a request to re-filter a list the browser is
     holding would add a round trip and a loading state for no gain.
     Home cannot do this because it filters a table that will outgrow
     one page. */
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

      /* Replace by id rather than by index. The array can be filtered
         and re-ordered between render and response, and an index
         captured earlier would then write the answer onto the wrong
         row -- one of those bugs that only appears when the list is
         long enough to scroll. */
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

      /* Removed from local state rather than refetching the list. The
         server has confirmed the row is gone, so a second request
         would only re-download the other nine rows to learn what we
         already know. */
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
