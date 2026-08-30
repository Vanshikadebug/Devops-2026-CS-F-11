import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../app/authContext'
import { statusVariant, timeAgo } from '../../lib/display'
import { Button } from '../../components/ui'
import { AdminHead, DataTable, Pager, Toolbar, confirmAction } from '../components/Shared'
import { RANK } from '../../app/AdminRoute'

const ROLES = ['user', 'moderator', 'admin', 'super_admin']

export default function AdminUsers() {
  const { user: me } = useAuth()
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const myRank = RANK[me?.role] ?? -1
  const canChangeRoles = myRank >= RANK.super_admin

  const load = async (p = page) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: String(p), limit: '20' })
      if (search.trim()) q.set('search', search.trim())
      if (roleFilter) q.set('role', roleFilter)
      const res = await api.get(`/admin/users?${q}`)
      setRows(res.data)
      setPagination(res.pagination)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, roleFilter])

  const act = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleBlock = (u) => {
    const next = u.status === 'blocked' ? 'active' : 'blocked'
    if (!confirmAction(`${next === 'blocked' ? 'Block' : 'Unblock'} ${u.email}?`)) return
    act(() => api.patch(`/admin/users/${u.id}/status`, { status: next }))
  }

  const changeRole = (u, role) => {
    if (!confirmAction(`Change ${u.email} from ${u.role} to ${role}?`)) return
    act(() => api.patch(`/admin/users/${u.id}/role`, { role }))
  }

  return (
    <>
      <AdminHead title="Users" subtitle="Accounts, roles and access." />

      <Toolbar>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search name or email…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1))} />
        <select className="select" style={{ maxWidth: 170 }}
          value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
      </Toolbar>

      {error && <div className="alert alert--error">{error}</div>}

      <DataTable
        columns={['User', 'Campus', 'Role', 'Status', 'Items', 'Last login', '']}
        loading={loading}
        rowCount={rows.length}
        empty="No accounts match."
      >
        {rows.map((u) => {
          // The server refuses these too; disabling them just avoids offering
          // an action that is guaranteed to fail.
          const isSelf = u.id === me?.id
          const outranksMe = (RANK[u.role] ?? -1) >= myRank

          return (
            <tr key={u.id}>
              <td>
                <span className="tbl__strong">{u.name}</span>
                <span className="tbl__sub">{u.email}</span>
              </td>
              <td>{u.college_name || <span className="muted">—</span>}</td>
              <td>
                {canChangeRoles && !isSelf && !outranksMe ? (
                  <select
                    className="select"
                    style={{ maxWidth: 150 }}
                    value={u.role}
                    disabled={busy}
                    onChange={(e) => changeRole(u, e.target.value)}
                  >
                    {ROLES.filter((r) => (RANK[r] ?? 0) < myRank || r === u.role).map((r) => (
                      <option key={r} value={r}>{r.replace('_', ' ')}</option>
                    ))}
                  </select>
                ) : (
                  <span className="badge badge--neutral">{u.role.replace('_', ' ')}</span>
                )}
              </td>
              <td><span className={`badge badge--${statusVariant(u.status)}`}>{u.status}</span></td>
              <td className="tbl__num">{u.item_count ?? 0}</td>
              <td className="tbl__num">{u.last_login_at ? timeAgo(u.last_login_at) : <span className="muted">never</span>}</td>
              <td>
                <div className="tbl__actions">
                  <Button
                    variant={u.status === 'blocked' ? 'quiet' : 'danger'}
                    size="sm"
                    disabled={busy || isSelf || outranksMe}
                    title={isSelf ? 'You cannot act on your own account' : outranksMe ? 'This account matches or outranks yours' : ''}
                    onClick={() => toggleBlock(u)}
                  >
                    {u.status === 'blocked' ? 'Unblock' : 'Block'}
                  </Button>
                </div>
              </td>
            </tr>
          )
        })}
      </DataTable>

      <Pager pagination={pagination} onPage={(p) => { setPage(p); load(p) }} />
    </>
  )
}
