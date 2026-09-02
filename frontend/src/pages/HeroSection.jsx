/**
 * ==============================================================================
 * HERO SECTION COMPONENT (MANIA THEME)
 * ==============================================================================
 * 
 * @file HeroSection.jsx
 * @description The primary marketing banner rendered at the top of the Home page.
 * Displays dynamic configuration settings, promotional imagery, and the 
 * main call-to-action (CTA) to drive user engagement.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useConfig } from '../app/ConfigProvider';
import { ArrowButton, Pill, BentoCard } from '../components/ui';

/**
 * HeroSection
 * 
 * Renders a CSS Grid-based promotional banner. Includes conditional logic 
 * to render social media links and dynamic artwork based on admin settings.
 * 
 * @returns {React.JSX.Element} The rendered hero section.
 */
export default function HeroSection() {
  const { setting, social } = useConfig();
  const heroImage = setting('hero_image_url');

  return (
    <BentoCard span={3} rows={2} className="hero">
      
      {/* Optional Top Badge */}
      {setting('hero_badge') && (
        <Pill tone="sunk" className="hero__badge">
          <span aria-hidden="true">{setting('logo_glyph', '♻')}</span>
          {setting('hero_badge')}
        </Pill>
      )}

      {/* Primary Copy */}
      <h1 className="hero__title">{setting('hero_title')}</h1>

      <div className="hero__lead">
        <span className="hero__step" aria-hidden="true">01</span>
        <span className="hero__rule" aria-hidden="true" />
        <p className="hero__sub muted">{setting('hero_subtitle')}</p>
      </div>

      {/* Call to Action */}
      <div className="hero__cta">
        <ArrowButton to={setting('hero_cta_href', '/items')} size="lg">
          {setting('hero_cta_label', 'Browse items')}
        </ArrowButton>
      </div>

      {/* Marketing Artwork */}
      <div className="hero__art">
        {heroImage && (
          <img 
            src={heroImage} 
            alt="Platform showcase" 
            className="hero__img" 
            loading="lazy"
          />
        )}
      </div>

      {/* Social Media Links */}
      {social && social.length > 0 && (
        <div className="hero__social">
          <span className="muted">Follow us on:</span>
          {social.map((s) => (
            <a 
              key={s.id} 
              href={s.url} 
              target="_blank" 
              rel="noreferrer noopener"
              aria-label={s.platform} 
              title={s.platform} 
              className="hero__socialdot"
            >
              {s.platform.charAt(0)}
            </a>
          ))}
        </div>
      )}
    </BentoCard>
  );
}