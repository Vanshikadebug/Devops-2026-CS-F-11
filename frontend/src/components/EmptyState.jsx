import Button from './Button'
import './EmptyState.css'

/**
 * EmptyState -- what to show when there is nothing to show.
 *
 * WHY IS THIS A COMPONENT?
 * A data-driven page has four possible states, not one:
 *
 *   loading  -> spinner
 *   error    -> "something went wrong" + a way to retry
 *   empty    -> "nothing here yet" + a way forward
 *   ready    -> the actual data
 *
 * Most bugs in beginner React apps come from only handling the last
 * one. An error then renders as a blank white screen, and the user
 * cannot tell a broken app from an app with no data. This component
 * covers the middle two so that every page can handle all four
 * without repeating the markup.
 *
 * The `tone` prop only changes the icon colour: a failure should not
 * look like a success, even at a glance.
 *
 * PROPS
 *   icon    a short symbol or emoji, decorative only
 *   title   the headline -- say what happened
 *   message one or two sentences -- say what to do about it
 *   action  optional { label, onClick } for a retry button
 *   tone    'neutral' | 'error'
 */
function EmptyState({ icon = '📦', title, message, action, tone = 'neutral' }) {
  return (
    <div className={`empty-state empty-state--${tone}`}>
      {/* aria-hidden: a screen reader announcing "package emoji"
          before the heading is noise, not information. The title
          carries the meaning. */}
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>

      <h2 className="empty-state__title">{title}</h2>

      {message && <p className="empty-state__message">{message}</p>}

      {action && (
        <div className="empty-state__action">
          <Button variant="secondary" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  )
}

export default EmptyState
