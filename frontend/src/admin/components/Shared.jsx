import { Spinner, Button, Pill } from '../../components/ui'

/* Small shared pieces for the admin sections, so each page is only its own
   columns, filters and actions. */

export function AdminHead({ title, subtitle, children }) {
  return (
    <header className="adm__headrow">
      <div className="adm__head" style={{ marginBottom: 0 }}>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row row--wrap">{children}</div>}
    </header>
  )
}

export function StatTile({ label, value, hint }) {
  return (
    <div className="adm__stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  )
}

export function DataTable({ columns, children, loading, error, empty = 'Nothing here yet.', rowCount }) {
  if (error) return <div className="alert alert--error">{error}</div>

  return (
    <div className="adm__panel">
      {loading ? (
        <Spinner />
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>{columns.map((c) => <th key={c.key || c}>{c.label ?? c}</th>)}</tr>
            </thead>
            <tbody>
              {rowCount === 0 ? (
                <tr><td className="tbl__empty" colSpan={columns.length}>{empty}</td></tr>
              ) : (
                children
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function Pager({ pagination, onPage }) {
  if (!pagination || pagination.totalPages <= 1) return null
  return (
    <div className="adm__pager">
      <Button variant="quiet" size="sm" disabled={!pagination.hasPrev}
        onClick={() => onPage(pagination.page - 1)}>Previous</Button>
      <Pill tone="sunk">
        Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
      </Pill>
      <Button variant="quiet" size="sm" disabled={!pagination.hasNext}
        onClick={() => onPage(pagination.page + 1)}>Next</Button>
    </div>
  )
}

export function Toolbar({ children }) {
  return <div className="adm__toolbar">{children}</div>
}

/** Confirm helper. Returns true when the operator accepts. */
export function confirmAction(message) {
  // eslint-disable-next-line no-alert
  return window.confirm(message)
}
