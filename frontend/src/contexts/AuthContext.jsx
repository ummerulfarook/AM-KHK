import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../api/authApi'

const AuthContext = createContext(null)

/**
 * AuthProvider — wraps the app and provides user session state.
 * On mount, calls /api/auth/me to restore an existing server session.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)  // true while checking existing session

  // Restore session on page load
  useEffect(() => {
    authApi.me()
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const res = await authApi.login(username, password)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
  }, [])

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Hook to consume the auth context. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
