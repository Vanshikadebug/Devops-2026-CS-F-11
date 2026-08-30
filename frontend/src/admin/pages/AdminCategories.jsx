import { useState } from 'react'
import { api } from '../../lib/api'
import { useAdminResource } from '../useAdminResource'
import { Button } from '../../components/ui'
import { AdminHead, DataTable, confirmAction } from '../components/Shared'

const TINTS = ['books', 'electronics', 'clothing', 'furniture', 'stationery', 'other']

/* Categories are rows, so this page is what makes "add Sports" possible
   without a migration. Deletion is blocked while listings still reference the
   label -- the API answers 409 and points at deactivation instead. */

export default function AdminCategories() {
  const { data, loading, error, busy, notice, mutate } = useAdminResource('/admin/categories')

  const [label, setLabel] = useState('')
  const [glyph, setGlyph] = useState('')
  const [tint, setTint] = useState('other')
  const [editing, setEditing] = useState(null)

  const add = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    const res = await mutate(
      () => api.post('/admin/categories', { label: label.trim(), glyph: glyph.trim(), tint }),
      { successMessage: `Added "${label.trim()}"` },
    )
    if (res) { setLabel(''); setGlyph(''); setTint('other') }
  }

  const save = async (row, patch) => {
    await mutate(() => api.patch(`/admin/categories/${row.id}`, patch))
    setEditing(null)
  }

  const remove = (row) => {
    if (!confirmAction(`Delete "${row.label}"? This cannot be undone.`)) return
    mutate(() => api.del(`/admin/categories/${row.id}`))
  }

  const move = (row, delta) => {
    save(row, { sortOrder: (row.sort_order ?? 0) + delta })
  }

  return (
    <>
      <AdminHead
        title="Categories"
        subtitle="Add, rename, reorder or retire the categories listings can use."
      />

      {error && <div className="alert alert--error">{error}</div>}
      {notice && <div className="alert alert--ok">{notice}</div>}

      <form className="editrow" onSubmit={add}>
        <label className="field editrow__grow">
          <span className="field__label">New category</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sports" maxLength={60} required />
        </label>
        <label className="field" style={{ width: 90 }}>
          <span className="field__label">Icon</span>
          <input className="input" value={glyph} onChange={(e) => setGlyph(e.target.value)}
            placeholder="🏸" maxLength={4} />
        </label>
        <label className="field" style={{ width: 150 }}>
          <span className="field__label">Tint</span>
          <select className="select" value={tint} onChange={(e) => setTint(e.target.value)}>
            {TINTS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <Button variant="primary" type="submit" disabled={busy}>Add category</Button>
      </form>

      <DataTable
        columns={['', 'Label', 'Slug', 'Tint', 'Listings', 'Active', '']}
        loading={loading}
        rowCount={data.length}
        empty="No categories yet — add the first one above."
      >
        {data.map((row) => (
          <tr key={row.id}>
            <td style={{ fontSize: '1.2rem', width: 40 }}>{row.glyph || '📦'}</td>
            <td>
              {editing === row.id ? (
                <input
                  className="input"
                  defaultValue={row.label}
                  autoFocus
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== row.label) save(row, { label: next })
                    else setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <button type="button" className="tbl__strong"
                  style={{ border: 0, background: 'none', cursor: 'text', padding: 0, font: 'inherit' }}
                  onClick={() => setEditing(row.id)} title="Click to rename">
                  {row.label}
                </button>
              )}
            </td>
            <td><code className="muted">{row.slug}</code></td>
            <td>
              <select className="select" style={{ maxWidth: 140 }} value={row.tint} disabled={busy}
                onChange={(e) => save(row, { tint: e.target.value })}>
                {TINTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </td>
            <td className="tbl__num">{row.item_count ?? 0}</td>
            <td>
              <label className="switch">
                <input type="checkbox" checked={row.is_active} disabled={busy}
                  onChange={(e) => save(row, { isActive: e.target.checked })} />
              </label>
            </td>
            <td>
              <div className="tbl__actions">
                <Button variant="quiet" size="sm" disabled={busy} onClick={() => move(row, -15)}>↑</Button>
                <Button variant="quiet" size="sm" disabled={busy} onClick={() => move(row, 15)}>↓</Button>
                <Button
                  variant="danger" size="sm"
                  disabled={busy || row.item_count > 0}
                  title={row.item_count > 0 ? `${row.item_count} listings use this — deactivate instead` : 'Delete'}
                  onClick={() => remove(row)}
                >
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <p className="muted" style={{ marginTop: 'var(--s4)', fontSize: '0.82rem' }}>
        Renaming a category also updates every listing that uses it. A category
        in use cannot be deleted — deactivate it to hide it from new listings
        while leaving existing ones intact.
      </p>
    </>
  )
}
