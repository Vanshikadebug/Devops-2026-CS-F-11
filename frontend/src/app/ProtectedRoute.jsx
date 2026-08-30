import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../app/authContext'
import { Spinner } from '../components/ui'
import '../pages/AuthForm.css'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="auth__checking">
        <Spinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return children
}

export default ProtectedRoute
