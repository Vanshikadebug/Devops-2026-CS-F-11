import { useEffect, useState } from 'react'
import Button from './Button'
import LocationPicker from './LocationPicker'
import { useAuth } from '../context/authContext'
import { locationService } from '../services/locationService'
import './CampusCard.css'

/**
 * CampusCard -- shows the user's saved campus, and changes it.
 *
 * WHAT IS THIS FILE?
 * The Dashboard's "your campus" panel. In its resting state it is one
 * line of text; press Change and it becomes the same three-step
 * LocationPicker the browse page uses, with a Save button.
 *
 * >>> WHY THE DASHBOARD NEEDED THIS AT ALL <<<
 * Before this, the account card listed name, email, mobile and join
 * date -- and the item cards below printed a location that came from
 * whatever text the seed happened to contain. There was no way to see
 * or set which campus the account belonged to, so `users.college_id`
 * could only ever hold what the seed put there. A profile field with
 * no way to edit it is a field that will be wrong for most users
 * forever.
 *
 * =================================================================
 * WHY THE PICKER IS HIDDEN BEHIND A BUTTON
 * =================================================================
 * The obvious version leaves three dropdowns permanently on the page,
 * pre-filled with the current campus. It is fewer clicks, and it is
 * worse: a control that is always live invites an accidental change
 * to a saved profile field, and the two states -- "this is your
 * campus" and "choose a new campus" -- look identical, so there is no
 * moment where the user can tell whether anything has been saved.
 *
 * An explicit Change -> pick -> Save sequence makes the write a
 * deliberate act, which is what it is.
 *
 * =================================================================
 * WHAT THIS DELIBERATELY DOES *NOT* DO
 * =================================================================
 * It does not touch the browse selection in localStorage. Setting
 * your profile campus and changing what you are currently browsing
 * are two different intentions -- see the long note in
 * locationStorage.js -- and quietly redirecting the Home page because
 * someone edited their profile would be the app moving them without
 * being asked.
 */
function CampusCard({ user }) {
  const { applyUser } = useAuth()

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  /* Seeded from the saved campus so the dropdowns open showing where
     the user already is, rather than three empty selects that imply
     nothing is set. city and area are filled in by the effect below,
     because the user object carries the college's NAME but not the
     ids of its parents -- it has college_id, college_name, area_name,
     city_name, and area_name is a label, not something a <select
     value> can match against. */
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
        /* If the saved college has since been removed from the
           directory, opening the editor with empty dropdowns is the
           correct outcome -- there is nothing to preselect. The user
           picks somewhere that does exist. */
      })

    return () => controller.abort()
  }, [editing, user.college_id])

  const save = async () => {
    setSaving(true)
    setError(null)

    try {
      /* The server re-reads the row after the UPDATE and returns it,
         so the object handed to applyUser already has the resolved
         college_name / area_name / city_name. No second request, and
         no chance of the session showing a name the database does not
         actually hold. */
      const updated = await locationService.saveMyCollege(draft.collegeId)
      applyUser(updated)
      setEditing(false)
    } catch (err) {
      /* Safe to display: errorHandler.js reduces unexpected server
         errors to a generic sentence. A 404 here means the college
         vanished between the dropdown being filled and Save being
         pressed, and its message names the id. */
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
