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

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

const STATUS_RANK = {
  Pending: 0,
  Accepted: 1,
  Rejected: 2,
}

function itemFor(req) {
  return {
    name: req.item_name,
    image_url: req.item_image_url,
    category: req.item_category,
  }
}

function getStatusVariant(status) {
  return STATUS_VARIANTS[status] ?? 'neutral'
}

function getActionError(err) {
  switch (err.status) {
    case 404:
      return 'That request no longer exists. Refresh to see the current list.'

    case 422:
      return 'That request has already been decided, or the item is no longer available.'

    case 403:
      return 'You can only decide requests on items you listed yourself.'

    default:
      return err.message || 'Something went wrong. Please try again.'
  }
}

/* ------------------------------------------------------------------
   Request media
   ------------------------------------------------------------------ */

function RequestMedia({ req }) {
  return (
    <Link
      to={`/items/${req.item_id}`}
      className="request__media"
      tabIndex={-1}
      aria-hidden="true"
    >
      <ItemImage item={itemFor(req)} />
    </Link>
  )
}

/* ------------------------------------------------------------------
   Status / contact content
   ------------------------------------------------------------------ */

function RequestStatusContent({ req, type }) {
  if (req.message) {
    return (
      <p className="request__message">
        “{req.message}”
      </p>
    )
  }

  return null
}

function RequestContact({ req, type }) {
  if (req.status !== 'Accepted') return null

  const isReceived = type === 'received'
  const name = isReceived ? req.requester_name : req.owner_name
  const email = isReceived ? req.requester_email : req.owner_email
  const mobile = isReceived ? req.requester_mobile : req.owner_mobile

  return (
    <p className="request__contact">
      {isReceived ? 'Arrange collection with' : 'Accepted — contact'}{' '}
      {name}:{' '}
      <a href={`mailto:${email}`}>{email}</a>
      {mobile ? ` · ${mobile}` : ''}
    </p>
  )
}

function RequestNote({ req, type }) {
  if (req.status === 'Pending' && type === 'sent') {
    return (
      <p className="request__note">
        Waiting for {req.owner_name} to respond.
      </p>
    )
  }

  if (req.status === 'Rejected' && type === 'received') {
    return (
      <p className="request__note">
        You declined this request.
      </p>
    )
  }

  if (req.status === 'Rejected' && type === 'sent') {
    return (
      <p className="request__note">
        This request was declined. If the item is available again, you can{' '}
        <Link to={`/items/${req.item_id}`}>ask once more</Link>.
      </p>
    )
  }

  return null
}

/* ------------------------------------------------------------------
   Request card
   ------------------------------------------------------------------ */

