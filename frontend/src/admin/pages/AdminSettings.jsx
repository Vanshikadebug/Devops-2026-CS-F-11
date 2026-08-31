import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { useConfig } from '../../app/ConfigProvider'
import { Button, Spinner } from '../../components/ui'
import { AdminHead } from '../components/Shared'

/* Every platform setting, grouped by category. The form is built from what the
   API reports rather than a hardcoded field list, so adding a setting to
   settingsModel.DEFAULT_SETTINGS makes it editable here automatically. */

const GROUP_BLURB = {
  branding: 'Names and marks shown across the site.',
  theme: 'Colours and shape. Changes apply everywhere after saving.',
  content: 'Copy on the home page and in empty states.',
  contact: 'Shown in the footer and the maintenance notice.',
  general: 'Site-wide behaviour.',
  users: 'Registration and account rules.',
  items: 'Limits and requirements for listings.',
  moderation: 'Approval and reporting workflow.',
  seo: 'Browser tab title and link previews.',
}

const GROUP_ORDER = ['branding', 'theme', 'content', 'contact', 'general', 'users', 'items', 'moderation', 'seo']

export default function AdminSettings() {
  const { reload: reloadConfig } = useConfig()
  const [groups, setGroups] = useState({})
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/settings')
      setGroups(res.data.groups)
      setDraft(Object.fromEntries(res.data.settings.map((s) => [s.key, s.value])))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const original = useMemo(
    () => Object.fromEntries(Object.values(groups).flat().map((s) => [s.key, s.value])),
    [groups],
  )

  const dirty = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== original[k]),
    [draft, original],
  )

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    if (dirty.length === 0) return
    setSaving(true)
    setError(null)
    try {
      // Only the changed keys, so the audit entry is a list of decisions
      // rather than a diff of the whole form.
      const payload = Object.fromEntries(dirty.map((k) => [k, draft[k]]))
      await api.put('/admin/settings', payload)
      setNotice(`Saved ${dirty.length} change${dirty.length === 1 ? '' : 's'}`)
      await load()
      await reloadConfig()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading settings…" />

  const ordered = GROUP_ORDER.filter((g) => groups[g]).concat(
    Object.keys(groups).filter((g) => !GROUP_ORDER.includes(g)),
  )

  return (
    <>
      <AdminHead
        title="Settings"
        subtitle="Everything configurable about the site, with no code changes."
      />

      {error && <div className="alert alert--error">{error}</div>}
      {notice && <div className="alert alert--ok">{notice}</div>}

      {ordered.map((group) => (
        <section className="setgroup" key={group}>
          <div className="setgroup__head">
            <h2>{group}</h2>
            {GROUP_BLURB[group] && <p>{GROUP_BLURB[group]}</p>}
          </div>

          <div className="setgrid">
            {groups[group].map((s) => (
              <SettingField
                key={s.key}
                setting={s}
                value={draft[s.key]}
                onChange={(v) => set(s.key, v)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="adm__savebar">
        <p>
          {dirty.length === 0
            ? 'No unsaved changes.'
            : `${dirty.length} unsaved change${dirty.length === 1 ? '' : 's'}: ${dirty.slice(0, 4).join(', ')}${dirty.length > 4 ? '…' : ''}`}
        </p>
        <div className="row">
          <Button variant="ghost" size="sm" disabled={dirty.length === 0 || saving}
            onClick={() => setDraft(original)} style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>
            Reset
          </Button>
          <Button variant="accent" disabled={dirty.length === 0 || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </>
  )
}

function SettingField({ setting, value, onChange }) {
  const { key, type, label, description } = setting
  // Long text gets the full row so the operator can see what they are writing.
  const wide = type === 'string' && /title|subtitle|message|text|description|font/.test(key)

  return (
    <div className={`setfield ${wide ? 'setfield--wide' : ''}`}>
      <label className="setfield__label" htmlFor={key}>{label}</label>
      {description && <span className="setfield__desc">{description}</span>}

      {type === 'boolean' ? (
        <label className="switch">
          <input id={key} type="checkbox" checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)} />
          <span>{value ? 'On' : 'Off'}</span>
        </label>
      ) : type === 'color' ? (
        <div className="colorrow">
          <input type="color" value={String(value || '#000000').slice(0, 7)}
            onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour picker`} />
          <input id={key} className="input" value={value ?? ''}
            onChange={(e) => onChange(e.target.value)} placeholder="#d4f34a" />
        </div>
      ) : type === 'number' ? (
        <input id={key} className="input" type="number" value={value ?? 0}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      ) : wide && /message|subtitle|description|text/.test(key) ? (
        <textarea id={key} className="textarea" rows={2} value={value ?? ''}
          onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={key} className="input" value={value ?? ''}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
