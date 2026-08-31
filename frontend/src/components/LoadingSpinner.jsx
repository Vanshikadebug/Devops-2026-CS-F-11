/**
 * ==============================================================================
 * LOADING SPINNER COMPONENT (MANIA E-COMMERCE THEME)
 * ==============================================================================
 * 
 * @file LoadingSpinner.jsx
 * @description A flexible, accessible loading indicator component that supports 
 * customizable sizing, screen-reader text labels, and full-page layout modes.
 * 
 * ARCHITECTURAL NOTES:
 * - Built with strict accessibility compliance using ARIA roles (`role="status"`) 
 *   and screen-reader-only text (`.sr-only`) for dynamic status announcements.
 * - Supports conditional layout wrapping (`fullPage`) to automatically center 
 *   itself within empty viewport spaces or content containers.
 * - Adheres to rigorous JSDoc typing standards to enhance repository maintainability.
 * ==============================================================================
 */

import React from 'react';
import './LoadingSpinner.css';

/**
 * @typedef {Object} LoadingSpinnerProps
 * @property {'sm'|'md'|'lg'} [size='md'] - The visual scale of the spinner indicator.
 * @property {string} [label='Loading'] - Accessible text announced by screen readers.
 * @property {boolean} [fullPage=false] - When true, wraps the spinner in a full-height container.
 */

/**
 * LoadingSpinner Component
 * 
 * Renders an animated loading ring with configurable size and layout wrappers.
 * 
 * @param {LoadingSpinnerProps} props - Component properties.
 * @returns {React.JSX.Element} The rendered loading indicator.
 */
export default function LoadingSpinner({ 
  size = 'md', 
  label = 'Loading', 
  fullPage = false 
}) {
  // --- 1. Core Spinner Element with Accessibility Attributes ---
  const spinnerElement = (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <span className={`spinner spinner--${size}`} aria-hidden="true" />
      <span className="sr-only" style={{ 
        position: 'absolute', 
        width: '1px', 
        height: '1px', 
        padding: 0, 
        margin: '-1px', 
        overflow: 'hidden', 
        clip: 'rect(0, 0, 0, 0)', 
        whiteSpace: 'nowrap', 
        border: 0 
      }}>
        {label}
      </span>
    </div>
  );

  // --- 2. Layout Wrapper Logic ---
  if (fullPage) {
    return (
      <div className="spinner-page" data-testid="fullpage-spinner-container">
        {spinnerElement}
      </div>
    );
  }

  return spinnerElement;
}