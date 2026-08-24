import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ItemImage from '../components/ItemImage'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import Modal from '../components/Modal'
import { requestService } from '../services/requestService'
import { STATUS_VARIANTS } from '../utils/constants'
import './Requests.css'

/**
 * Requests -- the two-sided view of every claim in the app.
 *
 * WHAT IS THIS PAGE?
 * A request has two people. This page is the same rows read from both
 * ends:
 *
 *   RECEIVED -- requests other students made on YOUR items. This is
 *   the only place the owner can actually act: accept one, decline
 *   another. It is the working half of the page.
 *
 *   SENT -- requests YOU made on other people's items. Read-only from
 *   here; the decision belongs to the owner. You come to this tab to
 *   see where you stand, and -- once someone accepts -- to read the
 *   contact details for arranging the handover.
 *
 * >>> WHY TWO ENDPOINTS AND NOT ONE "MY REQUESTS" LIST <<<
 * /sent and /received are the same table filtered by which column
 * holds your id: requester_id for sent, the item's user_id for
 * received. Merging them client-side would mean downloading rows you
 * are on both ends of and de-duplicating, for a page that reads more
 * clearly as two tabs anyway. The server already draws the line; the
 * page keeps it.
 *
 * =================================================================
 * WHY A DECISION RE-READS THE WHOLE RECEIVED LIST
 * =================================================================
 * Accepting is not a one-row edit. The transaction behind it (see
 * requestModel.accept) marks THIS request Accepted, flips every OTHER
 * pending request for the same item to Rejected, and reserves the
 * item. One click, several rows changed -- and the PATCH response can
 * only hand back the single row it was asked about.
 *
 * So rather than patch that one row and let the siblings sit on screen
 * still saying "Pending" -- a state the database no longer holds -- the
 * page re-reads /received after any decision. It is the same rule
 * MyItems follows for a status change (show the server's answer, not
 * the value we hoped for); it just matters more here, because here one
 * write moves rows the response never mentions.
 *
 * Rejecting touches only its own row, so it does not strictly need the
 * re-read -- but routing both decisions through the same refresh keeps
 * the code honest about which one has side effects, instead of relying
 * on the reader to remember that accept is the special one.
 */
