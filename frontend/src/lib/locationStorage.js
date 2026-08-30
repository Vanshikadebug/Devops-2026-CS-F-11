const KEY = 'reusehub.location'

/** Positive integers only -- ids, or nothing. Rejects 0, "3", -1, null. */
function asId(value) {
  return Number.isInteger(value) && value > 0 ? value : null
}

export function getSavedLocation() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { cityId: null, areaId: null, collegeId: null }

    const parsed = JSON.parse(raw)
    return {
      cityId: asId(parsed?.cityId),
      areaId: asId(parsed?.areaId),
      collegeId: asId(parsed?.collegeId),
    }
  } catch {
    return { cityId: null, areaId: null, collegeId: null }
  }
}

export function saveLocation({ cityId, areaId, collegeId }) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        cityId: asId(cityId),
        areaId: asId(areaId),
        collegeId: asId(collegeId),
      }),
    )
  } catch {
    // The choice will not survive a refresh. Not worth breaking the
    // page over: it still holds for this visit, in React state.
  }
}

export function clearSavedLocation() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing useful to do here.
  }
}
