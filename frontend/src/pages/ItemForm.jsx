import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import FormField from '../components/FormField'
import LocationPicker from '../components/LocationPicker'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { useAuth } from '../context/authContext'
import { itemService } from '../services/itemService'
import { locationService } from '../services/locationService'
import { CATEGORIES, CONDITIONS, ITEM_STATUSES } from '../utils/constants'
import './ItemForm.css'

/**
 * ItemForm -- list a new item, or edit one you already listed.
 *
 * WHAT IS THIS FILE?
 * ONE component serving two routes:
 *
 *     /items/new        create   -> POST   /api/items
 *     /items/:id/edit   edit     -> PUT    /api/items/:id
 *
 * >>> WHY ONE COMPONENT AND NOT TWO PAGES? <<<
 * Because the two forms are the same eight fields with the same rules,
 * and the only differences are where the initial values come from and
 * which service function runs on submit. Two files would mean every
 * later change to the field list has to be made twice -- and the
 * failure mode of "made twice" is that it eventually gets made once.
 * That is the same reasoning that makes updateRules === createRules on
 * the backend: one description of a valid item, used by both writes.
 *
 * The cost is one `isEdit` branch in three places, all of them named
 * below. That is a price worth paying.
 *
 * =================================================================
 * THE LOCATION HALF IS THE INTERESTING PART OF THIS FORM
 * =================================================================
 * items.college_id is NULLABLE but items.location is NOT NULL, so
 * every item must end up with a human sentence about where it is,
 * whether or not it has a campus. This form offers both routes:
 *
 *   pick a college     -> the server DERIVES "Jagatpura, Jaipur"
 *   type an address    -> the text is stored as given, college is null
 *
 * The text box is disabled while a college is chosen, and the reason
 * is worth stating plainly: if both were sent and both stored, an item
 * could be filed at SKIT while PRINTING "Kota" -- two individually
 * valid fields that permanently contradict each other, with no error
 * anywhere. The server refuses to trust the pair (see resolvePlace in
 * itemController.js); this form refuses to OFFER the pair, so the
 * conflict never even reaches it.
 *
 * >>> WHY THE FORM DOES NOT BUILD THE LOCATION TEXT ITSELF <<<
 * It has the college's name and city right there in the picker's
 * dropdown, so it could send "Jagatpura, Jaipur" and save the server a
 * lookup. It must not. The client's copy of a name is whatever was
 * fetched some seconds ago; the server's is what the database holds
 * now. A value that can be derived from stored data is derived from
 * stored data, by the thing that owns the data.
 *
 * =================================================================
 * WHY VALIDATE HERE WHEN THE BACKEND ALREADY DOES
 * =================================================================
 * Same answer as Register.jsx, and it is worth repeating because it is
 * the single most misunderstood thing in a stack like this: the checks
 * below are a COURTESY, not a control. They answer instantly and point
 * at the field. They can be bypassed by anyone with devtools, so they
 * protect nothing at all.
 *
 * itemValidators.js is the rule, because it runs on a machine the user
 * does not control. These rules deliberately MIRROR it rather than
 * exceed it -- anything stricter here would reject input the server
 * would have accepted, and the user could never work out why.
 */

/**
 * Same limits as backend/validators/itemValidators.js, which took them
 * from the column widths in database/schema.sql.
 * Returns { field: message }; empty means nothing is wrong.
 */
