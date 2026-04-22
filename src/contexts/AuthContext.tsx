import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001'

interface User {
  id: string
  email: string
  full_name?: string
}

interface AuthCtx {
  user: User | null
  accessToken: string | null
  loading: boolean
  signUp: (email: string, password: string, fullName?: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const applyTokens = (data: { access_token: string; refresh_token: string; user: User }) => {
    sessionStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    setAccessToken(data.access_token)
    setUser(data.user)
  }

  const clearAuth = () => {
    sessionStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setAccessToken(null)
    setUser(null)
  }

  const tryRefresh = useCallback(async (): Promise<boolean> => {
    const rt = localStorage.getItem('refresh_token')
    if (!rt) return false
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      })
      if (!res.ok) { clearAuth(); return false }
      const data = await res.json()
      sessionStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      setAccessToken(data.access_token)
      // Fetch user profile
      const me = await fetch(`${API}/api/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      if (me.ok) setUser(await me.json())
      return true
    } catch { return false }
  }, [])

  // On mount: try existing access_token or refresh
  useEffect(() => {
    const init = async () => {
      // Handle Supabase email confirmation redirect (#access_token=...&refresh_token=...)
      const hash = window.location.hash
      if (hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.slice(1))
        const at = params.get('access_token')
        const rt = params.get('refresh_token')
        if (at && rt) {
          sessionStorage.setItem('access_token', at)
          localStorage.setItem('refresh_token', rt)
          setAccessToken(at)
          window.history.replaceState(null, '', '/')
          try {
            const me = await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${at}` } })
            if (me.ok) setUser(await me.json())
          } catch { /* ignore */ }
          setLoading(false)
          return
        }
      }

      const at = sessionStorage.getItem('access_token')
      if (at) {
        try {
          const me = await fetch(`${API}/api/me`, {
            headers: { Authorization: `Bearer ${at}` },
          })
          if (me.ok) {
            setAccessToken(at)
            setUser(await me.json())
            setLoading(false)
            return
          }
        } catch { /* fall through to refresh */ }
      }
      await tryRefresh()
      setLoading(false)
    }
    init()
  }, [tryRefresh])

  // Auto-refresh every 50 minutes (tokens last 60 min)
  useEffect(() => {
    const interval = setInterval(() => tryRefresh(), 50 * 60 * 1000)
    return () => clearInterval(interval)
  }, [tryRefresh])

  const signUp = async (email: string, password: string, fullName?: string) => {
    const res = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Signup failed')
    if (data.message === 'confirmation_required') throw new Error('confirmation_required')
    applyTokens(data)
  }

  const signIn = async (email: string, password: string) => {
    const res = await fetch(`${API}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Sign in failed')
    applyTokens(data)
  }

  const signOut = async () => {
    if (accessToken) {
      await fetch(`${API}/auth/signout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {})
    }
    clearAuth()
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
