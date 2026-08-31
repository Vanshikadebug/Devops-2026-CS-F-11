import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { statusVariant, timeAgo } from '../../lib/display'
import { Button } from '../../components/ui'
import { AdminHead, DataTable, Pager, Toolbar } from '../components/Shared'

const REVIEWABLE = ['Under Review', 'Resolved', 'Rejected']

export default function AdminReports() {
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async (p = page) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: String(p), limit: '20' })
      if (statusFilter) q.set('status', statusFilter)
      const res = await api.get(`/admin/reports?${q}`)
      setRows(res.data)
      setPagination(res.pagination)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, statusFilter])

  const review = async (id, status) => {
    const note = status === 'Resolved' || status === 'Rejected'
      ? prompt('Resolution note (optional):') ?? ''
      : ''
    setBusy(true)
    try {
      await api.patch(`/admin/reports/${id}/review`, { status, note })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AdminHead title="Reports" subtitle="Complaints filed by members about listings or accounts." />

      <Toolbar>
        <select className="select" style={{ maxWidth: 180 }}
          value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          <option>Open</option>
          {REVIEWABLE.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Toolbar>

      {error && <div className="alert alert--error">{error}</div>}

      <DataTable
        columns={['Target', 'Reason', 'Reporter', 'Status', 'Filed', '']}
        loading={loading}
        rowCount={rows.length}
        empty="No reports. Nothing to review."
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <span className="tbl__strong">
                {r.reported_item_name || r.reported_user_name || '—'}
              </span>
              <span className="tbl__sub">{r.reported_item_id ? 'Listing' : 'Account'}</span>
            </td>
            <td>
              <span>{r.reason}</span>
              {r.details && <span className="tbl__sub">{r.details}</span>}
            </td>
            <td>{r.reporter_name}</td>
            <td><span className={`badge badge--${statusVariant(r.status)}`}>{r.status}</span></td>
            <td className="tbl__num">{timeAgo(r.created_at)}</td>
            <td>
              <div className="tbl__actions">
                {r.status === 'Open' && (
                  <Button variant="quiet" size="sm" disabled={busy}
                    onClick={() => review(r.id, 'Under Review')}>Take</Button>
                )}
                {r.status !== 'Resolved' && (
                  <Button variant="primary" size="sm" disabled={busy}
                    onClick={() => review(r.id, 'Resolved')}>Resolve</Button>
                )}
                {r.status !== 'Rejected' && (
                  <Button variant="ghost" size="sm" disabled={busy}
                    onClick={() => review(r.id, 'Rejected')}>Dismiss</Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Pager pagination={pagination} onPage={(p) => { setPage(p); load(p) }} />
    </>
  )
}
