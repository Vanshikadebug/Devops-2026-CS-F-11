import { Link } from 'react-router-dom'
import { useConfig } from '../app/ConfigProvider'
import './Footer.css'

const QUICK_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Browse Items', href: '/items' },
  { label: 'Sell an Item', href: '/sell' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
]

const HELP_LINKS = [
  { label: 'Help Center', href: '/help' },
  { label: 'Frequently Asked Questions', href: '/faq' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms & Conditions', href: '/terms' },
]

const BENEFITS = [
  {
    icon: 'ΓÖ╗',
    title: 'Reuse More',
    description: 'Give pre-loved items a second life.',
  },
  {
    icon: '≡ƒî▒',
    title: 'Waste Less',
    description: 'Make more sustainable choices.',
  },
  {
    icon: '≡ƒñ¥',
    title: 'Connect Locally',
    description: 'Help useful items find new owners.',
  },
]

function FooterBrand({ setting }) {
  const siteName = setting('site_name', 'ReuseHub')
  const tagline = setting(
    'tagline',
    'Give useful things a second chance.'
  )
  const glyph = setting('logo_glyph', 'ΓÖ╗')

  return (
    <div className="foot__brand">
      <Link
        to="/"
        className="foot__brandlink"
        aria-label={`${siteName} homepage`}
      >
        <span className="foot__glyph" aria-hidden="true">
          {glyph}
        </span>

        <span className="foot__brandtext">
          <strong>{siteName}</strong>
          <span className="muted">{tagline}</span>
        </span>
      </Link>

      <p className="foot__description">
        Discover useful pre-loved items, connect with your community,
        and make reuse a part of everyday life.
      </p>
    </div>
  )
}

function FooterLinks({ title, links, className }) {
  return (
    <nav
      className={className}
      aria-label={title}
    >
      <h3 className="foot__heading">{title}</h3>

      <ul className="foot__list">
        {links.map((link) => (
          <li key={link.href}>
            <Link to={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function FooterContact({ setting }) {
  const email = setting('support_email')
  const phone = setting('contact_phone')
  const address = setting('contact_address')

  if (!email && !phone && !address) {
    return null
  }

  return (
    <section
      className="foot__contact"
      aria-labelledby="foot-contact-heading"
    >
      <h3
        id="foot-contact-heading"
        className="foot__heading"
      >
        Get in Touch
      </h3>

      {email && (
        <a
          href={`mailto:${email}`}
          className="foot__contactlink"
        >
          <span aria-hidden="true">Γ£ë</span>
          <span>{email}</span>
        </a>
      )}

      {phone && (
        <a
          href={`tel:${phone}`}
          className="foot__contactlink"
        >
          <span aria-hidden="true">ΓÿÄ</span>
          <span>{phone}</span>
        </a>
      )}

      {address && (
        <p className="foot__address">
          <span aria-hidden="true">Γîû</span>
          <span>{address}</span>
        </p>
      )}
    </section>
  )
}

function FooterBenefits() {
  return (
    <div
      className="foot__benefits"
      aria-label="Our mission"
    >
      {BENEFITS.map((benefit) => (
        <div
          className="foot__benefit"
          key={benefit.title}
        >
          <span
            className="foot__benefiticon"
            aria-hidden="true"
          >
            {benefit.icon}
          </span>

          <div>
            <h3>{benefit.title}</h3>
            <p className="muted">{benefit.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function FooterSocial({ social }) {
  if (!social || social.length === 0) {
    return null
  }

  return (
    <section
      className="foot__socialsection"
      aria-label="Follow ReuseHub"
    >
      <h3 className="foot__heading">Follow Us</h3>

      <div className="foot__social">
        {social.map((item) => (
          <a
            key={item.id}
            href={item.url}
            className="foot__socialbtn"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Visit us on ${item.platform}`}
            title={item.platform}
          >
            <span aria-hidden="true">
              {item.platform.charAt(0).toUpperCase()}
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}

function FooterBottom({ setting }) {
  const siteName = setting('site_name', 'ReuseHub')
  const footerText = setting(
    'footer_text',
    'Small actions can make a big difference.'
  )
  const currentYear = new Date().getFullYear()

  return (
    <div className="foot__bottom shell">
      <p className="muted">
        ┬⌐ {currentYear} {siteName}. All rights reserved.
      </p>

      <p className="foot__note muted">
        {footerText}
      </p>

      <Link
        to="/"
        className="foot__backtop"
        onClick={() => window.scrollTo({
          top: 0,
          behavior: 'smooth',
        })}
        aria-label="Return to homepage"
      >
        Back to top Γåæ
      </Link>
    </div>
  )
}

export default function Footer() {
  const { setting, nav, social } = useConfig()

  const footerLinks = nav?.footer ?? []

  return (
    <footer className="foot">
      <div className="foot__main shell">
        <FooterBrand setting={setting} />

        <FooterLinks
          title="Explore"
          links={
            footerLinks.length > 0
              ? footerLinks
              : QUICK_LINKS
          }
          className="foot__links"
        />

        <FooterLinks
          title="Support"
          links={HELP_LINKS}
          className="foot__helplinks"
        />

        <FooterContact setting={setting} />

        <FooterSocial social={social} />
      </div>

      <div className="foot__mission shell">
        <div className="foot__missionintro">
          <span className="foot__eyebrow">
            A MORE SUSTAINABLE FUTURE
          </span>

          <h2>Good things deserve another life.</h2>

          <p className="muted">
            Every reused item is a small step towards a cleaner,
            more connected community.
          </p>
        </div>

        <FooterBenefits />
      </div>

      <FooterBottom setting={setting} />
    </footer>
  )
}
