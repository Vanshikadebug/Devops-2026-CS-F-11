import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../../components/ui'
import { statusVariant, timeAgo, formatDateTime } from '../../lib/display'

/* The dashboard. One request to /api/admin/dashboard supplies every panel, so
   the numbers on screen are a single consistent snapshot.

   Charts are hand-rolled inline SVG rather than a charting library: they are
   two simple shapes, a library would be ~100kB for that, and the artifact CSP
   blocks external scripts anyway. */

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [health, setHealth] = useState(null)

  useEffect(() => {
    Promise.all([api.get('/admin/dashboard'), api.get('/health')])
      .then(([d, h]) => { setData(d.data); setHealth(h) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner label="Loading dashboard…" />
  if (error) return <div className="alert alert--error">{error}</div>

  const { totals: t, trend, series, byCategory, byCollege, recent } = data

  return (
    <>
      <header className="dash__head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">A live snapshot of the platform.</p>
        </div>
        <div className="dash__health">
          <HealthDot ok={health?.database === 'connected'} label="Database" />
          <HealthDot ok={health?.redis === 'connected'} label="Cache" warn={health?.redis !== 'connected'} />
          <span className="dash__uptime">up {health?.uptime}</span>
        </div>
      </header>

      {/* --- Headline metrics with week-on-week movement -------------- */}
      <div className="kpi">
        <Kpi label="Total listings" value={t.items} trend={trend.items}
             foot={`${t.available} available now`} to="/admin/items" />
        <Kpi label="Members" value={t.users} trend={trend.users}
             foot={`${t.staff} staff · ${t.blocked} blocked`} to="/admin/users" />
        <Kpi label="Requests" value={t.requests} trend={trend.requests}
             foot={`${t.pendingRequests} awaiting a reply`} />
        <Kpi label="Needs attention" value={t.pending + t.openReports}
             foot={`${t.pending} listings · ${t.openReports} reports`}
             tone={t.pending + t.openReports > 0 ? 'alert' : 'calm'} to="/admin/items" />
      </div>

      <div className="dash__grid">
        {/* --- Activity over time ----------------------------------- */}
        <section className="panel panel--wide">
          <div className="panel__head">
            <h2>Activity</h2>
            <div className="legend">
              <span className="legend__key legend__key--a" /> Listings
              <span className="legend__key legend__key--b" /> Signups
            </div>
          </div>
          <ActivityChart series={series} />
        </section>

        {/* --- Moderation funnel ------------------------------------ */}
        <section className="panel">
          <div className="panel__head"><h2>Listing status</h2></div>
          <Breakdown rows={[
            { label: 'Available', count: t.available, tone: 'ok' },
            { label: 'Awaiting review', count: t.pending, tone: 'warn' },
            { label: 'Hidden / rejected', count: t.hidden, tone: 'bad' },
          ]} total={t.items} />

          <div className="panel__head" style={{ marginTop: 'var(--s6)' }}><h2>Requests</h2></div>
          <Breakdown rows={[
            { label: 'Accepted', count: t.acceptedRequests, tone: 'ok' },
            { label: 'Pending', count: t.pendingRequests, tone: 'warn' },
          ]} total={t.requests} />
        </section>

        {/* --- Catalogue mix --------------------------------------- */}
        <section className="panel">
          <div className="panel__head">
            <h2>By category</h2>
            <Link to="/admin/categories">Manage</Link>
          </div>
          <BarList rows={byCategory} />
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>By campus</h2>
            <Link to="/admin/locations">Manage</Link>
          </div>
          <BarList rows={byCollege} />
        </section>

        {/* --- Recent listings ------------------------------------- */}
        <section className="panel panel--wide">
          <div className="panel__head">
            <h2>Latest listings</h2>
            <Link to="/admin/items">View all</Link>
          </div>
          <ul className="feed">
            {recent.items.length === 0 && <li className="feed__empty">No listings yet.</li>}
            {recent.items.map((i) => (
              <li key={i.id} className="feed__row">
                <span className="feed__main">
                  <strong>{i.name}</strong>
                  <span className="muted">{i.category} · {i.owner_name}</span>
                </span>
                <span className={`badge badge--${statusVariant(i.moderation_status)}`}>{i.moderation_status}</span>
                <span className="feed__when">{timeAgo(i.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* --- Newest members -------------------------------------- */}
        <section className="panel">
          <div className="panel__head">
            <h2>Newest members</h2>
            <Link to="/admin/users">View all</Link>
          </div>
          <ul className="feed">
            {recent.users.length === 0 && <li className="feed__empty">No members yet.</li>}
            {recent.users.map((u) => (
              <li key={u.id} className="feed__row">
                <span className="feed__avatar" aria-hidden="true">
                  {u.name?.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span className="feed__main">
                  <strong>{u.name}</strong>
                  <span className="muted">{u.college_name || u.email}</span>
                </span>
                <span className="feed__when">{timeAgo(u.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* --- Admin trail ----------------------------------------- */}
        <section className="panel">
          <div className="panel__head">
            <h2>Recent admin actions</h2>
            <Link to="/admin/audit">Full log</Link>
          </div>
          <ul className="feed">
            {recent.audit.length === 0 && <li className="feed__empty">Nothing recorded yet.</li>}
            {recent.audit.map((a) => (
              <li key={a.id} className="feed__row">
                <span className="feed__main">
                  <strong>{a.description}</strong>
                  <span className="muted">{a.admin_email}</span>
                </span>
                <span className="feed__when" title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

/* --- pieces ---------------------------------------------------------- */

function HealthDot({ ok, label, warn }) {
  const tone = ok ? 'ok' : warn ? 'warn' : 'bad'
  return (
    <span className={`hdot hdot--${tone}`} title={`${label}: ${ok ? 'connected' : 'unavailable'}`}>
      <i aria-hidden="true" />{label}
    </span>
  )
}

function Kpi({ label, value, trend, foot, tone, to }) {
  const body = (
    <>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value.toLocaleString()}</span>
      {trend && <Delta {...trend} />}
      {foot && <span className="kpi__foot">{foot}</span>}
    </>
  )
  const cls = `kpi__card ${tone ? `kpi__card--${tone}` : ''}`
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}

/** Week-on-week movement. A bare count without a baseline is not a trend. */
function Delta({ current, previous, delta }) {
  if (previous === 0 && current === 0) return <span className="delta delta--flat">no change</span>
  // No percentage from a zero baseline -- "+∞%" is noise, the count is the story.
  const pct = previous === 0 ? null : Math.round((delta / previous) * 100)
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return (
    <span className={`delta delta--${dir}`}>
      {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—'}{' '}
      {pct === null ? `+${current}` : `${Math.abs(pct)}%`}
      <span className="delta__note">vs last 7d</span>
    </span>
  )
}

/** Grouped bars, 14 days. Two series, shared scale. */
function ActivityChart({ series }) {
  const W = 700
  const H = 170
  const pad = { l: 26, r: 8, t: 10, b: 22 }
  const max = Math.max(1, ...series.flatMap((d) => [d.items, d.users]))
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const slot = innerW / series.length
  const bw = Math.max(3, slot / 2 - 2)
  const y = (v) => pad.t + innerH - (v / max) * innerH

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Listings and signups per day over the last ${series.length} days`}>
        {/* gridlines + y labels */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart__grid" />
            <text x={pad.l - 6} y={y(max * f) + 3} className="chart__ylab">{Math.round(max * f)}</text>
          </g>
        ))}

        {series.map((d, i) => {
          const x = pad.l + i * slot
          return (
            <g key={d.day}>
              <rect className="chart__bar chart__bar--a" x={x + 1} width={bw}
                    y={y(d.items)} height={Math.max(0, pad.t + innerH - y(d.items))} rx="2">
                <title>{`${d.day}: ${d.items} listing${d.items === 1 ? '' : 's'}`}</title>
              </rect>
              <rect className="chart__bar chart__bar--b" x={x + bw + 2} width={bw}
                    y={y(d.users)} height={Math.max(0, pad.t + innerH - y(d.users))} rx="2">
                <title>{`${d.day}: ${d.users} signup${d.users === 1 ? '' : 's'}`}</title>
              </rect>
              {/* Every other label, so they never collide. */}
              {i % 2 === 0 && (
                <text x={x + slot / 2} y={H - 6} className="chart__xlab" textAnchor="middle">
                  {d.day.slice(8)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function BarList({ rows }) {
  if (!rows || rows.length === 0) return <p className="muted">No data yet.</p>
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="barlist__label">{r.label}</span>
          <span className="barlist__track">
            <span className="barlist__fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="barlist__n">{r.count}</span>
        </li>
      ))}
    </ul>
  )
}

function Breakdown({ rows, total }) {
  const safe = Math.max(1, total)
  return (
    <ul className="breakdown">
      {rows.map((r) => (
        <li key={r.label}>
          <span className={`breakdown__dot breakdown__dot--${r.tone}`} aria-hidden="true" />
          <span className="breakdown__label">{r.label}</span>
          <span className="breakdown__n">{r.count}</span>
          <span className="breakdown__pct">{Math.round((r.count / safe) * 100)}%</span>
        </li>
      ))}
    </ul>
  )
}
