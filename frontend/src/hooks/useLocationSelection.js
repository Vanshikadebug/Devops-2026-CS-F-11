import { useCallback, useEffect, useRef, useState } from 'react'
import { locationService } from '../lib/locationService'
import { getSavedLocation, saveLocation, clearSavedLocation } from '../lib/locationStorage'
import { useAuth } from '../app/authContext'

export function useLocationSelection() {
  /* Lazy initialiser -- the function form runs once, on mount, instead
     of on every render. Without it, localStorage would be read and
     parsed on every keystroke in the search box. */
  const [selection, setSelection] = useState(getSavedLocation)

  /* The resolved college, for headings. Null when none is chosen or
     while the lookup is in flight. */
  const [college, setCollege] = useState(null)

  const { user, loading: authLoading } = useAuth()

  const seededFor = useRef(null)

  useEffect(() => {
    saveLocation(selection)
  }, [selection])

  useEffect(() => {
    if (authLoading) return
    if (!user?.college_id) return
    if (seededFor.current === user.id) return

    seededFor.current = user.id

    setSelection((current) => (current.collegeId ? current : { ...current, collegeId: user.college_id }))
  }, [authLoading, user])

  useEffect(() => {
    if (!selection.collegeId) {
      setCollege(null)
      return
    }

    const controller = new AbortController()

    locationService
      .getCollege(selection.collegeId, { signal: controller.signal })
      .then((found) => {
        setCollege(found)

        setSelection((current) => {
          if (current.collegeId !== found.id) return current
          if (current.cityId === found.city_id && current.areaId === found.area_id) return current
          return { ...current, cityId: found.city_id, areaId: found.area_id }
        })
      })
      .catch((err) => {
        if (err.name === 'AbortError') return

        if (err.status === 404) {
          clearSavedLocation()
          setCollege(null)
          setSelection({ cityId: null, areaId: null, collegeId: null })
          return
        }

        // A network failure is not evidence the id is wrong. Keep the
        // selection; the grid below will report the error itself.
        setCollege(null)
      })

    return () => controller.abort()
  }, [selection.collegeId])

  const clear = useCallback(() => {
    clearSavedLocation()
    setCollege(null)
    setSelection({ cityId: null, areaId: null, collegeId: null })
  }, [])

  const wasAuthed = useRef(false)
  useEffect(() => {
    if (authLoading) return
    if (user) {
      wasAuthed.current = true
      return
    }
    if (wasAuthed.current) {
      wasAuthed.current = false
      clear()
    }
  }, [authLoading, user, clear])

  return {
    selection,
    setSelection,
    /* Only ever the SERVER's answer, never a name the picker happened
       to have on screen. That is what makes a shared link render
       "SKIT Jaipur" instead of "college 1". */
    college,
    clear,
  }
}
