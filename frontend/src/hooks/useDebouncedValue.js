import { useEffect, useState } from 'react'

/**
 * useDebouncedValue -- the same value, but it stops changing so often.
 *
 * WHAT PROBLEM DOES THIS SOLVE?
 * The search box is a controlled input, so typing "calculator" sets
 * state ten times. If the fetch effect depended on that state
 * directly, ten requests would leave the browser for one word --
 * nine of them for prefixes nobody wanted the answer to.
 *
 * That is not merely wasteful. Responses can arrive out of order: the
 * request for "calc" can come back after the one for "calculator",
 * and then the grid shows results for a string that is no longer in
 * the box. AbortController in the caller prevents that particular
 * race, but the honest fix is to not send the requests at all.
 *
 * HOW IT WORKS
 * Every change starts a timer and cancels the previous one. The value
 * is only published when the timer is allowed to finish -- meaning
 * the user has stopped typing for `delay` milliseconds. The cleanup
 * function returned from useEffect is what does the cancelling; React
 * runs it before each re-run and on unmount.
 *
 * WHY 300ms IS THE DEFAULT
 * Below about 150ms it stops saving requests, because normal typing
 * has gaps that long. Above about 500ms the results feel detached
 * from the keyboard -- you type, and then something happens. 300ms
 * sits where one request per word is typical and the grid still feels
 * like it is responding to you.
 *
 * NOTE ON WHAT IS *NOT* DEBOUNCED
 * Only the text input. A dropdown change is one deliberate action
 * with one obvious result, so delaying it would just make the UI feel
 * broken. Debouncing is for values that change while the user is
 * mid-thought.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
