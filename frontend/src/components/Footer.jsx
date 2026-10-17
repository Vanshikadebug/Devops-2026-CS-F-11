import { Link } from 'react-router-dom'
import { useConfig } from '../app/ConfigProvider'
import './Footer.css'

export default function Footer() {
  const { setting, nav, social } = useConfig()

  const email = setting('support_email')
  const phone = setting('contact_phone')
  const address = setting('contact_address')

  return (
    <footer className="foot shell">
      <div className="foot__grid">
        <div>
          <strong>{setting('site_name', 'ReuseHub')}</strong>
          <p>All rights reserved © {new Date().getFullYear()}</p>
        </div>

        <div>
          {address && <p>{address}</p>}
          {phone && <a className="ulink" href={`tel:${phone}`}>{phone}</a>}
          {!address && !phone && <p>{setting('tagline')}</p>}
        </div>

        <nav aria-label="Footer">
          <Link className="ulink" to="/items">Index</Link>
          <Link className="ulink" to="/items/new">List an item</Link>
          {nav.footer.map((link) => (
            <Link key={link.id} className="ulink" to={link.href}>{link.label}</Link>
          ))}
        </nav>

        <div>
          {social.map((s) => (
            <a key={s.id} className="ulink" href={s.url} target="_blank" rel="noreferrer noopener">
              {s.platform}
            </a>
          ))}
        </div>

        <div className="foot__talk">
          {email ? <a className="ulink" href={`mailto:${email}`}>Let’s talk</a> : <span>Let’s talk</span>}
        </div>
      </div>

      {setting('footer_text') && <p className="foot__note">{setting('footer_text')}</p>}
    </footer>
  )
}
