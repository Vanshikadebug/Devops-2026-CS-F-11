import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import ProtectedRoute from './ProtectedRoute'
import AdminRoute from './AdminRoute'
import { useAuth } from './authContext'
import { useConfig } from './ConfigProvider'

import Home from '../pages/Home'
import Browse from '../pages/Browse'
import Login from '../pages/Login'
import Register from '../pages/Register'
import Dashboard from '../pages/Dashboard'
import ItemForm from '../pages/ItemForm'
import ItemDetail from '../pages/ItemDetail'
import MyItems from '../pages/MyItems'
import Requests from '../pages/Requests'
import NotFound from '../pages/NotFound'
import AdminLayout from '../admin/AdminLayout'

import '../styles/app.css'

/** There is no point showing a login form to someone already logged in. */
function GuestOnly({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (isAuthenticated) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { setting } = useConfig()
  const location = useLocation()

  // The admin panel supplies its own chrome.
  const bare = location.pathname.startsWith('/admin')

  return (
    <div className="app">
      {!bare && <Navbar />}

      {setting('maintenance_mode', false) && !bare && (
        <div className="app__banner">
          {setting('maintenance_message') || 'Maintenance in progress — changes are temporarily disabled.'}
        </div>
      )}

      <main className={bare ? 'app__main app__main--bare' : 'app__main'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/items" element={<Browse />} />

          <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />

          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

          {/* /items/new before /items/:id -- React Router ranks a literal
              segment above a dynamic one either way, but written in
              first-match order the file still reads as the list of rules
              it is. */}
          <Route path="/items/new" element={<ProtectedRoute><ItemForm /></ProtectedRoute>} />
          <Route path="/items/:id/edit" element={<ProtectedRoute><ItemForm /></ProtectedRoute>} />
          <Route path="/items/:id" element={<ItemDetail />} />

          <Route path="/my-items" element={<ProtectedRoute><MyItems /></ProtectedRoute>} />
          <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />

          {/* /profile showed the same data /dashboard does; redirect rather
              than maintain two pages. `replace` keeps it out of history. */}
          <Route path="/profile" element={<ProtectedRoute><Navigate to="/dashboard" replace /></ProtectedRoute>} />

          <Route path="/admin/*" element={<AdminRoute><AdminLayout /></AdminRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {!bare && <Footer />}
    </div>
  )
}
