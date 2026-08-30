import { Link } from 'react-router-dom'
import { useConfig } from '../app/ConfigProvider'
import './Footer.css'

export default function Footer() {
  const { setting, nav, social } = useConfig()

  const email = setting('support_email')
  const phone = setting('contact_phone')
  const address = setting('contact_address')

  return (
    <footer className="foot">
      <div className="foot__inner shell">
        <div className="foot__brand">
          <span className="foot__glyph" aria-hidden="true">{setting('logo_glyph', '♻')}</span>
          <div>
            <strong>{setting('site_name', 'ReuseHub')}</strong>
            <p className="muted">{setting('tagline')}</p>
          </div>
        </div>

        {nav.footer.length > 0 && (
          <nav className="foot__links" aria-label="Footer">
            {nav.footer.map((link) => (
              <Link key={link.id} to={link.href}>{link.label}</Link>
            ))}
          </nav>
        )}

        {(email || phone || address) && (
          <div className="foot__contact">
            {email && <a href={`mailto:${email}`}>{email}</a>}
            {phone && <a href={`tel:${phone}`}>{phone}</a>}
            {address && <span className="muted">{address}</span>}
          </div>
        )}

        {social.length > 0 && (
          <div className="foot__social">
            {social.map((s) => (
              <a
                key={s.id}
                href={s.url}
                className="foot__socialbtn"
                target="_blank"
                rel="noreferrer noopener"
                aria-label={s.platform}
                title={s.platform}
              >
                {s.platform.charAt(0)}
              </a>
            ))}
          </div>
        )}
      </div>

      {setting('footer_text') && (
        <div className="foot__note shell">
          <p className="muted">{setting('footer_text')}</p>
        </div>
      )}
    </footer>
  )
}
