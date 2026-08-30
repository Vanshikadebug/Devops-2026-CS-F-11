import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { api } from '../lib/api'

const FALLBACK = {
  settings: {
    site_name: 'ReuseHub',
    tagline: 'Give your things a second life',
    logo_glyph: '♻',
    hero_title: 'Give your things a second life.',
    hero_subtitle: '',
    hero_badge: '',
    hero_cta_label: 'Browse items',
    hero_cta_href: '/items',
    featured_limit: 8,
    footer_text: '',
    empty_state_text: 'Nothing here yet.',
    allow_registration: true,
    allow_image_url: true,
    allow_reports: true,
    maintenance_mode: false,
  },
  categories: [],
  conditions: [],
  nav: { header: [], footer: [] },
  social: [],
  cities: [],
}

// Setting key -> CSS custom property. Only these reach the stylesheet.
const THEME_VARS = {
  color_bg: '--bg',
  color_surface: '--surface',
  color_ink: '--ink',
  color_muted: '--muted',
  color_accent: '--accent',
  color_accent_ink: '--accent-ink',
  color_ring: '--ring',
  font_display: '--font-display',
}

const NUMERIC_THEME_VARS = {
  radius_card: '--r-card',
  radius_pill: '--r-pill',
}

const ConfigContext = createContext(null)

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(FALLBACK)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/config')
      // Merge onto FALLBACK so a setting the server has not defined yet never
      // renders as "undefined" in the UI.
      setConfig({
        ...FALLBACK,
        ...res.data,
        settings: { ...FALLBACK.settings, ...res.data.settings },
      })
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const root = document.documentElement
    for (const [key, cssVar] of Object.entries(THEME_VARS)) {
      const value = config.settings[key]
      if (value) root.style.setProperty(cssVar, String(value))
    }
    for (const [key, cssVar] of Object.entries(NUMERIC_THEME_VARS)) {
      const value = config.settings[key]
      if (value !== undefined && value !== null && value !== '') {
        root.style.setProperty(cssVar, `${Number(value)}px`)
      }
    }
  }, [config])

  // Document title and meta description are content, so they follow settings.
  useEffect(() => {
    const { meta_title: title, site_name: name, meta_description: desc } = config.settings
    document.title = title || name || 'ReuseHub'
    if (desc) {
      let tag = document.querySelector('meta[name="description"]')
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', 'description')
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', desc)
    }
  }, [config.settings])

  const value = useMemo(() => {
    const categories = config.categories
    return {
      ...config,
      loading,
      error,
      reload: load,
      // Convenience readers so components do not repeat the lookup.
      setting: (key, fallback = '') => config.settings[key] ?? fallback,
      categoryLabels: categories.map((c) => c.label),
      conditionLabels: config.conditions.map((c) => c.label),
      categoryBySlug: Object.fromEntries(categories.map((c) => [c.slug, c])),
      // Item rows store the label, so art lookups key on it.
      categoryByLabel: Object.fromEntries(categories.map((c) => [c.label, c])),
    }
  }, [config, loading, error, load])

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used inside <ConfigProvider>')
  return ctx
}
