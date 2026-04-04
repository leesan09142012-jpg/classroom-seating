import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseEnabled } from '../lib/supabase'

const AuthContext = createContext(null)

// ─── localStorage 폴백 인증 (Supabase 미설정 시) ───────────────────

const LOCAL_AUTH_KEY = 'local-auth-user'

function getLocalUser() {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setLocalUser(user) {
  if (user) {
    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(LOCAL_AUTH_KEY)
  }
}

// ─── Provider ──────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isSupabaseEnabled()) {
      // Supabase 인증
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        setLoading(false)
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(session?.user ?? null)
        }
      )

      return () => subscription.unsubscribe()
    } else {
      // localStorage 폴백: 저장된 유저가 있으면 자동 로그인
      const saved = getLocalUser()
      setUser(saved)
      setLoading(false)
    }
  }, [])

  const signUp = async (email, password) => {
    if (isSupabaseEnabled()) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      return { data, error }
    }
    // 로컬 모드: 즉시 계정 생성
    const localUser = { id: 'local-' + Date.now(), email }
    setLocalUser(localUser)
    setUser(localUser)
    return { data: { user: localUser }, error: null }
  }

  const signIn = async (email, password) => {
    if (isSupabaseEnabled()) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      return { data, error }
    }
    // 로컬 모드: 이메일만 확인하고 로그인
    const localUser = { id: 'local-' + Date.now(), email }
    setLocalUser(localUser)
    setUser(localUser)
    return { data: { user: localUser }, error: null }
  }

  const signOut = async () => {
    if (isSupabaseEnabled()) {
      const { error } = await supabase.auth.signOut()
      return { error }
    }
    setLocalUser(null)
    setUser(null)
    return { error: null }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, isCloud: isSupabaseEnabled() }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
