import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './Modal.css'

/**
 * Modal -- a dialog layered over the page.
 *
 * USED FOR: confirming a delete, sending a request with a message,
 * and any action worth a deliberate second click.
 *
 * TWO IDEAS WORTH UNDERSTANDING HERE:
 *
 * 1. PORTALS.
 *    createPortal renders the modal into <body> instead of wherever
 *    this component sits in the React tree. Why? A parent with
 *    `overflow: hidden` or a low `z-index` would otherwise clip the
 *    dialog. Escaping to <body> guarantees it floats above all of it,
 *    while React events still bubble as if it were nested normally.
 *
 * 2. ESCAPE + SCROLL LOCK.
 *    Users expect Esc to close a dialog, and expect the page behind
 *    NOT to scroll. Both are handled in the effect below.
 */
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

    // Move keyboard focus into the dialog so Tab stays in context
    // and screen readers announce the dialog immediately.
    panelRef.current?.focus()

    // CLEANUP: React runs this when the modal closes or unmounts.
    // Forgetting it would leave the page permanently unscrollable
    // and pile up duplicate key listeners -- a classic memory leak.
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
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
        // ...but a click INSIDE the panel must not bubble up to the
        // backdrop, or the dialog would close whenever you tried to
        // type in it.
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
