import { useCallback, useEffect, useState } from 'react'
import { locationService } from '../lib/locationService'
import './LocationPicker.css'

function LocationPicker({ value, onChange, disabled = false }) {
  const { cityId, areaId, collegeId } = value

  const [cities, setCities] = useState([])
  const [areas, setAreas] = useState([])
  const [colleges, setColleges] = useState([])

  const [citiesStatus, setCitiesStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const retryCities = useCallback(() => setAttempt((n) => n + 1), [])

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
        setAreas([])
      })

    return () => controller.abort()
  }, [cityId])

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