function RequestCard({
  req,
  type,
  busy,
  onAccept,
  onDecline,
}) {
  const variant = getStatusVariant(req.status)
  const isReceived = type === 'received'
  const personName = isReceived
    ? req.requester_name
    : req.owner_name

  return (
    <li className="request">
      <RequestMedia req={req} />

      <div className="request__body">
        <div className="request__head">
          <h2 className="request__title">
            <Link to={`/items/${req.item_id}`}>
              {req.item_name}
            </Link>
          </h2>

          <span className={`badge badge--${variant}`}>
            {req.status}
          </span>
        </div>

        <p className="request__meta">
          <strong>
            {isReceived ? personName : 'Listed by ' + personName}
          </strong>

          {isReceived && ' asked'}

          {' · '}
          {req.created_at?.slice(0, 10)}
        </p>

        <RequestStatusContent req={req} type={type} />

        <RequestContact req={req} type={type} />

        <RequestNote req={req} type={type} />
      </div>

      {isReceived && req.status === 'Pending' && (
        <div className="request__actions">
          <Button
            size="sm"
            loading={busy}
            onClick={() => onAccept(req)}
          >
            Accept
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onDecline(req)}
          >
            Decline
          </Button>
        </div>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------
   Requests page
   ------------------------------------------------------------------ */

function Requests() {
  const navigate = useNavigate()

  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])

  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState('received')

  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [pendingDecision, setPendingDecision] = useState(null)

  /* --------------------------------------------------------------
     Load requests
     -------------------------------------------------------------- */

  const loadRequests = useCallback(async (signal) => {
    const [recv, snt] = await Promise.all([
      requestService.getReceived({ signal }),
      requestService.getSent({}, { signal }),
    ])

    setReceived(recv)
    setSent(snt)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function fetchRequests() {
      setStatus('loading')
      setError(null)

      try {
        await loadRequests(controller.signal)
        setStatus('ready')
      } catch (err) {
        if (err.name === 'AbortError') return

        setError(err)
        setStatus('error')
      }
    }

    fetchRequests()

    return () => controller.abort()
  }, [attempt, loadRequests])

  /* --------------------------------------------------------------
     Derived data
     -------------------------------------------------------------- */

  const receivedSorted = useMemo(
    () =>
      [...received].sort(
        (a, b) =>
          (STATUS_RANK[a.status] ?? 9) -
          (STATUS_RANK[b.status] ?? 9),
      ),
    [received],
  )

  const pendingCount = useMemo(
    () =>
      received.reduce(
        (count, req) =>
          count + (req.status === 'Pending' ? 1 : 0),
        0,
      ),
    [received],
  )

  /* --------------------------------------------------------------
     Request decision
     -------------------------------------------------------------- */

  const decide = useCallback(async (req, action) => {
    setBusyId(req.id)
    setActionError(null)

    try {
      await requestService.updateStatus(req.id, action)

      // Refresh because accepting can change multiple requests.
      const rows = await requestService.getReceived()
      setReceived(rows)

      setPendingDecision(null)
    } catch (err) {
      setPendingDecision(null)
      setActionError(getActionError(err))
    } finally {
      setBusyId(null)
    }
  }, [])

  const confirmDecision = useCallback(
    (req, action) => {
      setPendingDecision({ req, action })
    },
    [],
  )

  const retry = useCallback(() => {
    setAttempt((value) => value + 1)
  }, [])

  /* --------------------------------------------------------------
     Render helpers
     -------------------------------------------------------------- */

  const renderRequests = (requests, type) => {
    if (requests.length === 0) {
      if (type === 'received') {
        return (
          <EmptyState
            icon="📨"
            title="No requests yet"
            message="When someone asks for one of your items, it will show up here for you to accept or decline."
          />
        )
      }

      return (
        <EmptyState
          icon="📤"
          title="You have not requested anything yet"
          message="Find something on the browse page and ask the owner if you can collect it. Your requests will appear here."
          action={{
            label: 'Browse items',
            onClick: () => navigate('/'),
          }}
        />
      )
    }

    return (
      <ul className="requests__list">
        {requests.map((req) => (
          <RequestCard
            key={req.id}
            req={req}
            type={type}
            busy={busyId === req.id}
            onAccept={(request) =>
              confirmDecision(request, 'Accepted')
            }
            onDecline={(request) =>
              confirmDecision(request, 'Rejected')
            }
          />
        ))}
      </ul>
    )
  }

  /* --------------------------------------------------------------
     Page
     -------------------------------------------------------------- */

  return (
    <div className="container page requests">
      <header className="requests__header">
        <h1 className="requests__title">
          Requests
        </h1>

        <p className="requests__subtitle">
          Requests other students made on your items, and the ones
          you have sent. Contact details are shared only after a
          request is accepted.
        </p>
      </header>

      <div
        className="requests__status"
        aria-live="polite"
      >
        {status === 'loading' && 'Loading your requests…'}

        {status === 'error' &&
          'Could not load your requests'}

        {status === 'ready' &&
          `${received.length} received · ${sent.length} sent`}
      </div>

      {actionError && (
        <div
          className="requests__alert"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {status === 'loading' && (
        <LoadingSpinner
          size="lg"
          label="Loading your requests"
        />
      )}

      {status === 'error' && (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Could not load your requests"
          message={error?.message}
          action={{
            label: 'Try again',
            onClick: retry,
          }}
        />
      )}

      {status === 'ready' && (
        <>
          {/* Tabs */}
          <div
            className="requests__tabs"
            role="tablist"
            aria-label="Which requests to show"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'received'}
              className={`requests__tab ${
                tab === 'received'
                  ? 'requests__tab--active'
                  : ''
              }`}
              onClick={() => setTab('received')}
            >
              Received {received.length}

              {pendingCount > 0 && (
                <span
                  className="requests__tab-badge"
                  aria-label={`${pendingCount} awaiting your decision`}
                >
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === 'sent'}
              className={`requests__tab ${
                tab === 'sent'
                  ? 'requests__tab--active'
                  : ''
              }`}
              onClick={() => setTab('sent')}
            >
              Sent {sent.length}
            </button>
          </div>

          {/* Request list */}
          {tab === 'received'
            ? renderRequests(receivedSorted, 'received')
            : renderRequests(sent, 'sent')}
        </>
      )}

      {/* Confirmation modal */}
      <Modal
        open={Boolean(pendingDecision)}
        onClose={() =>
          !busyId && setPendingDecision(null)
        }
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
              variant={
                pendingDecision?.action === 'Accepted'
                  ? 'primary'
                  : 'danger'
              }
              loading={Boolean(busyId)}
              onClick={() =>
                pendingDecision &&
                decide(
                  pendingDecision.req,
                  pendingDecision.action,
                )
              }
            >
              {pendingDecision?.action === 'Accepted'
                ? 'Accept request'
                : 'Decline request'}
            </Button>
          </>
        }
      >
        {pendingDecision?.action === 'Accepted' ? (
          <>
            <p>
              You are accepting{' '}
              <strong>
                {pendingDecision.req.requester_name}
              </strong>
              ’s request for{' '}
              <strong>
                {pendingDecision.req.item_name}
              </strong>
              .
            </p>

            <p className="requests__modal-hint">
              This reserves the item and declines any other
              pending requests for it. Your email and mobile
              are shared with{' '}
              {pendingDecision.req.requester_name} so you can
              arrange the handover.
            </p>
          </>
        ) : (
          <>
            <p>
              You are declining{' '}
              <strong>
                {pendingDecision.req.requester_name}
              </strong>
              ’s request for{' '}
              <strong>
                {pendingDecision.req.item_name}
              </strong>
              .
            </p>

            <p className="requests__modal-hint">
              The item stays available for your other
              requests. They can ask again later if it is
              still free.
            </p>
          </>
        )}
      </Modal>
    </div>
  )
}

export default Requests