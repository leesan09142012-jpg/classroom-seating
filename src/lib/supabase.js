import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// Supabase가 설정되지 않으면 null (localStorage 폴백 모드)
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export const isSupabaseEnabled = () => supabase !== null

// 디버깅용 로그
if (typeof window !== 'undefined') {
  console.log('[Supabase] enabled:', isSupabaseEnabled(), 'url set:', !!supabaseUrl)
}
