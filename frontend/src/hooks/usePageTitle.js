import { useEffect } from 'react'
import { useConfig } from '../app/ConfigProvider'

/**
 * Sets the browser tab title for the current page: "Requests — ReuseHub".
 * With no title (the home page) it uses the admin-set meta title, falling
 * back to the site name. Re-runs when settings load, so the site name in
 * the title always matches the admin setting.
 */
export function usePageTitle(title) {
  const { setting } = useConfig()
  const site = setting('site_name', 'ReuseHub')
  const home = setting('meta_title') || site

  useEffect(() => {
    document.title = title ? `${title} — ${site}` : home
  }, [title, site, home])
}
