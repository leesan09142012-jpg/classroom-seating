import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 1회성 마이그레이션: 계정 분리 이전의 공유 localStorage 키 제거
const LEGACY_KEYS = ['classroom-layout', 'student-list', 'seat-history', 'app-settings', 'loaded-assignment']
const MIGRATION_FLAG = 'legacy-keys-cleared-v1'
if (typeof window !== 'undefined' && !localStorage.getItem(MIGRATION_FLAG)) {
  LEGACY_KEYS.forEach((k) => {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  })
  localStorage.setItem(MIGRATION_FLAG, '1')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
