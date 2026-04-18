import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { signIn, signUp, signOut, isCloud } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (isSignUp) {
      const { error } = await signUp(email, password)
      if (error) {
        setError(error.message)
      } else {
        // 회원가입 후 자동 로그인 방지 — 로그아웃시키고 로그인 탭으로 전환
        await signOut()
        setMessage('회원가입 완료! 로그인해주세요.')
        setIsSignUp(false)
        setPassword('')
      }
    } else {
      const { error } = await signIn(email, password)
      if (error) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다. 계정이 없으면 회원가입해주세요.')
      }
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">교실 자리배치</h1>
          <p className="text-gray-500">랜덤 자리배치 생성기</p>
        </div>

        <div className="flex mb-6 rounded-lg overflow-hidden border border-gray-200">
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setError(''); setMessage('') }}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              !isSignUp
                ? 'bg-blue-600 text-white'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setError(''); setMessage('') }}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              isSignUp
                ? 'bg-red-600 text-white'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="teacher@school.ac.kr"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="6자 이상"
              minLength={6}
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-blue-50 text-blue-600 text-sm p-3 rounded-lg">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full text-white py-2.5 rounded-lg font-medium disabled:opacity-50 transition-colors ${
              isSignUp
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? '처리 중...' : isSignUp ? '회원가입하기' : '로그인하기'}
          </button>
        </form>


        {!isCloud && (
          <div className="mt-4 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 text-center">
            로컬 모드: 데이터가 이 브라우저에만 저장됩니다.
          </div>
        )}
      </div>
    </div>
  )
}
