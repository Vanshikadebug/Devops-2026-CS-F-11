import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ItemImage from '../components/ItemImage'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import Modal from '../components/Modal'
import { useAuth } from '../context/authContext'
import { itemService } from '../services/itemService'
import { requestService } from '../services/requestService'
import { STATUS_VARIANTS } from '../utils/constants'
import './ItemDetail.css'

/**
 * ItemDetail -- everything about one item.
 *
 * WHAT IS THIS PAGE?
 * The destination of every card in the app. It shows the full
 * description, the exact collection point, who listed it, and -- if
 * you are the person who listed it -- the controls to change it.
 *
 * >>> WHY THIS ROUTE IS PUBLIC WHEN THE OTHER ITEM PAGES ARE NOT <<<
 * A logged-out visitor can read this page. That is deliberate: the
 * whole point of a browsable catalogue is that someone can see what is
 * on offer BEFORE deciding to sign up. Requesting an item needs an
 * account (Phase 10); looking at one does not.
 *
 * =================================================================
 * THE OWNERSHIP CHECK ON THIS PAGE IS COSMETIC. ON PURPOSE.
 * =================================================================
 * `isOwner` below decides whether Edit and Delete are rendered. It is
 * a comparison of two numbers in a program running on the reader's own
 * computer, and anyone can change the answer with devtools in about
 * four seconds. It protects NOTHING.
 *
 * What protects the item is checkItemOwnership.js on the server, which
 * runs on a machine the reader does not control and answers 403 to
 * exactly the same request. This page hides the buttons because
 * showing someone a Delete button that always fails is bad design --
 * not because hiding them is a security measure.
 *
 * The rule worth carrying: the frontend decides what is WORTH
 * OFFERING; the backend decides what is ALLOWED. If the two ever
 * disagree, the backend is right.
 *
 * =================================================================
 * WHY `item.user_id` AND NOT A `mine` FLAG FROM THE SERVER
 * =================================================================
 * The API could return `isMine: true` and save this page a
 * comparison. It does not, because GET /api/items/:id is public and
 * has no user to compare against -- the answer would be null for every
 * anonymous reader and would have to be recomputed anyway. Comparing
 * here means the same public response serves everyone, and the page
 * layers its own session on top.
 */
