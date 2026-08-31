import Button from './Button'
import './EmptyState.css'

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
