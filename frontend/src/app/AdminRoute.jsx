import { Navigate } from 'react-router-dom'
import { useAuth } from './authContext'
import { Spinner } from '../components/ui'

const RANK = { user: 0, moderator: 1, admin: 2, super_admin: 3 }

export default function AdminRoute({ children, minimum = 'moderator' }) {
  const { user, loading } = useAuth()

  if (loading) return <Spinner label="Checking permissions…" />
  if (!user) return <Navigate to="/login" replace />

  if ((RANK[user.role] ?? -1) < RANK[minimum]) {
    return <Navigate to="/" replace />
  }

  return children
}

export { RANK }
