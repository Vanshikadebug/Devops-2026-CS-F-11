import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { statusVariant, timeAgo } from '../../lib/display'
import { Button } from '../../components/ui'
import { AdminHead, DataTable, Pager, Toolbar } from '../components/Shared'

const MODERATION = ['', 'Pending', 'Approved', 'Rejected', 'Hidden']

export default function AdminItems() {
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [modFilter, setModFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async (p = page) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: String(p), limit: '20' })
      if (modFilter) q.set('moderation', modFilter)
      if (search.trim()) q.set('search', search.trim())
      const res = await api.get(`/admin/items?${q}`)
      setItems(res.data)
      setPagination(res.pagination)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, modFilter])

  const moderate = async (id, status, reason = '') => {
    setBusy(true)
    try {
      await api.patch(`/admin/items/${id}/moderation`, { status, reason })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const cols = [
    { key: 'item', label: 'Listing' },
    { key: 'owner', label: 'Owner' },
    { key: 'mod', label: 'Moderation' },
    { key: 'status', label: 'Status' },
    { key: 'when', label: 'Listed' },
    { key: 'actions', label: '' },
  ]

  return (
    <>
      <AdminHead title="Listings" subtitle="Moderate and review item submissions.">
        <Button variant="quiet" size="sm" onClick={() => setModFilter('Pending')}>
          Pending queue
        </Button>
      </AdminHead>

      <Toolbar>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search listings…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1))} />
        <select className="select" style={{ maxWidth: 180 }}
          value={modFilter} onChange={(e) => { setModFilter(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          {MODERATION.slice(1).map((s) => <option key={s}>{s}</option>)}
        </select>
      </Toolbar>

      {error && <div className="alert alert--error">{error}</div>}

      <DataTable columns={cols} loading={loading} rowCount={items.length}
        empty="No listings match.">
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <span className="tbl__strong">{item.name}</span>
              <span className="tbl__sub">{item.category} · {item.condition} · {item.college_name || item.location}</span>
            </td>
            <td>
              <span>{item.owner_name}</span>
              <span className="tbl__sub">{item.owner_email}</span>
            </td>
            <td><span className={`badge badge--${statusVariant(item.moderation_status)}`}>{item.moderation_status}</span></td>
            <td><span className={`badge badge--${statusVariant(item.status)}`}>{item.status}</span></td>
            <td className="tbl__num">{timeAgo(item.created_at)}</td>
            <td>
              <div className="tbl__actions">
                {item.moderation_status !== 'Approved' && (
                  <Button variant="quiet" size="sm" disabled={busy}
                    onClick={() => moderate(item.id, 'Approved')}>Approve</Button>
                )}
                {item.moderation_status !== 'Rejected' && (
                  <Button variant="danger" size="sm" disabled={busy}
                    onClick={() => {
                      const reason = prompt('Reason for rejection (optional):') ?? ''
                      moderate(item.id, 'Rejected', reason)
                    }}>Reject</Button>
                )}
                {item.moderation_status !== 'Hidden' && (
                  <Button variant="ghost" size="sm" disabled={busy}
                    onClick={() => moderate(item.id, 'Hidden')}>Hide</Button>
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
