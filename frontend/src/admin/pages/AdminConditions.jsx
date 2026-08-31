import { useState } from 'react'
import { api } from '../../lib/api'
import { useAdminResource } from '../useAdminResource'
import { Button } from '../../components/ui'
import { AdminHead, DataTable, confirmAction } from '../components/Shared'

export default function AdminConditions() {
  const { data, loading, error, busy, notice, mutate } = useAdminResource('/admin/conditions')
  const [label, setLabel] = useState('')
  const [editing, setEditing] = useState(null)

  const add = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    const res = await mutate(
      () => api.post('/admin/conditions', { label: label.trim() }),
      { successMessage: `Added "${label.trim()}"` },
    )
    if (res) setLabel('')
  }

  const save = async (row, patch) => {
    await mutate(() => api.patch(`/admin/conditions/${row.id}`, patch))
    setEditing(null)
  }

  const remove = (row) => {
    if (!confirmAction(`Delete "${row.label}"?`)) return
    mutate(() => api.del(`/admin/conditions/${row.id}`))
  }

  return (
    <>
      <AdminHead
        title="Conditions"
        subtitle="The condition options a member can pick when listing an item."
      />

      {error && <div className="alert alert--error">{error}</div>}
      {notice && <div className="alert alert--ok">{notice}</div>}

      <form className="editrow" onSubmit={add}>
        <label className="field editrow__grow">
          <span className="field__label">New condition</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Refurbished" maxLength={60} required />
        </label>
        <Button variant="primary" type="submit" disabled={busy}>Add condition</Button>
      </form>

      <DataTable
        columns={['Label', 'Slug', 'Listings', 'Active', '']}
        loading={loading}
        rowCount={data.length}
        empty="No conditions yet."
      >
        {data.map((row) => (
          <tr key={row.id}>
            <td>
              {editing === row.id ? (
                <input className="input" defaultValue={row.label} autoFocus
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== row.label) save(row, { label: next })
                    else setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditing(null)
                  }} />
              ) : (
                <button type="button" className="tbl__strong"
                  style={{ border: 0, background: 'none', cursor: 'text', padding: 0, font: 'inherit' }}
                  onClick={() => setEditing(row.id)} title="Click to rename">
                  {row.label}
                </button>
              )}
            </td>
            <td><code className="muted">{row.slug}</code></td>
            <td className="tbl__num">{row.item_count ?? 0}</td>
            <td>
              <label className="switch">
                <input type="checkbox" checked={row.is_active} disabled={busy}
                  onChange={(e) => save(row, { isActive: e.target.checked })} />
              </label>
            </td>
            <td>
              <div className="tbl__actions">
                <Button variant="quiet" size="sm" disabled={busy}
                  onClick={() => save(row, { sortOrder: (row.sort_order ?? 0) - 15 })}>↑</Button>
                <Button variant="quiet" size="sm" disabled={busy}
                  onClick={() => save(row, { sortOrder: (row.sort_order ?? 0) + 15 })}>↓</Button>
                <Button variant="danger" size="sm"
                  disabled={busy || row.item_count > 0}
                  title={row.item_count > 0 ? `${row.item_count} listings use this — deactivate instead` : 'Delete'}
                  onClick={() => remove(row)}>Delete</Button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  )
}
