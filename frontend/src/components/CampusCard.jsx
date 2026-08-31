import { useEffect, useState } from 'react'
import Button from './Button'
import LocationPicker from './LocationPicker'
import { useAuth } from '../app/authContext'
import { locationService } from '../lib/locationService'
import './CampusCard.css'

function CampusCard({ user }) {
  const { applyUser } = useAuth()

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [draft, setDraft] = useState({
    cityId: null,
    areaId: null,
    collegeId: user.college_id ?? null,
  })

  useEffect(() => {
    if (!editing || !user.college_id) return

    const controller = new AbortController()

    locationService
      .getCollege(user.college_id, { signal: controller.signal })
      .then((found) =>
        setDraft({
          cityId: found.city_id,
          areaId: found.area_id,
          collegeId: found.id,
        }),
      )
      .catch(() => {
      })

    return () => controller.abort()
  }, [editing, user.college_id])

  const save = async () => {
    setSaving(true)
    setError(null)

    try {
      const updated = await locationService.saveMyCollege(draft.collegeId)
      applyUser(updated)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
    setDraft({ cityId: null, areaId: null, collegeId: user.college_id ?? null })
  }

  /* Everything below comes from the user object the SERVER built --
     never from a name this component had on screen a moment ago. */
  const place = [user.area_name, user.city_name].filter(Boolean).join(', ')

  return (
    <section className="campus-card" aria-labelledby="campus-heading">
      <div className="campus-card__head">
        <h2 id="campus-heading" className="campus-card__title">
          Your campus
        </h2>

        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {user.college_id ? 'Change' : 'Set your campus'}
          </Button>
        )}
      </div>

      {!editing && (
        <div className="campus-card__current">
          {user.college_id ? (
            <>
              <span className="campus-card__glyph" aria-hidden="true">🎓</span>
              <div>
                <p className="campus-card__college">{user.college_name}</p>
                {/* `place` is a joined string, so it is '' rather than
                    null when both parts are missing -- and '' is falsy,
                    which is the intended behaviour here: no line at all
                    rather than an empty one. */}
                {place && <p className="campus-card__place">{place}</p>}
              </div>
            </>
          ) : (
            <p className="campus-card__empty">
              No campus set. Choosing one makes your listings easier for
              students near you to find.
            </p>
          )}
        </div>
      )}

      {editing && (
        <div className="campus-card__editor">
          <LocationPicker value={draft} onChange={setDraft} disabled={saving} />

          {error && (
            <p className="campus-card__error" role="alert">
              ⚠ {error}
            </p>
          )}

          <div className="campus-card__actions">
            <Button onClick={save} loading={saving}>
              Save campus
            </Button>
            <Button variant="secondary" onClick={cancel} disabled={saving}>
              Cancel
            </Button>

            {/* Clearing is a real answer, not a failure to choose. The
                column is nullable precisely so "I would rather not
                say" is representable, and the endpoint accepts null
                for the same reason. */}
            {user.college_id && (
              <button
                type="button"
                className="campus-card__clear"
                disabled={saving}
                onClick={() => {
                  setDraft({ cityId: null, areaId: null, collegeId: null })
                }}
              >
                Clear selection
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default CampusCard