function validate(form, place) {
  const errors = {}

  const name = form.name.trim()
  if (!name) errors.name = 'Item name is required'
  else if (name.length < 3 || name.length > 150)
    errors.name = 'Item name must be 3 to 150 characters'

  const description = form.description.trim()
  if (!description) errors.description = 'Description is required'
  else if (description.length < 10 || description.length > 5000)
    errors.description = 'Description must be 10 to 5000 characters'

  if (!form.category) errors.category = 'Choose a category'
  if (!form.condition) errors.condition = 'Choose a condition'

  /* --- The one cross-field rule ---------------------------------
     Neither field is required ON ITS OWN, which is why the backend
     validator cannot express this: express-validator sees one field
     at a time, so "location is required unless collegeId is present"
     has to live where both are visible. Here, and in resolvePlace on
     the server. */
  const location = form.location.trim()
  if (!place.collegeId && !location) {
    errors.location = 'Choose a college, or type where the item can be collected'
  } else if (!place.collegeId && (location.length < 3 || location.length > 150)) {
    errors.location = 'Location must be 3 to 150 characters'
  }

  /* Mirrors isSafeImageUrl on the backend: an https:// address, or a
     path inside our own /images/ folder. Empty is fine -- most items
     have no photo, and that is a normal listing rather than an
     incomplete one. */
  const imageUrl = form.imageUrl.trim()
  if (imageUrl) {
    if (imageUrl.length > 500) errors.imageUrl = 'Image URL is too long'
    else if (!/^https:\/\/.+/i.test(imageUrl) && !/^\/images\/[A-Za-z0-9._/-]+$/.test(imageUrl))
      errors.imageUrl = 'Use an https:// address, or a /images/ path'
    else if (imageUrl.includes('..'))
      errors.imageUrl = 'Use an https:// address, or a /images/ path'
  }

  return errors
}

const EMPTY_FORM = {
  name: '',
  description: '',
  category: '',
  condition: '',
  location: '',
  imageUrl: '',
  status: 'Available',
}

const EMPTY_PLACE = { cityId: null, areaId: null, collegeId: null }