function Requests() {
  const navigate = useNavigate()

  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const [tab, setTab] = useState('received')

  /* The id of the request whose decision is in flight, or null. A
     single value, not a boolean, so accepting one row disables only
     that row's buttons -- a page-wide flag would freeze every other
     Accept/Decline while one request saves. */
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  /* The pending accept/reject awaiting confirmation, held as
     { req, action }. Accepting reserves your item and declines everyone
     else who asked; declining turns a real person down. Both are worth
     a sentence of explanation before the click, the same way MyItems
     confirms a delete rather than firing it on the first press. */
  const [pendingDecision, setPendingDecision] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    setStatus('loading')
    setError(null)

    /* Both lists in parallel: they are independent reads and the page
       shows both tabs, so waiting for one before starting the other
       would only make the slower of the two the whole page's wait. If
       either fails the page is in an error state anyway -- the usual
       cause is an expired token, which fails both. */
    Promise.all([
      requestService.getReceived({ signal: controller.signal }),
      requestService.getSent({}, { signal: controller.signal }),
    ])
      .then(([recv, snt]) => {
        setReceived(recv)
        setSent(snt)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err)
        setStatus('error')
      })

    return () => controller.abort()
  }, [attempt])

  /* Pending first, so the rows that actually need a decision float to
     the top instead of scrolling away under a pile of settled ones.
     Array.prototype.sort is stable, so within each group the server's
     newest-first order survives untouched. */
  const receivedSorted = useMemo(() => {
    const rank = { Pending: 0, Accepted: 1, Rejected: 2 }
    return [...received].sort(
      (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9),
    )
  }, [received])

  const pendingCount = useMemo(
    () => received.filter((r) => r.status === 'Pending').length,
    [received],
  )

  async function decide(req, action) {
    setBusyId(req.id)
    setActionError(null)

    try {
      await requestService.updateStatus(req.id, action)

      /* Re-read the whole received list rather than trust the single
         row we got back -- see the note at the top on why accept moves
         siblings the response never names. */
      const rows = await requestService.getReceived()
      setReceived(rows)
      setPendingDecision(null)
    } catch (err) {
      setPendingDecision(null)
      setActionError(
        err.status === 404
          ? 'That request no longer exists. Refresh to see the current list.'
          : err.status === 422
            ? 'That request has already been decided, or the item is no longer available.'
            : err.status === 403
              ? 'You can only decide requests on items you listed yourself.'
              : err.message,
      )
    } finally {
      setBusyId(null)
    }
  }

  /* Request rows carry item_name / item_image_url / item_category as
     flat columns, but ItemImage wants an item-shaped object. Rather
     than teach the component a second shape, we hand it the three
     fields it reads under the names it expects. */
  function itemFor(req) {
    return {
      name: req.item_name,
      image_url: req.item_image_url,
      category: req.item_category,
    }
  }

  return (
    <div className="container page requests">
      <header className="requests__header">
        <h1 className="requests__title">Requests</h1>
        <p className="requests__subtitle">
          Requests other students made on your items, and the ones you have
          sent. Contact details are shared only after a request is accepted.
        </p>
      </header>

      <div className="requests__status" aria-live="polite">
        {status === 'loading' && 'Loading your requests…'}
        {status === 'error' && 'Could not load your requests'}
        {status === 'ready' &&
          `${received.length} received · ${sent.length} sent`}
      </div>

      {actionError && (
        <div className="requests__alert" role="alert">
          {actionError}
        </div>
      )}

      {status === 'loading' && (
        <LoadingSpinner size="lg" label="Loading your requests" />
      )}

      {status === 'error' && (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Could not load your requests"
          message={error?.message}
          action={{ label: 'Try again', onClick: retry }}
        />
      )}

      {status === 'ready' && (
        <>
          {/* Two tabs, not two stacked sections: the two lists answer
              different questions ("what do I need to act on?" vs "where
              do my asks stand?") and are rarely read at the same time.
              The pending badge on Received is the one number worth
              seeing without clicking. */}
          <div className="requests__tabs" role="tablist" aria-label="Which requests to show">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'received'}
              className={`requests__tab ${tab === 'received' ? 'requests__tab--active' : ''}`}
              onClick={() => setTab('received')}
            >
              Received {received.length}
              {pendingCount > 0 && (
                <span className="requests__tab-badge" aria-label={`${pendingCount} awaiting your decision`}>
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'sent'}
              className={`requests__tab ${tab === 'sent' ? 'requests__tab--active' : ''}`}
              onClick={() => setTab('sent')}
            >
              Sent {sent.length}
            </button>
          </div>

          {/* ---------------- RECEIVED ---------------- */}
          {tab === 'received' && (
            receivedSorted.length === 0 ? (
              <EmptyState
                icon="📨"
                title="No requests yet"
                message="When someone asks for one of your items, it will show up here for you to accept or decline."
              />
            ) : (
              <ul className="requests__list">
                {receivedSorted.map((req) => {
                  const busy = busyId === req.id
                  const variant = STATUS_VARIANTS[req.status] ?? 'neutral'

                  return (
                    <li key={req.id} className="request">
                      <Link
                        to={`/items/${req.item_id}`}
                        className="request__media"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <ItemImage item={itemFor(req)} />
                      </Link>

                      <div className="request__body">
                        <div className="request__head">
                          <h2 className="request__title">
                            <Link to={`/items/${req.item_id}`}>{req.item_name}</Link>
                          </h2>
                          <span className={`badge badge--${variant}`}>{req.status}</span>
                        </div>

                        <p className="request__meta">
                          <strong>{req.requester_name}</strong> asked
                          {' · '}
                          {req.created_at?.slice(0, 10)}
                        </p>

                        {req.message && (
                          <p className="request__message">“{req.message}”</p>
                        )}

                        {/* Contact appears only on an accepted request,
                            and only because the server put it there --
                            shapeRequest strips email and mobile from
                            every other status. This is the payoff of
                            accepting: the two of you can now arrange the
                            handover. */}
                        {req.status === 'Accepted' && (
                          <p className="request__contact">
                            Arrange collection with {req.requester_name}:{' '}
                            <a href={`mailto:${req.requester_email}`}>{req.requester_email}</a>
                            {req.requester_mobile ? ` · ${req.requester_mobile}` : ''}
                          </p>
                        )}

                        {req.status === 'Rejected' && (
                          <p className="request__note">You declined this request.</p>
                        )}
                      </div>

                      {/* Actions exist only while the request is still
                          Pending -- a decided request has nothing left
                          to do, so rendering greyed-out buttons on it
                          would just be dead controls. */}
                      {req.status === 'Pending' && (
                        <div className="request__actions">
                          <Button
                            size="sm"
                            loading={busy}
                            onClick={() => setPendingDecision({ req, action: 'Accepted' })}
                          >
                            Accept
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => setPendingDecision({ req, action: 'Rejected' })}
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          )}

          {/* ---------------- SENT ---------------- */}
          {tab === 'sent' && (
            sent.length === 0 ? (
              <EmptyState
                icon="📤"
                title="You have not requested anything yet"
                message="Find something on the browse page and ask the owner if you can collect it. Your requests will appear here."
                action={{ label: 'Browse items', onClick: () => navigate('/') }}
              />
            ) : (
              <ul className="requests__list">
                {sent.map((req) => {
                  const variant = STATUS_VARIANTS[req.status] ?? 'neutral'

                  return (
                    <li key={req.id} className="request">
                      <Link
                        to={`/items/${req.item_id}`}
                        className="request__media"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <ItemImage item={itemFor(req)} />
                      </Link>

                      <div className="request__body">
                        <div className="request__head">
                          <h2 className="request__title">
                            <Link to={`/items/${req.item_id}`}>{req.item_name}</Link>
                          </h2>
                          <span className={`badge badge--${variant}`}>{req.status}</span>
                        </div>

                        <p className="request__meta">
                          Listed by <strong>{req.owner_name}</strong>
                          {' · '}
                          {req.created_at?.slice(0, 10)}
                        </p>

                        {req.message && (
                          <p className="request__message">“{req.message}”</p>
                        )}

                        {req.status === 'Pending' && (
                          <p className="request__note">
                            Waiting for {req.owner_name} to respond.
                          </p>
                        )}

                        {req.status === 'Accepted' && (
                          <p className="request__contact">
                            Accepted — contact {req.owner_name}:{' '}
                            <a href={`mailto:${req.owner_email}`}>{req.owner_email}</a>
                            {req.owner_mobile ? ` · ${req.owner_mobile}` : ''}
                          </p>
                        )}

                        {/* The decline is not the end of the road: the
                            re-request policy (bug fix in requestModel.reopen)
                            lets you ask again from the item page if it is
                            free once more. We point there rather than
                            offering the button here, because re-requesting
                            starts from looking at the item again. */}
                        {req.status === 'Rejected' && (
                          <p className="request__note">
                            This request was declined. If the item is available
                            again, you can{' '}
                            <Link to={`/items/${req.item_id}`}>ask once more</Link>.
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
          )}
        </>
      )}

      {/* --- Accept / decline confirmation --------------------------
          One modal for both decisions, with copy that changes to match.
          Accept spells out the two side effects the button hides --
          the item is reserved, and everyone else who asked is declined
          -- because those are exactly the consequences a one-word
          button cannot carry. */}
      <Modal
        open={Boolean(pendingDecision)}
        onClose={() => !busyId && setPendingDecision(null)}
        title={
          pendingDecision?.action === 'Accepted'
            ? 'Accept this request?'
            : 'Decline this request?'
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setPendingDecision(null)}
              disabled={Boolean(busyId)}
            >
              Cancel
            </Button>
            <Button
              variant={pendingDecision?.action === 'Accepted' ? 'primary' : 'danger'}
              loading={Boolean(busyId)}
              onClick={() => pendingDecision && decide(pendingDecision.req, pendingDecision.action)}
            >
              {pendingDecision?.action === 'Accepted' ? 'Accept request' : 'Decline request'}
            </Button>
          </>
        }
      >
        {pendingDecision?.action === 'Accepted' ? (
          <>
            <p>
              You are accepting <strong>{pendingDecision?.req.requester_name}</strong>
              ’s request for <strong>{pendingDecision?.req.item_name}</strong>.
            </p>
            <p className="requests__modal-hint">
              This reserves the item and declines any other pending requests
              for it. Your email and mobile are shared with{' '}
              {pendingDecision?.req.requester_name} so you can arrange the
              handover.
            </p>
          </>
        ) : (
          <>
            <p>
              You are declining <strong>{pendingDecision?.req.requester_name}</strong>
              ’s request for <strong>{pendingDecision?.req.item_name}</strong>.
            </p>
            <p className="requests__modal-hint">
              The item stays available for your other requests. They can ask
              again later if it is still free.
            </p>
          </>
        )}
      </Modal>
    </div>
  )
}

export default Requests
