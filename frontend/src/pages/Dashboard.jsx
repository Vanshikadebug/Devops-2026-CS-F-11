import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ItemCard from '../components/ItemCard'
import CampusCard from '../components/CampusCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { CountUp, RankedBars } from '../components/Charts'
import { useAuth } from '../app/authContext'
import { dashboardService } from '../lib/dashboardService'
import './Dashboard.css'
import { usePageTitle } from '../hooks/usePageTitle'

function Dashboard() {
  usePageTitle('Dashboard')
  // The context user: available immediately, used for the greeting so
  // the page is not anonymous while the request is in flight.
  const { user: sessionUser } = useAuth()

  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()

    setStatus('loading')
    setError(null)

    dashboardService
      .get({ signal: controller.signal })
      .then((payload) => {
        setData(payload)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err)
        setStatus('error')
      })

    return () => controller.abort()
  }, [attempt])

  const displayName = data?.user?.name ?? sessionUser?.name ?? ''
  const firstName = displayName.split(' ')[0]

  const stats = data?.stats
  const recentItems = data?.recentItems ?? []

  const itemBars = stats ? [
    { label: 'Available', count: stats.items.available },
    { label: 'Reserved', count: stats.items.reserved },
    { label: 'Given away', count: stats.items.unavailable },
  ] : []

  const requestBars = stats ? [
    { label: 'Received', count: stats.requestsReceived.total },
    { label: 'Awaiting you', count: stats.requestsReceived.pending },
    { label: 'Sent', count: stats.requestsSent.total },
    { label: 'Accepted for you', count: stats.requestsSent.accepted },
  ] : []

  return (
    <div className="udash shell">
      <header className="udash__head">
        <p className="label">Dashboard</p>
        <h1 className="udash__title">
          {firstName ? <>Hello, {firstName}.</> : 'Your dashboard.'}
          <span>Everything you listed, and everyone waiting on you.</span>
        </h1>
        <div className="udash__actions">
          {status === 'ready' && (
            <button type="button" className="label ulink udash__refresh" onClick={retry}>
              ↻ Refresh
            </button>
          )}
          <Link to="/items/new" className="btn btn--primary">List an item +</Link>
        </div>
      </header>

      {/* aria-live: a screen reader announces the change when the
          numbers arrive, instead of leaving a blind user in silence
          wondering whether the page is still loading. */}
      <div className="udash__status" aria-live="polite">
        {status === 'loading' && 'Loading your dashboard…'}
        {status === 'error' && 'Could not load your dashboard'}
      </div>

      {status === 'loading' && <LoadingSpinner size="lg" label="Loading your dashboard" />}

      {status === 'error' && (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Could not load your dashboard"
          /* Safe to render: errorHandler.js reduces unexpected server
             errors to a generic sentence, so no internal detail can
             reach this line. */
          message={error?.message}
          action={{ label: 'Try again', onClick: retry }}
        />
      )}

      {status === 'ready' && stats && (
        <>
          {/* --- The numbers ---------------------------------------- */}
          <section className="udash__figures" aria-label="At a glance">
            <Link to="/my-items" className="udash__hero" data-cursor="Your items">
              <span className="label">Items listed</span>
              <CountUp className="udash__heronum" value={stats.items.total} />
            </Link>
            <dl className="udash__stats">
              <Figure label="Available" value={stats.items.available} />
              <Figure label="Reserved" value={stats.items.reserved} />
              <Figure label="Given away" value={stats.items.unavailable} />
              <Figure
                label="Awaiting your reply"
                value={stats.requestsReceived.pending}
                alert={stats.requestsReceived.pending > 0}
                to="/requests"
              />
              <Figure label="Requests sent" value={stats.requestsSent.total} to="/requests" />
              <Figure label="Accepted for you" value={stats.requestsSent.accepted} />
            </dl>
          </section>

          <section className="udash__charts" aria-label="Activity">
            <figure className="udash__chart">
              <figcaption className="udash__caption">Your listings by status</figcaption>
              <RankedBars data={itemBars} total={stats.items.total} />
            </figure>
            <figure className="udash__chart">
              <figcaption className="udash__caption">Requests</figcaption>
              <RankedBars data={requestBars} total={Math.max(1, stats.requestsReceived.total + stats.requestsSent.total)} />
            </figure>
          </section>

          {/* --- Account + campus ------------------------------------
              Account details come from data.user, which the server
              built from the token. The campus card is fed from the
              CONTEXT user: applyUser refreshes it the moment a campus
              is saved, while data.user is a snapshot from before the
              write. The `??` covers the instant before AuthProvider
              restores a session on a hard refresh. */}
          <section className="udash__account" aria-labelledby="account-heading">
            <div>
              <h2 id="account-heading" className="udash__caption">Your account</h2>
              <dl className="udash__facts">
                <div><dt>Name</dt><dd>{data.user.name}</dd></div>
                <div><dt>Email</dt><dd>{data.user.email}</dd></div>
                <div><dt>Mobile</dt><dd>{data.user.mobile}</dd></div>
                {/* Only the date part of 'YYYY-MM-DD HH:MM:SS', so no
                    timezone conversion can shift it to the wrong day. */}
                <div><dt>Member since</dt><dd>{data.user.created_at?.slice(0, 10)}</dd></div>
              </dl>
            </div>
            <CampusCard user={sessionUser ?? data.user} />
          </section>

          {/* --- Recent listings ------------------------------------ */}
          <section className="udash__recent" aria-labelledby="recent-heading">
            <div className="udash__recenthead">
              <h2 id="recent-heading" className="udash__caption">Your recent listings</h2>
              {recentItems.length > 0 && (
                <Link to="/my-items" className="label ulink">See all {stats.items.total} →</Link>
              )}
            </div>

            {recentItems.length === 0 ? (
              /* The first-visit screen. Every new account sees this,
                 so it explains the app rather than reporting a void. */
              <EmptyState
                icon="🌱"
                title="You have not listed anything yet"
                message="List something you no longer need — a textbook, a chair, an old calculator — and someone nearby can put it to use."
                action={{ label: 'Add your first item', onClick: () => navigate('/items/new') }}
              />
            ) : (
              <div className="item-grid">
                {recentItems.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** One stat in the figures row; links when there is somewhere to go. */
function Figure({ label, value, alert = false, to }) {
  const body = (
    <>
      <dt>
        {alert && <i className="udash__alert" aria-label="needs attention" />}
        {label}
      </dt>
      <dd><CountUp value={value} /></dd>
    </>
  )
  return to
    ? <div className="udash__stat"><Link to={to} className="udash__statlink">{body}</Link></div>
    : <div className="udash__stat">{body}</div>
}

export default Dashboard