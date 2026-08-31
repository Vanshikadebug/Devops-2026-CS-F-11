import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useConfig } from '../../app/ConfigProvider'
import { assetUrl } from '../../lib/origin'

/* Photo input: drop a file, paste from the clipboard, or click to browse.

   Paste handles two different things people mean by "paste a photo":
   an image on the clipboard (a screenshot, or Copy Image from another page)
   arrives as a File and is uploaded; a copied link arrives as text and is
   accepted as a URL. Both end up as a value in the same field, so the caller
   does not care which happened.

   The paste listener is on the drop zone, not the window: a listener on window
   would hijack Ctrl+V while someone is typing in the description. */

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp'

export default function ImageDrop({ value, onChange, disabled = false }) {
  const { setting } = useConfig()
  const inputId = useId()
  const zoneRef = useRef(null)

  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Shown while the upload is in flight so the picture appears instantly
  // instead of after the round trip.
  const [preview, setPreview] = useState(null)

  const uploadsAllowed = setting('allow_image_uploads', true)
  const maxMb = Number(setting('max_image_mb', 5)) || 0

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const upload = useCallback(async (file) => {
    if (!uploadsAllowed) {
      setError('Photo uploads are turned off. Paste an image link instead.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image')
      return
    }
    if (maxMb > 0 && file.size > maxMb * 1024 * 1024) {
      setError(`Images must be ${maxMb}MB or smaller — that one is ${(file.size / 1024 / 1024).toFixed(1)}MB`)
      return
    }

    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)
    setBusy(true)
    setError(null)

    try {
      const { url } = await api.uploadImage(file)
      onChange(url)
    } catch (err) {
      setError(err.message)
      setPreview(null)
      URL.revokeObjectURL(localUrl)
    } finally {
      setBusy(false)
    }
  }, [maxMb, onChange, uploadsAllowed])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer?.files?.[0]
    if (file) { upload(file); return }
    // Dragging an image out of another tab gives a URL, not a file.
    const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
    if (text) acceptUrl(text)
  }

  const handlePaste = (e) => {
    if (disabled) return
    const file = Array.from(e.clipboardData?.files || [])[0]
    if (file) { e.preventDefault(); upload(file); return }
    const text = e.clipboardData?.getData('text')
    if (text && /^https?:\/\/|^\/(images|uploads)\//i.test(text.trim())) {
      e.preventDefault()
      acceptUrl(text)
    }
  }

  function acceptUrl(raw) {
    const url = raw.trim()
    if (/^http:\/\//i.test(url)) {
      setError('Use an https:// link — browsers block plain http images')
      return
    }
    if (!/^https:\/\/|^\/(images|uploads)\//i.test(url)) {
      setError('That does not look like an image link')
      return
    }
    setError(null)
    setPreview(null)
    onChange(url)
  }

  const clear = () => {
    setPreview(null)
    setError(null)
    onChange('')
  }

  const shown = preview || value

  return (
    <div className="imgdrop">
      {shown ? (
        <figure className={`imgdrop__has ${busy ? 'is-busy' : ''}`}>
          <img src={assetUrl(shown)} alt="" onError={() => setError('That image could not be loaded')} />
          {busy && <span className="imgdrop__badge">Uploading…</span>}
          <figcaption>
            <button type="button" className="imgdrop__link" onClick={clear} disabled={disabled || busy}>
              Remove
            </button>
            <label className="imgdrop__link" htmlFor={inputId}>Replace</label>
          </figcaption>
        </figure>
      ) : (
        <div
          ref={zoneRef}
          className={`imgdrop__zone ${dragging ? 'is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onPaste={handlePaste}
          // tabIndex so the zone can hold focus, which is what makes Ctrl+V
          // land here rather than on the page.
          tabIndex={disabled ? -1 : 0}
          role="button"
          aria-describedby={`${inputId}-hint`}
          onClick={() => !disabled && document.getElementById(inputId)?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              document.getElementById(inputId)?.click()
            }
          }}
        >
          <span className="imgdrop__glyph" aria-hidden="true">{busy ? '⏳' : '🖼'}</span>
          <p className="imgdrop__lead">
            {busy ? 'Uploading…' : <>Drag a photo here, or <span className="imgdrop__cta">browse</span></>}
          </p>
          <p className="imgdrop__sub" id={`${inputId}-hint`}>
            You can also paste one with Ctrl+V — a screenshot or an image link
          </p>
        </div>
      )}

      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload(file)
          // Reset so choosing the same file twice still fires onChange.
          e.target.value = ''
        }}
      />

      {error && <p className="field__error" role="alert">{error}</p>}

      <p className="field__hint">
        {uploadsAllowed
          ? `JPEG, PNG, GIF or WebP${maxMb > 0 ? `, up to ${maxMb}MB` : ''}. Optional.`
          : 'Uploads are turned off — paste an https:// image link. Optional.'}
      </p>
    </div>
  )
}
