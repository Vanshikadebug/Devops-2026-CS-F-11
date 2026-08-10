import { useCallback, useEffect, useRef, useState } from 'react'
import { locationService } from '../services/locationService'
import { getSavedLocation, saveLocation, clearSavedLocation } from '../services/locationStorage'
import { useAuth } from '../context/authContext'

/**
 * useLocationSelection -- owns "which campus am I browsing?".
 *
 * WHAT IS THIS FILE?
 * A custom hook holding the { cityId, areaId, collegeId } selection,
 * plus the three jobs that have to happen around it: remembering it
 * between visits, seeding it from the signed-in user's saved college,
 * and turning a bare collegeId into a name the page can print.
 *
 * WHY A HOOK, AND NOT JUST useState IN Home.jsx?
 * Because those three jobs are subtle, they interact, and Home is not
 * the last page that will need them -- Add Item has to default its
 * college field to the same place, and My Items will want the same
 * heading. Keeping it here means the rules live in one file. A custom
 * hook is exactly a component's logic without its markup, which is
 * what makes it reusable in a way a component is not.
 *
 * =================================================================
 * WHERE THE SELECTION COMES FROM, IN PRIORITY ORDER
 * =================================================================
 *   1. What the user just picked      -- React state, this session
 *   2. What they picked last time     -- localStorage
 *   3. Their saved college, if signed in -- users.college_id
 *   4. Nothing. Show the picker.
 *
 * The order matters, and 2 above 3 is the interesting one. A student
 * whose profile says SKIT might be looking for a desk at MNIT because
 * that is where their cousin studies. Their explicit browsing choice
 * has to outrank their profile, or the app keeps snapping back to the
 * campus they deliberately navigated away from -- one of those
 * behaviours that feels like the page is fighting you.
 *
 * =================================================================
 * THE STALE-ID PROBLEM, WHICH IS NOT HYPOTHETICAL
 * =================================================================
 * localStorage outlives the database. Run `npm run db:reset` and every
 * id in the browser now points at a different row, or at no row at
 * all. Trusting the saved value would render an empty grid under a
 * heading naming a college that no longer exists -- no error, nothing
 * in the console, just a page that is quietly wrong.
 *
 * So a saved collegeId is treated as a CLAIM, not a fact: it is sent
 * to the server to be resolved, and only what comes back is displayed.
 * A 404 clears the whole selection and drops the user back to the
 * picker, which is the one state that is always recoverable.
 */
export function useLocationSelection() {
  /* Lazy initialiser -- the function form runs once, on mount, instead
     of on every render. Without it, localStorage would be read and
     parsed on every keystroke in the search box. */
  const [selection, setSelection] = useState(getSavedLocation)

  /* The resolved college, for headings. Null when none is chosen or
     while the lookup is in flight. */
  const [college, setCollege] = useState(null)

  const { user, loading: authLoading } = useAuth()

  /* Guards the profile seed so it fires once per signed-in user. A
     ref, not state, because changing it must NOT trigger a render --
     it is bookkeeping about what has already happened, not something
     the UI displays. */
  const seededFor = useRef(null)

  /* --- Job 1: remember the choice --------------------------------
     Writes on every change, including back to nothing. Deriving this
     from an effect rather than writing inside each handler means no
     future code path can change the selection and forget to save it. */
  useEffect(() => {
    saveLocation(selection)
  }, [selection])

  /* --- Job 2: seed from the signed-in user's profile --------------
     Waits for authLoading to finish. Running earlier would read `user`
     as null on every refresh -- the exact three-state problem
     AuthProvider exists to solve -- and conclude, wrongly, that there
     is no profile to seed from.

     Only fills a HOLE. If the user has already chosen somewhere, that
     choice stands; see the priority note above. */
  useEffect(() => {
    if (authLoading) return
    if (!user?.college_id) return
    if (seededFor.current === user.id) return

    seededFor.current = user.id

    setSelection((current) => (current.collegeId ? current : { ...current, collegeId: user.college_id }))
  }, [authLoading, user])

  /* --- Job 3: resolve the id into something printable -------------
     Runs whenever the chosen college changes. Also backfills cityId
     and areaId, which is what makes a seeded or shared collegeId
     populate all three dropdowns correctly rather than leaving the
     first two blank above a filled-in third. */
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

        /* The functional form matters: this runs after an await, so a
           `selection` captured when the effect started could already
           be out of date. Reading `current` inside the updater means
           we always merge into the newest value.

           Returning `current` unchanged when nothing needs filling is
           not an optimisation -- a new object identity every time
           would retrigger the persist effect and this one, forever. */
        setSelection((current) => {
          if (current.collegeId !== found.id) return current
          if (current.cityId === found.city_id && current.areaId === found.area_id) return current
          return { ...current, cityId: found.city_id, areaId: found.area_id }
        })
      })
      .catch((err) => {
        if (err.name === 'AbortError') return

        /* 404 means the id is stale -- a re-seeded database, or a
           college removed from the directory. Everything saved
           alongside it is suspect for the same reason, so the whole
           selection goes rather than leaving a half-valid state that
           renders a city heading over somebody else's items. */
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
