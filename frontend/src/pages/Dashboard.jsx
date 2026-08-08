import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ItemCard from '../components/ItemCard'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { useAuth } from '../context/authContext'
import { dashboardService } from '../services/dashboardService'
import './Dashboard.css'

/**
 * Dashboard -- the logged-in user's home base.
 *
 * WHAT THIS PAGE IS
 * The first screen after logging in: who you are, what you have
 * listed, who is waiting on you, and the fastest route to the next
 * thing you probably want to do.
 *
 * ONE REQUEST, NOT THREE.
 * Everything here comes from GET /api/dashboard. The page could
 * instead call /api/auth/me, a stats endpoint, and /api/items/mine --
 * but then three separate failures are possible, and a page that is
 * two-thirds loaded is a state nobody can describe to the user. One
 * request either succeeds or fails, so there is exactly one loading
 * state and one error state to design.
 *
 * >>> WHY THE PAGE STILL FETCHES, EVEN THOUGH useAuth() HAS user <<<
 * AuthProvider already holds the user object, so the greeting could
 * be rendered without any request at all. The stats cannot -- they
 * change whenever someone requests one of your items, and the token
 * knows nothing about that. So the page fetches, and uses the
 * context's `user` only as an instant placeholder for the name while
 * the numbers are still in flight. That is the difference between
 * IDENTITY (in the token, cheap) and STATE (in the database, must be
 * asked for).
 *
 * THE FOUR STATES, AGAIN
 * Same discipline as Home.jsx: loading, error, empty, ready. The
 * empty case matters more here than anywhere else in the app,
 * because every single user sees it on their first visit. A brand-new
 * account that lands on a screen of zeroes with no explanation is a
 * bad first impression; it should say what to do next.
 */
function Dashboard() {
  // The context user: available immediately, used for the greeting so
  // the page is not anonymous while the request is in flight.
  const { user: sessionUser } = useAuth()

  /* Used by the empty state's button. The obvious shortcut --
     window.location.href = '/items/new' -- LOOKS identical and is
     wrong: it makes the browser reload the entire application,
     throwing away React state and the whole point of a single-page
     app. navigate() swaps the route in place. */
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    // Cancels the request if the user navigates away mid-flight, and
    // silences StrictMode's deliberate double-mount in development.
    // See the longer note in Home.jsx.
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

  /* The server is the source of truth for the name; the context is
     the fallback until it answers. Both are the same person -- the
     server derived it from the same token the context was built
     from. */
  const displayName = data?.user?.name ?? sessionUser?.name ?? ''
  const firstName = displayName.split(' ')[0]

  const stats = data?.stats
  const recentItems = data?.recentItems ?? []

  return (
    <div className="container page dashboard">
      <header className="dashboard__header">
        <div>
          <h1 className="dashboard__title">
            {firstName ? `Welcome back, ${firstName}` : 'Your dashboard'}
          </h1>
          <p className="dashboard__subtitle">
            Everything you have listed, and everyone waiting to hear from you.
          </p>
        </div>

        <Link to="/items/new" className="dashboard__cta">
          <Button>+ Add an item</Button>
        </Link>
      </header>

      {/* aria-live: a screen reader announces the change when the
          numbers arrive, instead of leaving a blind user in silence
          wondering whether the page is still loading. */}
      <div className="dashboard__status" aria-live="polite">
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
          {/* --- Account details ------------------------------------
              Shown from data.user, which the server built from the
              token. Nothing here was supplied by the browser. */}
          <section className="dashboard__section" aria-labelledby="account-heading">
            <h2 id="account-heading" className="dashboard__section-title">
              Your account
            </h2>

            <dl className="account-card">
              <div className="account-card__row">
                <dt>Name</dt>
                <dd>{data.user.name}</dd>
              </div>
              <div className="account-card__row">
                <dt>Email</dt>
                <dd>{data.user.email}</dd>
              </div>
              <div className="account-card__row">
                <dt>Mobile</dt>
                <dd>{data.user.mobile}</dd>
              </div>
              <div className="account-card__row">
                <dt>Member since</dt>
                {/* created_at arrives as 'YYYY-MM-DD HH:MM:SS'. Only
                    the date part is shown, so no timezone conversion
                    can shift it to the wrong day. */}
                <dd>{data.user.created_at?.slice(0, 10)}</dd>
              </div>
            </dl>
          </section>

          {/* --- The numbers ---------------------------------------- */}
          <section className="dashboard__section" aria-labelledby="stats-heading">
            <h2 id="stats-heading" className="dashboard__section-title">
              At a glance
            </h2>

            <div className="dashboard__stats">
              <StatCard
                icon="📦"
                label="Items listed"
                value={stats.items.total}
                hint={`${stats.items.available} available`}
                to="/my-items"
                tone="accent"
              />
              <StatCard
                icon="🤝"
                label="Items reserved"
                value={stats.items.reserved}
                hint="Promised to someone"
              />
              <StatCard
                icon="✅"
                label="Items given away"
                value={stats.items.unavailable}
                hint="No longer available"
              />
              <StatCard
                icon="📨"
                label="Requests received"
                value={stats.requestsReceived.total}
                hint={
                  stats.requestsReceived.pending > 0
                    ? `${stats.requestsReceived.pending} awaiting your reply`
                    : 'Nothing waiting on you'
                }
                to="/requests"
                tone={stats.requestsReceived.pending > 0 ? 'warn' : 'neutral'}
              />
              <StatCard
                icon="📤"
                label="Requests sent"
                value={stats.requestsSent.total}
                hint={`${stats.requestsSent.pending} still pending`}
                to="/requests"
              />
              <StatCard
                icon="🎁"
                label="Requests accepted"
                value={stats.requestsSent.accepted}
                hint="Items coming your way"
              />
            </div>
          </section>

          {/* --- Recent listings ------------------------------------ */}
          <section className="dashboard__section" aria-labelledby="recent-heading">
            <div className="dashboard__section-head">
              <h2 id="recent-heading" className="dashboard__section-title">
                Your recent listings
              </h2>
              {recentItems.length > 0 && (
                <Link to="/my-items" className="dashboard__see-all">
                  See all {stats.items.total} →
                </Link>
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

export default Dashboard
