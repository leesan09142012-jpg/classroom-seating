import { useState, useCallback, useRef } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import LoginPage from './pages/LoginPage'
import ClassroomSetup from './pages/ClassroomSetup'
import StudentManage from './pages/StudentManage'
import SeatShuffle from './pages/SeatShuffle'
import StudentPicker from './pages/StudentPicker'
import History from './pages/History'

const TABS = [
  { id: 'setup', label: '교실 설정' },
  { id: 'students', label: '학생 관리' },
  { id: 'shuffle', label: '자리 뽑기' },
  { id: 'pick', label: '학생 뽑기' },
  { id: 'history', label: '히스토리' },
]

function TabContent({ activeTab, onUnsavedChange, onNavigate }) {
  switch (activeTab) {
    case 'setup': return <ClassroomSetup onNavigate={onNavigate} />
    case 'students': return <StudentManage />
    case 'shuffle': return <SeatShuffle onUnsavedChange={onUnsavedChange} />
    case 'pick': return <StudentPicker />
    case 'history': return <History />
    default: return null
  }
}

function MainApp() {
  const { user, loading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('setup')
  const hasUnsaved = useRef(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const pendingTab = useRef(null)

  const handleUnsavedChange = useCallback((unsaved) => {
    hasUnsaved.current = unsaved;
  }, [])

  const handleTabClick = useCallback((tabId) => {
    if (activeTab === 'shuffle' && hasUnsaved.current && tabId !== 'shuffle') {
      pendingTab.current = tabId;
      setShowLeaveConfirm(true);
      return;
    }
    setActiveTab(tabId);
  }, [activeTab])

  const handleLeaveConfirm = useCallback(() => {
    hasUnsaved.current = false;
    setShowLeaveConfirm(false);
    if (pendingTab.current) {
      setActiveTab(pendingTab.current);
      pendingTab.current = null;
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-lg">로딩 중...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header + Tab (sticky) */}
      <div className="sticky top-0 z-50">
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-full px-4 mx-auto flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">교실 자리배치</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{user.email}</span>
              <button
                onClick={signOut}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
              >
                로그아웃
              </button>
            </div>
          </div>
        </header>

        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-full px-4 mx-auto flex">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* Content */}
      <main className="max-w-full px-4 mx-auto p-4">
        <TabContent activeTab={activeTab} onUnsavedChange={handleUnsavedChange} onNavigate={handleTabClick} />
      </main>

      <ConfirmDialog
        isOpen={showLeaveConfirm}
        onClose={() => { setShowLeaveConfirm(false); pendingTab.current = null; }}
        onConfirm={handleLeaveConfirm}
        title="저장하지 않은 배치"
        message="현재 자리 뽑기 결과가 저장되지 않았습니다. 저장하지 않고 이동하시겠습니까?"
        confirmText="이동"
        cancelText="취소"
        danger
        confirmLeft
      />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </AuthProvider>
  )
}
