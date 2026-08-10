import { useCallback, useEffect, useState } from 'react'
import { locationService } from '../services/locationService'
import './LocationPicker.css'

/**
 * LocationPicker -- city, then area, then college.
 *
 * WHAT IS THIS FILE?
 * The three cascading dropdowns that decide which campus's items the
 * page is showing. It is a CONTROLLED component: it owns none of the
 * selection, only the three lists it fetched. The parent holds
 * `{ cityId, areaId, collegeId }` and gets a new object through
 * `onChange`.
 *
 * >>> WHY CONTROLLED, RATHER THAN HOLDING THE SELECTION ITSELF? <<<
 * Because the selection is not only this component's business. Home
 * needs it to build the item query, useLocationSelection needs it to
 * persist it, and a logged-in user's saved college needs to flow INTO
 * it. A picker owning its own state would need an onChange to tell the
 * parent AND a prop to be told by the parent -- two sources of truth
 * for one value, which is how you get a dropdown that visibly
 * disagrees with the grid below it.
 *
 * =================================================================
 * THE RULE THAT MAKES CASCADING SELECTS WORK: CLEAR DOWNSTREAM
 * =================================================================
 * Every handler below returns a selection with everything BELOW it set
 * to null. Change the city, and the area and college are wiped.
 *
 * Skipping that is the classic bug in this pattern, and it is not a
 * cosmetic one. Pick Jaipur, then Jagatpura, then SKIT; now change the
 * city to Kota. Without the reset, `collegeId` is still SKIT's -- so
 * the grid shows SKIT's items under a heading that says Kota, and the
 * college dropdown displays a blank because SKIT is not in Kota's
 * list. Nothing errors. The page just lies.
 *
 * WHY NATIVE <select> AND NOT A TYPEAHEAD?
 * With three cities and nine colleges a native select is faster to
 * use, keyboard-accessible for free, and renders as a proper scroll
 * wheel on a phone. A <datalist> would let people type, but typed text
 * has to be matched back to an id, which introduces a "no such city"
 * error state for no gain at this size. When the directory outgrows a
 * dropdown -- a few hundred colleges -- the honest upgrade is a
 * server-side search endpoint, not a longer list.
 */
function LocationPicker({ value, onChange, disabled = false }) {
  const { cityId, areaId, collegeId } = value

  const [cities, setCities] = useState([])
  const [areas, setAreas] = useState([])
  const [colleges, setColleges] = useState([])

  const [citiesStatus, setCitiesStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const retryCities = useCallback(() => setAttempt((n) => n + 1), [])

  /* --- Level 1: cities, once ------------------------------------
     The AbortController is not optional here. StrictMode mounts every
     component twice in development, so without it you get two
     requests per level and the slower response can overwrite the
     newer one. See the longer note in Home.jsx. */
  useEffect(() => {
    const controller = new AbortController()
    setCitiesStatus('loading')

    locationService
      .getCities({ signal: controller.signal })
      .then((data) => {
        setCities(data)
        setCitiesStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setCitiesStatus('error')
      })

    return () => controller.abort()
  }, [attempt])

  /* --- Level 2: areas of the chosen city ------------------------ */
  useEffect(() => {
    if (!cityId) {
      setAreas([])
      return
    }

    const controller = new AbortController()

    locationService
      .getAreas(cityId, { signal: controller.signal })
      .then(setAreas)
      .catch((err) => {
        if (err.name === 'AbortError') return
        /* A 404 here means the saved cityId points at a row that no
           longer exists -- entirely normal after `npm run db:reset`.
           An empty list is the honest render; the parent hook is what
           clears the stale selection. */
        setAreas([])
      })

    return () => controller.abort()
  }, [cityId])

  /* --- Level 3: colleges -----------------------------------------
     Narrowed by area when one is chosen, by city when not. The area
     step is genuinely optional: someone who knows their college but
     not which locality it is filed under can skip straight past it,
     which is why this effect depends on both ids rather than
     requiring areaId. */
  useEffect(() => {
    if (!cityId) {
      setColleges([])
      return
    }

    const controller = new AbortController()

    locationService
      .getColleges({
        areaId: areaId ?? undefined,
        cityId: areaId ? undefined : cityId,
        signal: controller.signal,
      })
      .then(setColleges)
      .catch((err) => {
        if (err.name === 'AbortError') return
        setColleges([])
      })

    return () => controller.abort()
  }, [cityId, areaId])

  /* Native selects hand back strings, always. '' is the placeholder
     option, and Number('') is 0 -- which would sail past a truthiness
     check as a real id in some other codebase. Converted once, here. */
  const toId = (raw) => (raw === '' ? null : Number(raw))

  const pickCity = (raw) =>
    onChange({ cityId: toId(raw), areaId: null, collegeId: null })

  const pickArea = (raw) =>
    onChange({ cityId, areaId: toId(raw), collegeId: null })

  const pickCollege = (raw) =>
    onChange({ cityId, areaId, collegeId: toId(raw) })

  if (citiesStatus === 'error') {
    return (
      <div className="location-picker location-picker--error" role="alert">
        <span>⚠ Could not load the location list.</span>
        <button type="button" className="location-picker__retry" onClick={retryCities}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="location-picker">
      <div className="location-picker__step">
        <label className="location-picker__label" htmlFor="loc-city">
          <span className="location-picker__num">1</span> City
        </label>
        <select
          id="loc-city"
          className="location-picker__select"
          value={cityId ?? ''}
          onChange={(e) => pickCity(e.target.value)}
          disabled={disabled || citiesStatus === 'loading'}
        >
          <option value="">
            {citiesStatus === 'loading' ? 'Loading…' : 'Choose your city'}
          </option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}, {city.state}
            </option>
          ))}
        </select>
      </div>

      <div className="location-picker__step">
        <label className="location-picker__label" htmlFor="loc-area">
          <span className="location-picker__num">2</span> Area
          <span className="location-picker__optional"> · optional</span>
        </label>
        <select
          id="loc-area"
          className="location-picker__select"
          value={areaId ?? ''}
          /* Disabled until there is a city, because an area list with
             no city behind it has nothing to show. A disabled control
             explains the order of the steps better than an empty one
             that silently does nothing when clicked. */
          disabled={disabled || !cityId}
          onChange={(e) => pickArea(e.target.value)}
        >
          <option value="">
            {cityId ? 'All areas' : 'Pick a city first'}
          </option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </div>

      <div className="location-picker__step">
        <label className="location-picker__label" htmlFor="loc-college">
          <span className="location-picker__num">3</span> College
        </label>
        <select
          id="loc-college"
          className="location-picker__select"
          value={collegeId ?? ''}
          disabled={disabled || !cityId}
          onChange={(e) => pickCollege(e.target.value)}
        >
          <option value="">
            {cityId ? 'All colleges nearby' : 'Pick a city first'}
          </option>
          {colleges.map((college) => (
            <option key={college.id} value={college.id}>
              {/* The count is the useful part: it is what tells someone
                  whether choosing this campus is worth the click. It
                  counts AVAILABLE items only, so it never promises rows
                  that have already been given away. */}
              {college.short_name} ({college.item_count})
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default LocationPicker