function ItemForm() {
  /* `id` is present only on /items/:id/edit. Its absence is what puts
     this component in create mode -- there is no `mode` prop, because
     a prop could disagree with the URL and the URL is the thing the
     user can see. */
  const { id } = useParams()
  const isEdit = Boolean(id)

  const navigate = useNavigate()
  const { user } = useAuth()

  const [form, setForm] = useState(EMPTY_FORM)
  const [place, setPlace] = useState(EMPTY_PLACE)

  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  /* Only the EDIT flow has anything to load, so create mode starts
     'ready' and paints instantly. A create form that shows a spinner
     while fetching nothing is a page that feels slower than it is. */
  const [loadStatus, setLoadStatus] = useState(isEdit ? 'loading' : 'ready')
  const [loadError, setLoadError] = useState(null)

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  /* ---------------------------------------------------------------
     RESOLVING A collegeId INTO A FULL PICKER SELECTION
     ---------------------------------------------------------------
     LocationPicker is three cascading dropdowns and it needs all
     three ids to render: with only a collegeId, its city and area
     selects are blank and its college list is EMPTY, because that
     list is fetched per-city. So a bare id -- from the item being
     edited, or from the user's profile -- has to be expanded before
     the picker can display it.

     Only the server can expand it. The id alone does not say which
     city it belongs to, and guessing from a list the browser happens
     to hold is how a page ends up displaying a college under the
     wrong city heading. A 404 here means the id is stale (a
     re-seeded database), so the selection is dropped rather than
     half-applied.
  --------------------------------------------------------------- */
  const resolveCollege = useCallback((collegeId, signal) => {
    if (!collegeId) return

    locationService
      .getCollege(collegeId, { signal })
      .then((college) => {
        setPlace({
          cityId: college.city_id,
          areaId: college.area_id,
          collegeId: college.id,
        })
      })
      .catch(() => {
        /* Deliberately silent. On create this is a convenience seed
           the user never asked for, and on edit the item's own
           `location` text is still shown in the field -- so failing
           to expand the id costs a pre-filled dropdown, not data.
           An error banner here would report a problem the user
           cannot act on. */
      })
  }, [])

  /* --- CREATE: seed the campus from the user's profile ------------
     Most people list items at their own college, so pre-selecting it
     removes three dropdowns from the common path. It is only a
     DEFAULT: changing it is one click, and it is never saved back to
     the profile.

     Deliberately NOT wired to useLocationSelection, even though that
     hook holds a college and would seem to fit. That hook owns "where
     am I BROWSING", and it persists to localStorage -- so listing an
     item at your friend's campus would silently move your browse
     scope there too. Two different questions that happen to have the
     same answer most of the time; conflating them is how a page
     acquires spooky action at a distance. */
  useEffect(() => {
    if (isEdit) return
    if (!user?.college_id) return

    const controller = new AbortController()
    resolveCollege(user.college_id, controller.signal)
    return () => controller.abort()
  }, [isEdit, user, resolveCollege])

  /* --- EDIT: load the item being edited ---------------------------
     The form is populated from the SERVER's copy, never from state
     passed through the router link. A `<Link state={item}>` would
     avoid this request and would hand the form whatever the list page
     was showing -- possibly minutes stale, and absent entirely if the
     user opened the edit URL directly or refreshed. */
  useEffect(() => {
    if (!isEdit) return

    const controller = new AbortController()
    setLoadStatus('loading')
    setLoadError(null)

    itemService
      .getById(id, { signal: controller.signal })
      .then((item) => {
        setForm({
          name: item.name ?? '',
          description: item.description ?? '',
          category: item.category ?? '',
          condition: item.condition ?? '',
          /* Shown only when there is no college -- but kept in state
             either way, so clearing the college reveals the text the
             item had before rather than an empty box. */
          location: item.location ?? '',
          // NULL becomes '' because an <input value={null}> makes
          // React switch the field from controlled to uncontrolled
          // and warn about it in the console.
          imageUrl: item.image_url ?? '',
          status: item.status ?? 'Available',
        })

        if (item.college_id) {
          resolveCollege(item.college_id, controller.signal)
        } else {
          setPlace(EMPTY_PLACE)
        }

        setLoadStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setLoadError(err)
        setLoadStatus('error')
      })

    return () => controller.abort()
  }, [id, isEdit, attempt, resolveCollege])

  const handleChange = (field) => (event) => {
    const { value } = event.target
    setForm((prev) => ({ ...prev, [field]: value }))

    /* Errors appear on submit and clear on typing -- the same rule as
       the auth forms. Validating each keystroke means telling someone
       their description is too short while they are still on the
       first word. */
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    if (formError) setFormError(null)
  }

  const handlePlaceChange = (next) => {
    setPlace(next)
    // Choosing a college answers the location question, so the error
    // about it is no longer true.
    if (errors.location) {
      setErrors((prev) => {
        const rest = { ...prev }
        delete rest.location
        return rest
      })
    }
    if (formError) setFormError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const found = validate(form, place)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return // No round trip for a problem we can already see.
    }

    setSubmitting(true)
    setErrors({})
    setFormError(null)

    /* Only `collegeId` goes to the API. The city and area are
       derivable from it, and itemService.toRequestBody drops them for
       that reason -- see the note there. */
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      condition: form.condition,
      collegeId: place.collegeId,
      location: form.location.trim(),
      imageUrl: form.imageUrl.trim(),
      status: form.status,
    }

    try {
      const saved = isEdit
        ? await itemService.update(id, payload)
        : await itemService.create(payload)

      /* Navigate using the id the SERVER returned, not the one in
         state. On create there is no local id to use; on edit they
         agree. Using the response in both cases means one code path.

         `replace` on edit keeps the form out of the back-button
         history: pressing Back from the item you just saved should
         return to where you came from, not to a form full of values
         that have already been written. */
      navigate(`/items/${saved.id}`, { replace: isEdit })
    } catch (err) {
      /* -----------------------------------------------------------
         TRANSLATING THE SERVER'S REFUSALS
         -----------------------------------------------------------
         Four shapes, and they deserve four different answers:

         400 + details[]  one message per field -- map them back onto
                          the fields so the error appears where the
                          problem is.
         403              the item is not yours. Only reachable by
                          editing the URL, so it is not a message any
                          honest user should see -- but it must say
                          something true rather than "request failed".
         404              the item was deleted while the form was
                          open, in another tab or by the same user.
         anything else    one message above the form.
      ----------------------------------------------------------- */
      if (err.status === 400 && Array.isArray(err.details)) {
        const mapped = {}
        for (const detail of err.details) {
          /* First message per field, not the last: a field failing
             several rules at once lists them most-fundamental-first,
             and telling someone their 2-character name also needs to
             be under 150 is true and useless. */
          if (detail.field && !mapped[detail.field]) {
            mapped[detail.field] = detail.message
          }
        }
        setErrors(mapped)
        // If the details name a field this form does not render, the
        // mapping shows nothing at all. Never fail invisibly.
        if (Object.keys(mapped).length === 0) setFormError(err.message)
      } else if (err.status === 403) {
        setFormError('You can only edit items you listed yourself.')
      } else if (err.status === 404) {
        setFormError(
          isEdit
            ? 'This item no longer exists. It may have been deleted.'
            : err.message,
        )
      } else {
        setFormError(err.message)
      }
    } finally {
      /* In `finally`, so the button re-enables even on the success
         path where navigation is about to unmount this component.
         React 18+ ignores the update on an unmounted component
         silently, and leaving it out would mean a failed navigation
         left a permanently spinning button. */
      setSubmitting(false)
    }
  }

  /* --- The two pre-form states, edit mode only ------------------- */
  if (loadStatus === 'loading') {
    return (
      <div className="container page">
        <LoadingSpinner size="lg" label="Loading item" />
      </div>
    )
  }

  if (loadStatus === 'error') {
    return (
      <div className="container page">
        <EmptyState
          tone="error"
          icon="⚠"
          title={loadError?.status === 404 ? 'Item not found' : 'Could not load this item'}
          message={
            loadError?.status === 404
              ? 'It may have been deleted by its owner.'
              : loadError?.message
          }
          action={
            loadError?.status === 404
              ? { label: 'Back to my items', onClick: () => navigate('/my-items') }
              : { label: 'Try again', onClick: retry }
          }
        />
      </div>
    )
  }

  return (
    <div className="container page item-form-page">
      <header className="item-form__header">
        <h1 className="item-form__title">
          {isEdit ? 'Edit your listing' : 'List an item'}
        </h1>
        <p className="item-form__subtitle">
          {isEdit
            ? 'Change anything below and save. Everyone browsing sees the update immediately.'
            : 'Describe what you are passing on, and say where it can be collected.'}
        </p>
      </header>

      <form className="item-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="item-form__alert" role="alert">
            {formError}
          </div>
        )}

        <FormField
          label="What is it?"
          value={form.name}
          onChange={handleChange('name')}
          error={errors.name}
          placeholder="Casio FX-991EX scientific calculator"
          maxLength={150}
          required
        />

        <div className="field">
          <label className="field__label" htmlFor="item-description">
            Description
            <span className="field__required" aria-hidden="true"> *</span>
          </label>
          {/* A textarea rather than FormField: this is the one field
              where the user needs to see several lines at once, and
              FormField renders an <input>. Everything else about it --
              the label link, the error id, aria-invalid -- is copied
              from that component so the two behave identically. */}
          <textarea
            id="item-description"
            className={`field__input item-form__textarea ${
              errors.description ? 'field__input--error' : ''
            }`}
            value={form.description}
            onChange={handleChange('description')}
            rows={5}
            maxLength={5000}
            placeholder="Condition, what is included, why you are passing it on, anything a collector should know."
            aria-invalid={errors.description ? 'true' : undefined}
            aria-describedby={errors.description ? 'item-description-error' : undefined}
          />
          {errors.description ? (
            <p className="field__error" id="item-description-error" role="alert">
              {errors.description}
            </p>
          ) : (
            <p className="field__hint">
              {form.description.trim().length} characters — at least 10.
            </p>
          )}
        </div>

        <div className="item-form__row">
          <div className="field">
            <label className="field__label" htmlFor="item-category">
              Category
              <span className="field__required" aria-hidden="true"> *</span>
            </label>
            <select
              id="item-category"
              className={`field__input ${errors.category ? 'field__input--error' : ''}`}
              value={form.category}
              onChange={handleChange('category')}
              aria-invalid={errors.category ? 'true' : undefined}
            >
              <option value="">Choose a category</option>
              {/* From constants.js, which mirrors the ENUM in
                  schema.sql. Typing these out here would be a third
                  copy, and the third copy is the one that drifts. */}
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {errors.category && (
              <p className="field__error" role="alert">{errors.category}</p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="item-condition">
              Condition
              <span className="field__required" aria-hidden="true"> *</span>
            </label>
            <select
              id="item-condition"
              className={`field__input ${errors.condition ? 'field__input--error' : ''}`}
              value={form.condition}
              onChange={handleChange('condition')}
              aria-invalid={errors.condition ? 'true' : undefined}
            >
              <option value="">Choose a condition</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {errors.condition && (
              <p className="field__error" role="alert">{errors.condition}</p>
            )}
          </div>
        </div>

        {/* --- Where ---------------------------------------------- */}
        <fieldset className="item-form__fieldset">
          <legend className="item-form__legend">Where can it be collected?</legend>
          <p className="item-form__legend-hint">
            Pick your campus, or leave it blank and type an address instead.
          </p>

          <LocationPicker value={place} onChange={handlePlaceChange} />

          {place.collegeId ? (
            /* The derived text is NOT shown as a value here, because
               this page does not know it -- the server builds it from
               the college's own area and city at write time. Saying
               so is more honest than printing the picker's label and
               implying it is what gets stored. */
            <p className="item-form__derived">
              ✓ The collection point will be recorded from the college you picked.{' '}
              <button
                type="button"
                className="item-form__link-btn"
                onClick={() => handlePlaceChange(EMPTY_PLACE)}
              >
                Type an address instead
              </button>
            </p>
          ) : (
            <FormField
              label="Or type where it can be collected"
              value={form.location}
              onChange={handleChange('location')}
              error={errors.location}
              placeholder="Malviya Nagar, Jaipur"
              maxLength={150}
              hint="Only needed when you have not picked a college above."
            />
          )}

          {/* The cross-field error has nowhere else to go when the
              text input above is hidden by a college selection. */}
          {place.collegeId && errors.location && (
            <p className="field__error" role="alert">{errors.location}</p>
          )}
        </fieldset>

        <FormField
          label="Photo URL"
          type="url"
          value={form.imageUrl}
          onChange={handleChange('imageUrl')}
          error={errors.imageUrl}
          placeholder="https://example.com/photo.jpg"
          maxLength={500}
          /* Says WHY http is refused. Without the reason this reads as
             an arbitrary rule; with it, the user understands that a
             plain-http image would be blocked by their own browser and
             simply never appear. */
          hint="Optional. Must start with https:// — browsers block plain http images on a secure page."
        />

        {/* Status is offered on create because listing something
            already promised to a friend is a real case, and on edit
            because this is where you mark it given away. */}
        <div className="field">
          <label className="field__label" htmlFor="item-status">Availability</label>
          <select
            id="item-status"
            className="field__input"
            value={form.status}
            onChange={handleChange('status')}
          >
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <p className="field__hint">
            Only <strong>Available</strong> items appear in the campus counts and
            the browse grid by default.
          </p>
        </div>

        <div className="item-form__actions">
          <Button type="submit" loading={submitting}>
            {submitting
              ? isEdit ? 'Saving…' : 'Listing…'
              : isEdit ? 'Save changes' : 'List this item'}
          </Button>

          {/* A Link, not a Button with navigate(): cancel is a
              navigation, so it should be middle-clickable and show its
              destination in the status bar like any other link. */}
          <Link
            className="item-form__cancel"
            to={isEdit ? `/items/${id}` : '/my-items'}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

export default ItemForm
