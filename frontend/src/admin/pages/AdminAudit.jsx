import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/display'
import { AdminHead, DataTable, Pager, Toolbar } from '../components/Shared'

/* The append-only administrative trail. Every admin write lands here. */

export default function AdminAudit() {
  const [rows, setRows] = useState([])
  const [actions, setActions] = useState([])
  const [targetTypes, setTargetTypes] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async (p = page) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: String(p), limit: '25' })
      if (action) q.set('action', action)
      if (targetType) q.set('targetType', targetType)
      if (search.trim()) q.set('search', search.trim())
      const res = await api.get(`/admin/audit?${q}`)
      setRows(res.data)
      setActions(res.actions || [])
      setTargetTypes(res.targetTypes || [])
      setPagination(res.pagination)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, action, targetType])

  return (
    <>
      <AdminHead title="Audit log" subtitle="Who changed what, and when. Append-only." />

      <Toolbar>
        <input className="input" style={{ maxWidth: 240 }} placeholder="Search description or admin…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1))} />
        <select className="select" style={{ maxWidth: 190 }} value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 160 }} value={targetType}
          onChange={(e) => { setTargetType(e.target.value); setPage(1) }}>
          <option value="">All targets</option>
          {targetTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Toolbar>

      {error && <div className="alert alert--error">{error}</div>}

      <DataTable
        columns={['When', 'Admin', 'Action', 'Target', 'Description']}
        loading={loading}
        rowCount={rows.length}
        empty="Nothing recorded yet."
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="tbl__num" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.created_at)}</td>
            <td>
              <span>{r.admin_name || <span className="muted">deleted</span>}</span>
              <span className="tbl__sub">{r.admin_email}</span>
            </td>
            <td><code className="muted">{r.action}</code></td>
            <td>
              <span className="badge badge--neutral">{r.target_type}</span>
              {r.target_id != null && <span className="tbl__sub">#{r.target_id}</span>}
            </td>
            <td>{r.description}</td>
          </tr>
        ))}
      </DataTable>

      <Pager pagination={pagination} onPage={(p) => { setPage(p); load(p) }} />
    </>
  )
}
