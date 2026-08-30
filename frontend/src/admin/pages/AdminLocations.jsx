import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useConfig } from '../../app/ConfigProvider'
import { Button, Spinner } from '../../components/ui'
import { AdminHead, DataTable, confirmAction } from '../components/Shared'

const TABS = ['cities', 'areas', 'colleges']

export default function AdminLocations() {
  const { reload: reloadConfig } = useConfig()
  const [tab, setTab] = useState('cities')

  const [cities, setCities] = useState([])
  const [areas, setAreas] = useState([])
  const [colleges, setColleges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({})

  const loadAll = async () => {
    setLoading(true)
    try {
      const [c, a, col] = await Promise.all([
        api.get('/admin/locations/cities'),
        api.get('/admin/locations/areas'),
        api.get('/admin/locations/colleges?limit=100'),
      ])
      setCities(c.data)
      setAreas(a.data)
      setColleges(col.data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const run = async (fn, message) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fn()
      setNotice(message || res?.message || 'Saved')
      await loadAll()
      await reloadConfig()
      setForm({})
      return res
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  /** Delete, then retry with ?confirm=1 once the operator has seen the counts. */
  const removeWithConfirm = async (kind, row, name) => {
    setBusy(true)
    setError(null)
    try {
      await api.del(`/admin/locations/${kind}/${row.id}`)
      setNotice(`Deleted ${name}`)
      await loadAll()
      await reloadConfig()
    } catch (err) {
      // 409 carries the dependant counts; anything else is a real failure.
      if (err.status === 409) {
        if (confirmAction(`${err.message}\n\nProceed anyway?`)) {
          try {
            await api.del(`/admin/locations/${kind}/${row.id}?confirm=1`)
            setNotice(`Deleted ${name}`)
            await loadAll()
            await reloadConfig()
          } catch (err2) {
            setError(err2.message)
          }
        }
      } else {
        setError(err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (loading) return <Spinner label="Loading directory…" />

  return (
    <>
      <AdminHead title="Locations" subtitle="The campus directory: cities, areas and colleges." />

      <div className="adm__toolbar">
        {TABS.map((t) => (
          <button key={t} type="button"
            className={`browse__chip ${tab === t ? 'is-active' : ''}`}
            onClick={() => { setTab(t); setForm({}) }}>
            {t} ({t === 'cities' ? cities.length : t === 'areas' ? areas.length : colleges.length})
          </button>
        ))}
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {notice && <div className="alert alert--ok">{notice}</div>}

      {/* --- Cities ---------------------------------------------- */}
      {tab === 'cities' && (
        <>
          <form className="editrow" onSubmit={(e) => {
            e.preventDefault()
            run(() => api.post('/admin/locations/cities', { name: form.name, state: form.state }),
              `Added ${form.name}`)
          }}>
            <label className="field editrow__grow">
              <span className="field__label">City name</span>
              <input className="input" value={form.name || ''} onChange={set('name')} required />
            </label>
            <label className="field editrow__grow">
              <span className="field__label">State</span>
              <input className="input" value={form.state || ''} onChange={set('state')} required />
            </label>
            <Button variant="primary" type="submit" disabled={busy}>Add city</Button>
          </form>

          <DataTable columns={['City', 'State', 'Areas', 'Colleges', 'Items', '']}
            rowCount={cities.length} empty="No cities yet.">
            {cities.map((c) => (
              <tr key={c.id}>
                <td className="tbl__strong">{c.name}</td>
                <td>{c.state}</td>
                <td className="tbl__num">{c.area_count}</td>
                <td className="tbl__num">{c.college_count}</td>
                <td className="tbl__num">{c.item_count}</td>
                <td>
                  <div className="tbl__actions">
                    <Button variant="danger" size="sm" disabled={busy}
                      onClick={() => removeWithConfirm('cities', c, c.name)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}

      {/* --- Areas ----------------------------------------------- */}
      {tab === 'areas' && (
        <>
          <form className="editrow" onSubmit={(e) => {
            e.preventDefault()
            run(() => api.post('/admin/locations/areas',
              { cityId: Number(form.cityId), name: form.name }), `Added ${form.name}`)
          }}>
            <label className="field editrow__grow">
              <span className="field__label">City</span>
              <select className="select" value={form.cityId || ''} onChange={set('cityId')} required>
                <option value="">Choose a city…</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}
              </select>
            </label>
            <label className="field editrow__grow">
              <span className="field__label">Area name</span>
              <input className="input" value={form.name || ''} onChange={set('name')} required />
            </label>
            <Button variant="primary" type="submit" disabled={busy}>Add area</Button>
          </form>

          <DataTable columns={['Area', 'City', 'Colleges', 'Items', '']}
            rowCount={areas.length} empty="No areas yet.">
            {areas.map((a) => (
              <tr key={a.id}>
                <td className="tbl__strong">{a.name}</td>
                <td>{a.city_name}, {a.state}</td>
                <td className="tbl__num">{a.college_count}</td>
                <td className="tbl__num">{a.item_count}</td>
                <td>
                  <div className="tbl__actions">
                    <Button variant="danger" size="sm" disabled={busy}
                      onClick={() => removeWithConfirm('areas', a, a.name)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}

      {/* --- Colleges -------------------------------------------- */}
      {tab === 'colleges' && (
        <>
          <form className="editrow" onSubmit={(e) => {
            e.preventDefault()
            run(() => api.post('/admin/locations/colleges', {
              areaId: Number(form.areaId),
              name: form.name,
              shortName: form.shortName,
            }), `Added ${form.shortName}`)
          }}>
            <label className="field editrow__grow">
              <span className="field__label">Area</span>
              <select className="select" value={form.areaId || ''} onChange={set('areaId')} required>
                <option value="">Choose an area…</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {a.city_name}</option>
                ))}
              </select>
            </label>
            <label className="field editrow__grow">
              <span className="field__label">Full name</span>
              <input className="input" value={form.name || ''} onChange={set('name')} required />
            </label>
            <label className="field" style={{ width: 160 }}>
              <span className="field__label">Short name</span>
              <input className="input" value={form.shortName || ''} onChange={set('shortName')} required />
            </label>
            <Button variant="primary" type="submit" disabled={busy}>Add college</Button>
          </form>

          <DataTable columns={['College', 'Area', 'Items', 'Users', '']}
            rowCount={colleges.length} empty="No colleges yet.">
            {colleges.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="tbl__strong">{c.short_name}</span>
                  <span className="tbl__sub">{c.name}</span>
                </td>
                <td>{c.area_name}, {c.city_name}</td>
                <td className="tbl__num">{c.item_count}</td>
                <td className="tbl__num">{c.user_count}</td>
                <td>
                  <div className="tbl__actions">
                    <Button variant="danger" size="sm" disabled={busy}
                      onClick={() => removeWithConfirm('colleges', c, c.short_name)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}

      <p className="muted" style={{ marginTop: 'var(--s4)', fontSize: '0.82rem' }}>
        Deleting a city removes its areas and colleges, and detaches every
        listing and member attached to them. You will be shown the exact counts
        and asked to confirm first.
      </p>
    </>
  )
}
