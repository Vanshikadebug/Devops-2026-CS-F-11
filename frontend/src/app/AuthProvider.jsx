import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContext'
import { authService } from '../lib/authService'
import { getToken, setToken, clearToken } from '../lib/tokenStorage'
import { clearSavedLocation } from '../lib/locationStorage'

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(getToken()))

  useEffect(() => {
    if (!getToken()) return

    const controller = new AbortController()

    authService
      .getCurrentUser({ signal: controller.signal })
      .then((restored) => setUser(restored))
      .catch((err) => {
        if (err.name === 'AbortError') return
        clearToken()
        setUser(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  const login = useCallback(async (email, password) => {
    const { token, user: loggedIn } = await authService.login(email, password)
    setToken(token)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const register = useCallback(async (payload) => {
    const { token, user: created } = await authService.register(payload)
    setToken(token)
    setUser(created)
    return created
  }, [])

  const logout = useCallback(() => {
    clearToken()
    clearSavedLocation()
    setUser(null)
  }, [])

  const applyUser = useCallback((updated) => {
    if (!updated) return
    setUser(updated)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      applyUser,
    }),
    [user, loading, login, register, logout, applyUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
