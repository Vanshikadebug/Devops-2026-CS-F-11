import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import FormField from '../components/FormField'
import LocationPicker from '../components/LocationPicker'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { useAuth } from '../app/authContext'
import { itemService } from '../lib/itemService'
import { locationService } from '../lib/locationService'
import { ITEM_STATUSES } from '../lib/display'
import { ImageDrop } from '../components/ui'
import { useConfig } from '../app/ConfigProvider'
import './ItemForm.css'

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

  const location = form.location.trim()
  if (!place.collegeId && !location) {
    errors.location = 'Choose a college, or type where the item can be collected'
  } else if (!place.collegeId && (location.length < 3 || location.length > 150)) {
    errors.location = 'Location must be 3 to 150 characters'
  }

  const imageUrl = form.imageUrl.trim()
  if (imageUrl) {
    if (imageUrl.length > 500) errors.imageUrl = 'Image URL is too long'
    else if (!/^https:\/\/.+/i.test(imageUrl) && !/^\/(images|uploads)\/[A-Za-z0-9._/-]+$/.test(imageUrl))
      errors.imageUrl = 'Upload a photo, or paste an https:// image link'
    else if (imageUrl.includes('..'))
      errors.imageUrl = 'Upload a photo, or paste an https:// image link'
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
  const { id } = useParams()
  const isEdit = Boolean(id)

  const navigate = useNavigate()
  const { user } = useAuth()
  // Categories and conditions are admin-editable rows, so the selects are
  // populated from /api/config rather than a constant.
  const { categories, conditions, setting } = useConfig()

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
      })
  }, [])

  useEffect(() => {
    if (isEdit) return
    if (!user?.college_id) return

    const controller = new AbortController()
    resolveCollege(user.college_id, controller.signal)
    return () => controller.abort()
  }, [isEdit, user, resolveCollege])

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

      navigate(`/items/${saved.id}`, { replace: isEdit })
    } catch (err) {
      if (err.status === 400 && Array.isArray(err.details)) {
        const mapped = {}
        for (const detail of err.details) {
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
              {categories.map((c) => (
                <option key={c.id} value={c.label}>{c.glyph ? `${c.glyph} ` : ''}{c.label}</option>
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
              {conditions.map((c) => (
                <option key={c.id} value={c.label}>{c.label}</option>
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

        {setting('allow_image_url', true) && (
          <div className="field">
            <span className="field__label">Photo</span>
            <ImageDrop
              value={form.imageUrl}
              onChange={(url) => {
                setForm((prev) => ({ ...prev, imageUrl: url }))
                setErrors((prev) => {
                  const next = { ...prev }
                  delete next.imageUrl
                  return next
                })
              }}
              disabled={submitting}
            />
            {errors.imageUrl && (
              <p className="field__error" role="alert">{errors.imageUrl}</p>
            )}
          </div>
        )}

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
