/**
 * "Live index" — the community in numbers, from GET /api/stats.
 *
 * Forms (dataviz method): totals are figures, not charts (one hero number +
 * stat row); listings over time is a single-series column chart; categories
 * and campuses are ranked horizontal bars. Every chart is one series in the
 * accent, so no legend; text stays in ink. Each mark has a hover tooltip and
 * everything is also available as a table.
 */
import { useEffect, useState } from 'react'

import { api } from '../lib/api'
import { ColumnChart, CountUp, DataTable, RankedBars } from './Charts'
import './LiveIndex.css'

const fmt = new Intl.NumberFormat('en-IN')

export default function LiveIndex() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    api.get('/stats', { signal: controller.signal })
      .then((res) => setStats(res.data))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
    return () => controller.abort()
  }, [])

  if (error) return null
  if (!stats) return <section className="live shell" aria-busy="true"><div className="live__loading" /></section>

  const { totals } = stats
  return (
    <section className="live shell" aria-labelledby="live-title">
      <header className="live__head">
        <h2 id="live-title" className="label">Live index</h2>
        <span className="label live__pulse"><i aria-hidden="true" /> Updated every minute</span>
      </header>

      <div className="live__hero">
        <div>
          <p className="label">Things listed so far</p>
          <CountUp className="live__heronum" value={totals.listed} />
        </div>
        <dl className="live__stats">
          <Stat label="Available now" value={totals.available} />
          <Stat label="Handed over" value={totals.rehomed} />
          <Stat label="Members" value={totals.members} />
          <Stat label="Campuses" value={totals.campuses} />
          <Stat label="Cities" value={totals.cities} />
        </dl>
      </div>

      <div className="live__charts">
        <figure className="live__chart live__chart--wide">
          <figcaption>
            <span className="live__title">New listings, last 30 days</span>
            <span className="live__sub">{fmt.format(stats.daily.reduce((n, d) => n + d.count, 0))} in total</span>
          </figcaption>
          <ColumnChart data={stats.daily} />
        </figure>

        <figure className="live__chart">
          <figcaption>
            <span className="live__title">Listings by category</span>
          </figcaption>
          <RankedBars data={stats.byCategory} total={totals.listed} />
        </figure>

        <figure className="live__chart">
          <figcaption>
            <span className="live__title">Most active campuses</span>
          </figcaption>
          <RankedBars data={stats.byCampus} total={totals.listed} />
        </figure>
      </div>

      <details className="datatable-toggle">
        <summary className="label ulink">View the data as a table</summary>
        <DataTable caption="New listings per day" rows={stats.daily.map((d) => [d.day, d.count])} head={['Day', 'Listings']} />
        <DataTable caption="Listings by category" rows={stats.byCategory.map((d) => [d.label, d.count])} head={['Category', 'Listings']} />
        <DataTable caption="Listings by campus" rows={stats.byCampus.map((d) => [d.label, d.count])} head={['Campus', 'Listings']} />
      </details>
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <div className="live__stat">
      <dt>{label}</dt>
      <dd><CountUp value={value} /></dd>
    </div>
  )
}
