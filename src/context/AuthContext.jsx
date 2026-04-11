import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseEnabled } from '../lib/supabase'

const AuthContext = createContext(null)

// ─── localStorage 폴백 인증 (Supabase 미설정 시) ───────────────────

const LOCAL_AUTH_KEY = 'local-auth-user'
const LOCAL_ACCOUNTS_KEY = 'local-auth-accounts'

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

function getAccounts() {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts))
}

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
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
    // 로컬 모드: 계정 생성 (비밀번호 해시 저장)
    const accounts = getAccounts()
    if (accounts[email]) {
      return { data: null, error: { message: '이미 등록된 이메일입니다.' } }
    }
    const hashed = await hashPassword(password)
    const localUser = { id: 'local-' + Date.now(), email }
    accounts[email] = { ...localUser, passwordHash: hashed }
    saveAccounts(accounts)
    setLocalUser(localUser)
    setUser(localUser)
    return { data: { user: localUser }, error: null }
  }

  const signIn = async (email, password) => {
    if (isSupabaseEnabled()) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      return { data, error }
    }
    // 로컬 모드: 이메일 + 비밀번호 검증
    const accounts = getAccounts()
    const account = accounts[email]
    if (!account) {
      return { data: null, error: { message: '등록되지 않은 이메일입니다.' } }
    }
    const hashed = await hashPassword(password)
    if (account.passwordHash !== hashed) {
      return { data: null, error: { message: '비밀번호가 올바르지 않습니다.' } }
    }
    const localUser = { id: account.id, email }
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
