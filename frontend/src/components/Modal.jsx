import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './Modal.css'

function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', onKeyDown)

    // Freeze the page behind the dialog.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Remember whatever opened the dialog so focus can go back there.
    const previouslyFocused = document.activeElement

    // Move keyboard focus into the dialog so Tab stays in context
    // and screen readers announce the dialog immediately.
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow

      // Hand focus back to the trigger; without this, keyboard users
      // land on document.body and lose their place on the page.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="modal__backdrop"
      // Clicking the dark area closes the dialog...
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`modal__panel modal__panel--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </header>

        <div className="modal__body">{children}</div>

        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
