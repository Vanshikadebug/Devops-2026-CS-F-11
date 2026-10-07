import { useConfig } from '../app/ConfigProvider'

/** The dark editorial half of the login / register split screen. */
export default function AuthAside({ title, subtitle }) {
  const { setting } = useConfig()

  return (
    <aside className="auth__aside" aria-hidden="true">
      <span className="auth__mark">{setting('site_name', 'ReuseHub').toUpperCase()}<sup>®</sup></span>
      <p className="auth__big">
        {title}
        <span>{subtitle}</span>
      </p>
      <span className="auth__foot">© {new Date().getFullYear()} — {setting('tagline', 'Give your things a second life')}</span>
    </aside>
  )
}