function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()

  const [item, setItem] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  /* Owner-only actions. `working` covers both the status change and
     the delete, because neither should be clickable while the other
     is in flight. */
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [mineRequest, setMineRequest] = useState(null)
  const [mineReady, setMineReady] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')
  const [requestWorking, setRequestWorking] = useState(false)
  const [requestError, setRequestError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    setStatus('loading')
    setError(null)

    itemService
      .getById(id, { signal: controller.signal })
      .then((found) => {
        setItem(found)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err)
        setStatus('error')
      })

    return () => controller.abort()
  }, [id, attempt])

  useEffect(() => {
    if (!isAuthenticated || !item || !user || user.id === item.user_id) {
      setMineRequest(null)
      setMineReady(true)
      return
    }

    const controller = new AbortController()
    setMineReady(false)

    requestService
      .getSent({ item: item.id }, { signal: controller.signal })
      .then((rows) => {
        setMineRequest(rows[0] ?? null)
        setMineReady(true)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setMineRequest(null)
        setMineReady(true)
      })

    return () => controller.abort()
  }, [isAuthenticated, item, user])

  /* Both sides are numbers -- mysql2 returns INT UNSIGNED as a JS
     number, and the session user came from the same database. `===`
     rather than `==` so a future change that makes one a string fails
     visibly instead of quietly matching. */
  const isOwner = Boolean(user && item && user.id === item.user_id)

  async function changeStatus(next) {
    setWorking(true)
    setActionError(null)

    try {
      /* The response is the row as STORED, re-read by the server after
         the write. Using it rather than patching local state with the
         value we just sent means the screen cannot claim a change the
         database did not make. */
      const updated = await itemService.updateStatus(item.id, next)
      setItem(updated)
    } catch (err) {
      setActionError(
        err.status === 403
          ? 'You can only change items you listed yourself.'
          : err.message,
      )
    } finally {
      setWorking(false)
    }
  }

  async function handleDelete() {
    setWorking(true)
    setActionError(null)

    try {
      await itemService.remove(item.id)
      /* `replace: true` matters here specifically. Without it, the
         browser's Back button returns to the detail page of an item
         that no longer exists -- a 404 the user caused by deleting it,
         which reads as a bug. Replacing the history entry means Back
         goes to wherever they were before. */
      navigate('/my-items', { replace: true })
    } catch (err) {
      setConfirmOpen(false)
      setActionError(
        err.status === 403
          ? 'You can only delete items you listed yourself.'
          : err.status === 404
            ? 'This item has already been deleted.'
            : err.message,
      )
      setWorking(false)
    }
    /* No `finally` for setWorking: the success path navigates away and
       unmounts this component, so clearing it there would be a state
       update on nothing. The catch clears it because that is the only
       branch where the page survives. */
  }

  async function submitRequest() {
    setRequestWorking(true)
    setRequestError(null)

    try {
      const created = await requestService.create({
        itemId: item.id,
        message: requestMessage,
      })
      setMineRequest(created)
      setRequestOpen(false)
      setRequestMessage('')
    } catch (err) {
      setRequestError(err.message)
    } finally {
      setRequestWorking(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="container page">
        <LoadingSpinner size="lg" label="Loading item" />
      </div>
    )
  }

  if (status === 'error') {
    /* 404 gets its own wording. "Could not load this item" for
       something that was deliberately deleted sends the reader looking
       for a network problem that does not exist. */
    const missing = error?.status === 404

    return (
      <div className="container page">
        <EmptyState
          tone="error"
          icon={missing ? '🔍' : '⚠'}
          title={missing ? 'This item is no longer listed' : 'Could not load this item'}
          message={
            missing
              ? 'It may have been collected already, or removed by the person who listed it.'
              : error?.message
          }
          action={
            missing
              ? { label: 'Browse other items', onClick: () => navigate('/') }
              : { label: 'Try again', onClick: retry }
          }
        />
      </div>
    )
  }

  const statusVariant = STATUS_VARIANTS[item.status] ?? 'neutral'

  /* The college when there is one, the free text when there is not --
     the same rule as ItemCard, and for the same reason: `location`
     reads "Jagatpura, Jaipur" for four different campuses in that
     locality, which looks right and is not specific enough to
     actually go and collect something. */
  const place = item.college_name ?? item.location

  return (
    <div className="container page item-detail">
      {/* A real link, not a history.back() button: it has a fixed
          destination, so it works when someone arrives from a shared
          URL with no history to go back to. */}
      <Link to="/" className="item-detail__back">
        ← Back to browse
      </Link>

      <div className="item-detail__layout">
        <div className="item-detail__media">
          <ItemImage item={item} className="item-detail__image" />
        </div>

        <div className="item-detail__body">
          <div className="item-detail__heading">
            <span className="item-detail__category">{item.category}</span>
            <span className={`badge badge--${statusVariant}`}>{item.status}</span>
          </div>

          <h1 className="item-detail__title">{item.name}</h1>

          {/* Rendered as text, so a description containing <script> is
              PRINTED rather than executed -- React escapes everything
              it interpolates. This is why there is no sanitising step
              here: the only field that needed one is image_url, which
              is validated on the server because it lands in an
              attribute rather than in text. */}
          <p className="item-detail__description">{item.description}</p>

          <dl className="item-detail__facts">
            <div className="item-detail__fact">
              <dt>Condition</dt>
              <dd>{item.condition}</dd>
            </div>

            <div className="item-detail__fact">
              <dt>Collect from</dt>
              <dd>
                {place}
                {/* The area and city are shown only when the campus is
                    named above them, so the line reads "SKIT Jaipur --
                    Jagatpura, Jaipur" rather than repeating itself for
                    an off-campus item whose location IS the address. */}
                {item.college_name && (item.area_name || item.city_name) && (
                  <span className="item-detail__fact-detail">
                    {' '}— {[item.area_name, item.city_name].filter(Boolean).join(', ')}
                  </span>
                )}
              </dd>
            </div>

            <div className="item-detail__fact">
              <dt>Listed by</dt>
              {/* The NAME only. The owner's email and mobile are not in
                  this response at all -- itemModel selects u.name and
                  nothing else. Contact details are exchanged in Phase
                  10, and only after the owner accepts a request. */}
              <dd>{item.owner_name}</dd>
            </div>

            <div className="item-detail__fact">
              <dt>Listed on</dt>
              {/* Only the date part of 'YYYY-MM-DD HH:MM:SS', so no
                  timezone conversion can shift it to the wrong day. */}
              <dd>{item.created_at?.slice(0, 10)}</dd>
            </div>
          </dl>

          {actionError && (
            <div className="item-detail__alert" role="alert">
              {actionError}
            </div>
          )}

          {/* --- Owner controls -----------------------------------
              Hidden from everyone else because offering a button that
              always answers 403 is bad design. See the long note at
              the top for why hiding it is not the security measure. */}
          {isOwner && (
            <section className="item-detail__owner" aria-label="Manage this listing">
              <p className="item-detail__owner-note">You listed this item.</p>

              <div className="item-detail__actions">
                <Link to={`/items/${item.id}/edit`}>
                  <Button variant="secondary" disabled={working}>Edit</Button>
                </Link>

                {/* One button per status the item is NOT currently in.
                    Rendering all three and disabling the current one
                    would leave a dead control on screen; offering only
                    the moves that do something keeps the row honest
                    about what it can do. */}
                {item.status !== 'Available' && (
                  <Button
                    variant="secondary"
                    loading={working}
                    onClick={() => changeStatus('Available')}
                  >
                    Mark available
                  </Button>
                )}
                {item.status !== 'Reserved' && (
                  <Button
                    variant="secondary"
                    loading={working}
                    onClick={() => changeStatus('Reserved')}
                  >
                    Mark reserved
                  </Button>
                )}
                {item.status !== 'Unavailable' && (
                  <Button
                    variant="secondary"
                    loading={working}
                    onClick={() => changeStatus('Unavailable')}
                  >
                    Mark given away
                  </Button>
                )}

                <Button
                  variant="danger"
                  disabled={working}
                  onClick={() => setConfirmOpen(true)}
                >
                  Delete
                </Button>
              </div>
            </section>
          )}

          {/* --- Everyone else ------------------------------------
              Requesting is a write, so it needs an account. The
              button is hidden from the owner because requesting your
              own listing is 403 on the server anyway. */}
          {!isOwner && (
            <section className="item-detail__cta">
              {!isAuthenticated && (
                <p className="item-detail__cta-note">
                  <Link to="/login">Log in</Link> or{' '}
                  <Link to="/register">create an account</Link> to request this
                  item.
                </p>
              )}

              {isAuthenticated && !mineReady && (
                <LoadingSpinner label="Checking your request" />
              )}

              {isAuthenticated && mineReady && mineRequest && (
                <div className="item-detail__request-state">
                  <p className="item-detail__cta-note">
                    Your request is{' '}
                    <span className={`badge badge--${STATUS_VARIANTS[mineRequest.status] ?? 'neutral'}`}>
                      {mineRequest.status}
                    </span>
                  </p>
                  {mineRequest.message && (
                    <p className="item-detail__request-message">
                      “{mineRequest.message}”
                    </p>
                  )}
                  {mineRequest.status === 'Accepted' && (
                    <p className="item-detail__contact">
                      Contact {mineRequest.owner_name}:{' '}
                      <a href={`mailto:${mineRequest.owner_email}`}>{mineRequest.owner_email}</a>
                      {mineRequest.owner_mobile ? ` · ${mineRequest.owner_mobile}` : ''}
                    </p>
                  )}
                  {mineRequest.status === 'Rejected' && (
                    <p className="item-detail__cta-note">
                      The owner declined this request. You cannot request the
                      same listing again.
                    </p>
                  )}
                </div>
              )}

              {isAuthenticated && mineReady && !mineRequest && item.status === 'Available' && (
                <>
                  <p className="item-detail__cta-note">
                    Ask the owner if you can collect this. They will see your
                    name; contact details are shared only if they accept.
                  </p>
                  {requestError && (
                    <div className="item-detail__alert" role="alert">
                      {requestError}
                    </div>
                  )}
                  <div className="item-detail__actions">
                    <Button onClick={() => { setRequestError(null); setRequestOpen(true) }}>
                      Request this item
                    </Button>
                  </div>
                </>
              )}

              {isAuthenticated && mineReady && !mineRequest && item.status !== 'Available' && (
                <p className="item-detail__cta-note">
                  This listing is {item.status.toLowerCase()}, so it cannot be
                  requested right now.
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* --- Delete confirmation ---------------------------------
          A modal rather than window.confirm(): the native dialog
          cannot say what else is about to be deleted, and this
          deletion is not confined to the row the user is looking at.
          requests.item_id carries ON DELETE CASCADE, so every pending
          request for this item goes with it -- other people's data,
          removed by a statement that does not name their table. That
          consequence has to be visible before the click, not
          discovered afterwards. */}
      <Modal
        open={confirmOpen}
        onClose={() => !working && setConfirmOpen(false)}
        title="Delete this listing?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={working}
            >
              Keep it
            </Button>
            <Button variant="danger" loading={working} onClick={handleDelete}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p>
          <strong>{item.name}</strong> will be removed from ReuseHub, along with
          any requests other students have made for it. This cannot be undone.
        </p>
        <p className="item-detail__modal-hint">
          If you have already given it away, marking it{' '}
          <strong>given away</strong> keeps the listing visible to the people who
          asked for it.
        </p>
      </Modal>

      <Modal
        open={requestOpen}
        onClose={() => !requestWorking && setRequestOpen(false)}
        title="Request this item?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setRequestOpen(false)}
              disabled={requestWorking}
            >
              Cancel
            </Button>
            <Button loading={requestWorking} onClick={submitRequest}>
              Send request
            </Button>
          </>
        }
      >
        <p>
          {item.owner_name} will see that you asked for{' '}
          <strong>{item.name}</strong>. You can add a short note about when you
          can collect it.
        </p>
        <label className="item-detail__message-label" htmlFor="request-message">
          Message <span className="item-detail__optional">(optional)</span>
        </label>
        <textarea
          id="request-message"
          className="item-detail__message"
          rows={4}
          maxLength={500}
          value={requestMessage}
          onChange={(e) => setRequestMessage(e.target.value)}
          placeholder="Could I collect this on Saturday?"
          disabled={requestWorking}
        />
        {requestError && (
          <p className="item-detail__alert" role="alert">
            {requestError}
          </p>
        )}
      </Modal>
    </div>
  )
}

export default ItemDetail
