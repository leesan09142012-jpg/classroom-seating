import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadStudents as dsLoadStudents } from '../lib/dataService';

// ─── 효과음 ────────────────────────────────────────────────────────

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration = 0.05, volume = 0.08, type = 'sine') {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* ignore */ }
}

const playTick = () => playTone(800, 0.04, 0.06);
const playDing = () => {
  playTone(880, 0.15, 0.18);
  setTimeout(() => playTone(1320, 0.25, 0.18), 80);
};

// ─── Main Component ────────────────────────────────────────────────

export default function StudentPicker() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'spinning' | 'done'
  const [displayName, setDisplayName] = useState('');
  const [pickedStudent, setPickedStudent] = useState(null);
  const [pickedHistory, setPickedHistory] = useState([]);
  const [excludePicked, setExcludePicked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const timerRef = useRef(null);
  const slowTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      const data = await dsLoadStudents(user?.id);
      setStudents(data.students || []);
    })();

    const handleStorage = (e) => {
      if (e.key === 'student-list') {
        dsLoadStudents(user?.id).then((d) => setStudents(d.students || []));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  const availableStudents = excludePicked
    ? students.filter((s) => !pickedHistory.includes(s.name))
    : students;

  const handlePick = useCallback(() => {
    if (availableStudents.length === 0) return;

    setPhase('spinning');
    setPickedStudent(null);

    const names = availableStudents.map((s) => s.name);
    const chosen = names[Math.floor(Math.random() * names.length)];

    let tick = 0;
    timerRef.current = setInterval(() => {
      setDisplayName(names[Math.floor(Math.random() * names.length)]);
      if (soundEnabled) playTick();
      tick++;

      if (tick >= 18) {
        clearInterval(timerRef.current);
        timerRef.current = null;

        let slowTick = 0;
        const delays = [150, 220, 320, 450, 600];
        const doSlow = () => {
          if (slowTick >= delays.length) {
            setDisplayName(chosen);
            setPickedStudent(chosen);
            setPhase('done');
            setPickedHistory((prev) => [...prev, chosen]);
            if (soundEnabled) playDing();
            return;
          }
          setDisplayName(names[Math.floor(Math.random() * names.length)]);
          if (soundEnabled) playTick();
          slowTick++;
          slowTimerRef.current = setTimeout(doSlow, delays[slowTick - 1]);
        };
        doSlow();
      }
    }, 65);
  }, [availableStudents, soundEnabled]);

  const handleClearHistory = useCallback(() => {
    setPickedHistory([]);
    setPhase('idle');
    setDisplayName('');
    setPickedStudent(null);
  }, []);

  if (students.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <h2 className="text-lg font-semibold text-gray-600 mb-2">학생 등록 필요</h2>
        <p className="text-sm">먼저 "학생 관리" 탭에서 학생을 등록해주세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">학생 뽑기</h2>
        <button
          onClick={() => setSoundEnabled((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-200"
        >
          {soundEnabled ? '소리 ON' : '소리 OFF'}
        </button>
      </div>

      {/* Options */}
      <label className="flex items-center gap-2 mb-6 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={excludePicked}
          onChange={(e) => setExcludePicked(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600"
        />
        <span className="text-sm text-gray-600">
          뽑힌 학생 제외
          {excludePicked && ` (남은 ${availableStudents.length}/${students.length}명)`}
        </span>
      </label>

      {/* Display */}
      <div className="flex justify-center mb-6">
        <div
          className={`relative w-80 h-56 flex items-center justify-center rounded-2xl overflow-hidden transition-all duration-300 ${
            phase === 'idle'
              ? 'bg-gray-50 border-2 border-dashed border-gray-300'
              : phase === 'spinning'
              ? 'bg-blue-50 border-2 border-blue-400 shadow-lg'
              : 'bg-blue-50 border-2 border-blue-500 shadow-2xl'
          }`}
        >
          {phase === 'idle' && (
            <span className="text-4xl text-gray-300 select-none font-light">?</span>
          )}
          {phase === 'spinning' && (
            <span
              key={displayName}
              className="relative text-3xl font-black text-blue-600 select-none z-10"
              style={{ animation: 'pop 0.1s ease-out' }}
            >
              {displayName}
            </span>
          )}
          {phase === 'done' && (
            <div className="relative text-center z-10" style={{ animation: 'bounce-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              <div className="text-xs font-medium text-blue-600 mb-1">당첨</div>
              <span className="text-5xl font-black text-blue-600 select-none">
                {pickedStudent}
              </span>
            </div>
          )}

          <style>{`
            @keyframes pop { from { transform: scale(0.85); opacity: 0.5; } to { transform: scale(1); opacity: 1; } }
            @keyframes bounce-in {
              0% { transform: scale(0.3); opacity: 0; }
              60% { transform: scale(1.15); }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-center gap-2 mb-6">
        <button
          onClick={handlePick}
          disabled={phase === 'spinning' || availableStudents.length === 0}
          className="px-8 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 hover:shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {phase === 'done' ? '다시 뽑기' : '뽑기'}
        </button>
        {phase === 'done' && (
          <button
            onClick={() => { setPhase('idle'); setDisplayName(''); setPickedStudent(null); }}
            className="px-6 py-3 text-sm font-medium rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
          >
            초기화
          </button>
        )}
      </div>

      {excludePicked && availableStudents.length === 0 && students.length > 0 && (
        <p className="text-center text-sm text-blue-600 mb-4">
          모든 학생을 뽑았습니다.{' '}
          <button onClick={handleClearHistory} className="text-blue-600 underline">초기화</button>
        </p>
      )}

      {/* History */}
      {pickedHistory.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-700">
              뽑기 기록 <span className="text-gray-400 font-normal">({pickedHistory.length}명)</span>
            </span>
            <button
              onClick={handleClearHistory}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded border border-gray-200 hover:border-blue-300"
            >
              기록 초기화
            </button>
          </div>
          <ol className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
            {pickedHistory.map((name, i) => (
              <li
                key={`${i}-${name}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="inline-flex items-center justify-center min-w-[1.25rem] text-[11px] font-medium text-gray-400">
                  {i + 1}
                </span>
                <span className="text-lg font-bold text-gray-900">
                  {name}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
