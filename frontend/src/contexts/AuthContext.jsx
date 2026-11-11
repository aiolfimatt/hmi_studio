import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const TOKEN_KEY = 'hmi_token'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [token, setToken]     = useState(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  // NOTE: the inactivity auto-logout is intentionally NOT applied to this
  // (/edit admin) session — the designer must not be kicked mid-edit. The idle
  // timeout (security.auto_logout_s) is enforced only on the RUNTIME operator
  // credential, in MonitorPage.

  // Validate stored token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    if (!storedToken) {
      setLoading(false)
      return
    }

    axios
      .get('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
      .then(res => {
        setUser(res.data.user ?? res.data)
        setToken(storedToken)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password })
    const { token: newToken, user: newUser, mustChangePassword } = res.data
    // Expired password: DO NOT establish the session yet. The backend issues a
    // usable token (so the password can be changed) but access must be withheld
    // until the operator changes it. Hand the temp token back to the caller to
    // drive the forced-change flow; committing it here would log the user in.
    if (mustChangePassword) {
      return { user: newUser, mustChangePassword: true, token: newToken }
    }
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setUser(newUser)
    return { user: newUser, mustChangePassword: false }
  }, [])

  // Change a password using a not-yet-committed token (the forced-change flow
  // for an expired password, before any session exists). Bypasses the axios
  // client interceptor since the token lives only in the caller's hand.
  const changePasswordWithToken = useCallback(async (tempToken, oldPassword, newPassword) => {
    await axios.post(
      '/api/auth/change-password',
      { old_password: oldPassword, new_password: newPassword },
      { headers: { Authorization: `Bearer ${tempToken}` } },
    )
  }, [])

  const logout = useCallback(() => {
    // Record the logout server-side (best-effort — the token is about to be
    // discarded either way). Fire-and-forget so logout stays instant.
    const t = localStorage.getItem(TOKEN_KEY)
    if (t) axios.post('/api/auth/logout', {}, { headers: { Authorization: `Bearer ${t}` } }).catch(() => {})
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Access is driven by the user's GROUP capabilities (snapshotted into the JWT
  // and returned by /auth/me). editMode = may enter the designer / management
  // area (the old level-3 admin); manageUsers = may administer user accounts.
  const capabilities = user?.capabilities ?? { editMode: false, manageUsers: false }
  const isAdmin = !!capabilities.editMode
  const canManageUsers = !!capabilities.manageUsers

  const value = { user, token, login, changePasswordWithToken, logout, loading, isAdmin, capabilities, canManageUsers }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthContext
