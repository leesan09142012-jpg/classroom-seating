import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadStudents as dsLoadStudents } from '../lib/dataService';

// ─── 간단한 Web Audio 효과음 ──────────────────────────────────────

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTick() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch { /* ignore */ }
}

function playDing() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* ignore */ }
}

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

      if (tick >= 15) {
        clearInterval(timerRef.current);
        timerRef.current = null;

        let slowTick = 0;
        const delays = [150, 200, 280, 380, 500];
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
    }, 70);
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
          className="text-xs text-gray-400 hover:text-gray-600"
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
        <div className="w-80 h-52 flex items-center justify-center rounded-xl border-2 border-gray-200 bg-white">
          {phase === 'idle' && (
            <span className="text-4xl text-gray-200 select-none">?</span>
          )}
          {phase === 'spinning' && (
            <span className="text-2xl font-bold text-blue-600 select-none">
              {displayName}
            </span>
          )}
          {phase === 'done' && (
            <span className="text-3xl font-black text-gray-900 select-none">
              {pickedStudent}
            </span>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-center gap-2 mb-6">
        <button
          onClick={handlePick}
          disabled={phase === 'spinning' || availableStudents.length === 0}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {phase === 'done' ? '다시 뽑기' : '뽑기'}
        </button>
        {phase === 'done' && (
          <button
            onClick={() => { setPhase('idle'); setDisplayName(''); setPickedStudent(null); }}
            className="px-6 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
          >
            초기화
          </button>
        )}
      </div>

      {excludePicked && availableStudents.length === 0 && students.length > 0 && (
        <p className="text-center text-sm text-amber-600 mb-4">
          모든 학생을 뽑았습니다.{' '}
          <button onClick={handleClearHistory} className="text-blue-600 underline">초기화</button>
        </p>
      )}

      {/* History */}
      {pickedHistory.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">뽑기 기록</span>
            <button onClick={handleClearHistory} className="text-xs text-gray-400 hover:text-red-500">
              초기화
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pickedHistory.map((name, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">
                {i + 1}. {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
