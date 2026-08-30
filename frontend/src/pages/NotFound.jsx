import { useConfig } from '../app/ConfigProvider'
import { ArrowButton, EmptyState } from '../components/ui'

export default function NotFound() {
  const { setting } = useConfig()

  return (
    <div className="page">
      <div className="shell">
        <EmptyState
          glyph="🧭"
          title="That page does not exist"
          action={<ArrowButton to="/">Back to {setting('site_name', 'ReuseHub')}</ArrowButton>}
        >
          The link may be out of date, or the listing may have been removed.
        </EmptyState>
      </div>
    </div>
  )
}
