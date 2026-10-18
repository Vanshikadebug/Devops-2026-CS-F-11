/**
 * Shared chart pieces (dataviz method): figures count up once visible, every
 * chart is a single series in the accent with text in ink, each mark has a
 * hover tooltip, and DataTable gives the same numbers as a table.
 * Used by the home page Live index and the user dashboard.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, motion, useInView } from 'framer-motion'

import './Charts.css'

const fmt = new Intl.NumberFormat('en-IN')

/* ---------------------------------------------------------------- figures */

export function CountUp({ value, className }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  useEffect(() => {
    if (!inView) return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const controls = animate(0, value, {
      duration: reduced ? 0 : 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { if (ref.current) ref.current.textContent = fmt.format(Math.round(v)) },
    })
    return () => controls.stop()
  }, [inView, value])
  // Starts at 0 (counted up once visible); assistive tech gets the real value.
  return (
    <span className={className} aria-label={fmt.format(value)}>
      <span ref={ref} aria-hidden="true">0</span>
    </span>
  )
}

/* ---------------------------------------------------------------- charts */

/** Clean axis maximum: 1, 2, 5 × 10^n at or above the data max. */
function niceMax(max) {
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  return [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= max)
}

const shortDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** Single-series column chart with per-column hover tooltip. */
/** Rendered at the container's real pixel width, so text and bar sizes are
    true pixels rather than scaled with the viewBox. */
function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return width
}

export function ColumnChart({ data }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const [hover, setHover] = useState(null)

  const W = useWidth(ref) || 720
  const H = 240
  const pad = { top: 18, right: 8, bottom: 26, left: 28 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const max = niceMax(Math.max(...data.map((d) => d.count)))
  const slot = innerW / data.length
  const barW = Math.min(24, slot * 0.62)
  const y = (v) => pad.top + innerH - (v / max) * innerH
  const peak = data.reduce((best, d, i) => (d.count > data[best].count ? i : best), 0)

  return (
    <div className="lchart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Column chart of new listings per day for the last 30 days">
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line className="lchart__grid" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
            <text className="lchart__tick" x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt.format(t)}</text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = pad.left + i * slot + (slot - barW) / 2
          const h = Math.max(0, y(0) - y(d.count))
          return (
            <g key={d.day}>
              {d.count > 0 && (
                <motion.path
                  className={`lchart__mark ${hover === i ? 'is-hover' : ''}`}
                  d={roundedTop(x, y(0), barW, h)}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: inView ? 1 : 0 }}
                  transition={{ duration: 0.8, delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: `0px ${y(0)}px`, transformBox: 'view-box' }}
                />
              )}
              {/* Hit target: the whole column slot, not just the mark. */}
              <rect
                className="lchart__hit"
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={innerH}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          )
        })}

        {data[peak].count > 0 && (
          <text className="lchart__value" x={pad.left + peak * slot + slot / 2} y={y(data[peak].count) - 6} textAnchor="middle">
            {fmt.format(data[peak].count)}
          </text>
        )}

        <line className="lchart__axis" x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} />
        <text className="lchart__tick" x={pad.left} y={H - 6}>{shortDay(data[0].day)}</text>
        <text className="lchart__tick" x={W - pad.right} y={H - 6} textAnchor="end">Today</text>
      </svg>

      {hover !== null && (
        <div
          className="lchart__tip"
          style={{ left: `${((pad.left + hover * slot + slot / 2) / W) * 100}%`, top: `${(y(data[hover].count) / H) * 100}%` }}
        >
          <strong>{fmt.format(data[hover].count)}</strong> {data[hover].count === 1 ? 'listing' : 'listings'}
          <span>{shortDay(data[hover].day)}</span>
        </div>
      )}
    </div>
  )
}

/** Column path: square at the baseline, 4px rounded data-end. */
function roundedTop(x, base, w, h) {
  const r = Math.min(4, w / 2, h)
  const top = base - h
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`
}

/** Ranked horizontal bars, value at the tip, share in the tooltip. */
export function RankedBars({ data, total }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const [hover, setHover] = useState(null)
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data])

  if (!data.length) return <p className="charts__empty">Nothing listed yet.</p>

  return (
    <ul className="bars" ref={ref}>
      {data.map((d, i) => (
        <li
          key={d.label}
          className={`bars__row ${hover === i ? 'is-hover' : ''}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="bars__label">{d.label}</span>
          <span className="bars__track">
            <motion.span
              className="bars__fill"
              initial={{ width: 0 }}
              // Capped at 88% so the value label always fits beyond the tip.
              animate={{ width: inView ? `${(d.count / max) * 88}%` : 0 }}
              transition={{ duration: 0.9, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            />
            <span className="bars__value">{fmt.format(d.count)}</span>
          </span>
          {hover === i && (
            <span className="lchart__tip lchart__tip--inline" role="status">
              <strong>{Math.round((d.count / Math.max(1, total)) * 100)}%</strong> of all listings
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function DataTable({ caption, head, rows }) {
  return (
    <table className="datatable">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{fmt.format(r[1])}</td></tr>)}</tbody>
    </table>
  )
}
