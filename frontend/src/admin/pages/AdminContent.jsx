import { useState } from 'react'
import { api } from '../../lib/api'
import { useAdminResource } from '../useAdminResource'
import { Button } from '../../components/ui'
import { AdminHead, DataTable, confirmAction } from '../components/Shared'

/* Navbar/footer links and social links -- the site chrome, editable. */

export default function AdminContent() {
  const nav = useAdminResource('/admin/nav-links')
  const social = useAdminResource('/admin/social-links')

  const [navForm, setNavForm] = useState({ placement: 'header' })
  const [socForm, setSocForm] = useState({})

  const addNav = async (e) => {
    e.preventDefault()
    const res = await nav.mutate(() => api.post('/admin/nav-links', {
      label: navForm.label,
      href: navForm.href,
      placement: navForm.placement || 'header',
    }), { successMessage: `Added ${navForm.label}` })
    if (res) setNavForm({ placement: 'header' })
  }

  const addSocial = async (e) => {
    e.preventDefault()
    const res = await social.mutate(() => api.post('/admin/social-links', {
      platform: socForm.platform,
      url: socForm.url,
    }), { successMessage: `Added ${socForm.platform}` })
    if (res) setSocForm({})
  }

  return (
    <>
      <AdminHead title="Navigation" subtitle="Header and footer links, plus social profiles." />

      {(nav.error || social.error) && (
        <div className="alert alert--error">{nav.error || social.error}</div>
      )}
      {(nav.notice || social.notice) && (
        <div className="alert alert--ok">{nav.notice || social.notice}</div>
      )}

      <section className="adm__section">
        <h2>Menu links</h2>

        <form className="editrow" onSubmit={addNav}>
          <label className="field editrow__grow">
            <span className="field__label">Label</span>
            <input className="input" value={navForm.label || ''}
              onChange={(e) => setNavForm((f) => ({ ...f, label: e.target.value }))} required />
          </label>
          <label className="field editrow__grow">
            <span className="field__label">Target</span>
            <input className="input" value={navForm.href || ''} placeholder="/items or https://…"
              onChange={(e) => setNavForm((f) => ({ ...f, href: e.target.value }))} required />
          </label>
          <label className="field" style={{ width: 140 }}>
            <span className="field__label">Placement</span>
            <select className="select" value={navForm.placement || 'header'}
              onChange={(e) => setNavForm((f) => ({ ...f, placement: e.target.value }))}>
              <option value="header">Header</option>
              <option value="footer">Footer</option>
            </select>
          </label>
          <Button variant="primary" type="submit" disabled={nav.busy}>Add link</Button>
        </form>

        <DataTable columns={['Label', 'Target', 'Placement', 'Active', '']}
          loading={nav.loading} rowCount={nav.data.length} empty="No menu links.">
          {nav.data.map((row) => (
            <tr key={row.id}>
              <td className="tbl__strong">{row.label}</td>
              <td><code className="muted">{row.href}</code></td>
              <td><span className="badge badge--neutral">{row.placement}</span></td>
              <td>
                <label className="switch">
                  <input type="checkbox" checked={row.is_active} disabled={nav.busy}
                    onChange={(e) => nav.mutate(() => api.patch(`/admin/nav-links/${row.id}`, { isActive: e.target.checked }))} />
                </label>
              </td>
              <td>
                <div className="tbl__actions">
                  <Button variant="quiet" size="sm" disabled={nav.busy}
                    onClick={() => nav.mutate(() => api.patch(`/admin/nav-links/${row.id}`, { sortOrder: (row.sort_order ?? 0) - 15 }))}>↑</Button>
                  <Button variant="quiet" size="sm" disabled={nav.busy}
                    onClick={() => nav.mutate(() => api.patch(`/admin/nav-links/${row.id}`, { sortOrder: (row.sort_order ?? 0) + 15 }))}>↓</Button>
                  <Button variant="danger" size="sm" disabled={nav.busy}
                    onClick={() => confirmAction(`Delete "${row.label}"?`) && nav.mutate(() => api.del(`/admin/nav-links/${row.id}`))}>Delete</Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="adm__section">
        <h2>Social links</h2>

        <form className="editrow" onSubmit={addSocial}>
          <label className="field editrow__grow">
            <span className="field__label">Platform</span>
            <input className="input" value={socForm.platform || ''} placeholder="Instagram"
              onChange={(e) => setSocForm((f) => ({ ...f, platform: e.target.value }))} required />
          </label>
          <label className="field editrow__grow">
            <span className="field__label">URL</span>
            <input className="input" value={socForm.url || ''} placeholder="https://…"
              onChange={(e) => setSocForm((f) => ({ ...f, url: e.target.value }))} required />
          </label>
          <Button variant="primary" type="submit" disabled={social.busy}>Add social</Button>
        </form>

        <DataTable columns={['Platform', 'URL', 'Active', '']}
          loading={social.loading} rowCount={social.data.length} empty="No social links.">
          {social.data.map((row) => (
            <tr key={row.id}>
              <td className="tbl__strong">{row.platform}</td>
              <td><code className="muted">{row.url}</code></td>
              <td>
                <label className="switch">
                  <input type="checkbox" checked={row.is_active} disabled={social.busy}
                    onChange={(e) => social.mutate(() => api.patch(`/admin/social-links/${row.id}`, { isActive: e.target.checked }))} />
                </label>
              </td>
              <td>
                <div className="tbl__actions">
                  <Button variant="danger" size="sm" disabled={social.busy}
                    onClick={() => confirmAction(`Delete "${row.platform}"?`) && social.mutate(() => api.del(`/admin/social-links/${row.id}`))}>Delete</Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </>
  )
}
