/**
 * ==============================================================================
 * 404 NOT FOUND VIEW COMPONENT (MANIA E-COMMERCE THEME)
 * ==============================================================================
 * 
 * @file NotFound.jsx
 * @description The fallback view rendered when a user attempts to navigate to a 
 * route that does not exist within the application. Utilizes the shared 
 * EmptyState component and dynamic configuration for branding.
 * 
 * ARCHITECTURAL NOTES:
 * - Employs defensive configuration retrieval via the ConfigProvider hook 
 *   to gracefully fall back to default platform naming ('ReuseHub').
 * - Adheres to rigorous JSDoc documentation standards to maximize maintainability 
 *   and professional code metrics.
 * ==============================================================================
 */

import React from 'react';
import { useConfig } from '../app/ConfigProvider';
import { ArrowButton, EmptyState } from '../components/ui';

/**
 * NotFound Component
 * 
 * Renders an error layout informing the user of a broken or missing route, 
 * complete with a navigational action button returning them to the homepage.
 * 
 * @returns {React.JSX.Element} The rendered 404 error page.
 */
export default function NotFound() {
  // --- 1. Global Context & Configuration ---
  const { setting } = useConfig();

  // --- 2. Dynamic Fallback Variables ---
  const siteName = setting('site_name', 'ReuseHub');
  const primaryCallToActionLabel = `Back to ${siteName}`;

  return (
    <div className="page not-found-page" role="alert">
      <div className="shell not-found-shell">
        
        {/* Reusable Empty State Wrapper for Error Presentation */}
        <EmptyState
          glyph="🧭"
          title="That page does not exist"
          action={
            <ArrowButton to="/" size="lg">
              {primaryCallToActionLabel}
            </ArrowButton>
          }
        >
          The link you followed may be out of date, or the requested listing 
          may have been removed from the platform.
        </EmptyState>
        
      </div>
    </div>
  );
}