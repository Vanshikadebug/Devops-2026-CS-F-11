import { NavLink, Routes, Route, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../app/authContext'
import { useConfig } from '../app/ConfigProvider'
import { RANK } from '../app/AdminRoute'

import Dashboard from './pages/Dashboard'
import AdminItems from './pages/AdminItems'
import AdminReports from './pages/AdminReports'
import AdminUsers from './pages/AdminUsers'
import AdminCategories from './pages/AdminCategories'
import AdminConditions from './pages/AdminConditions'
import AdminLocations from './pages/AdminLocations'
import AdminContent from './pages/AdminContent'
import AdminSettings from './pages/AdminSettings'
import AdminAudit from './pages/AdminAudit'

import './admin.css'

/* Each section names the minimum role that may see it, mirroring the guards in
   routes/adminRoutes.js. This only hides links -- the server re-checks every
   request, so a hand-typed URL still 403s. */
const GROUPS = [
  {
    title: 'Overview',
    items: [
      { to: '', label: 'Dashboard', glyph: '◍', min: 'moderator', end: true },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { to: 'items', label: 'Listings', glyph: '▦', min: 'moderator' },
      { to: 'categories', label: 'Categories', glyph: '⬡', min: 'admin' },
      { to: 'conditions', label: 'Conditions', glyph: '◈', min: 'admin' },
    ],
  },
  {
    title: 'Community',
    items: [
      { to: 'users', label: 'Users', glyph: '◎', min: 'admin' },
      { to: 'reports', label: 'Reports', glyph: '⚑', min: 'moderator' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: 'locations', label: 'Locations', glyph: '⌖', min: 'admin' },
      { to: 'content', label: 'Navigation', glyph: '≡', min: 'admin' },
      { to: 'settings', label: 'Settings', glyph: '⚙', min: 'admin' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: 'audit', label: 'Audit log', glyph: '❐', min: 'admin' },
    ],
  },
]


export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { setting } = useConfig()

  const rank = RANK[user?.role] ?? -1
  // Drop a whole group when the role can see none of its entries, so a
  // moderator never gets an empty "Configuration" heading.
  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => rank >= RANK[i.min]) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="adm">
      <aside className="adm__side">
        <Link to="/" className="adm__brand">
          <span className="adm__glyph" aria-hidden="true">{setting('logo_glyph', '♻')}</span>
          <span>
            <strong>{setting('site_name', 'ReuseHub')}</strong>
            <em>admin</em>
          </span>
        </Link>

        <nav className="adm__nav">
          {groups.map((g) => (
            <div className="adm__group" key={g.title}>
              <p className="adm__grouphead">{g.title}</p>
              {g.items.map((s) => (
                <NavLink
                  key={s.to || 'dashboard'}
                  to={s.to}
                  end={s.end}
                  className={({ isActive }) => `adm__link ${isActive ? 'is-active' : ''}`}
                >
                  <span className="adm__linkglyph" aria-hidden="true">{s.glyph}</span>
                  {s.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="adm__foot">
          <div className="adm__me">
            <span className="adm__avatar" aria-hidden="true">
              {user?.name?.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span>
              <strong>{user?.name}</strong>
              <em>{user?.role?.replace('_', ' ')}</em>
            </span>
          </div>
          <div className="adm__footlinks">
            <Link to="/">View site</Link>
            <button type="button" onClick={logout}>Log out</button>
          </div>
        </div>
      </aside>

      <div className="adm__main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="items" element={<AdminItems />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="conditions" element={<AdminConditions />} />
          <Route path="locations" element={<AdminLocations />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  )
}
