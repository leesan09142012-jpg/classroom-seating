import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  loadLayout as dsLoadLayout,
  saveLayout as dsSaveLayout,
  loadStudents as dsLoadStudents,
  saveHistoryRecord as dsSaveHistoryRecord,
} from '../lib/dataService';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';

function createCell(type = 'seat') {
  return { type, seatNumber: null };
}

function buildGrid(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => createCell('seat'))
  );
}

function assignSeatNumbers(grid) {
  let num = 1;
  return grid.map((row) =>
    row.map((cell) => {
      if (cell.type === 'seat') {
        return { ...cell, seatNumber: num++ };
      }
      return { ...cell, seatNumber: null };
    })
  );
}

function stripGrid(grid) {
  return grid.map((row) =>
    row.map((cell) => ({
      type: cell.type,
      seatNumber: null,
    }))
  );
}

export default function ClassroomSetup({ onNavigate }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [initialLoaded, setInitialLoaded] = useState(false);
  const savedRef = useRef(null);

  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(7);
  const [rawGrid, setRawGrid] = useState(() => buildGrid(6, 7));
  const [inputRows, setInputRows] = useState(6);
  const [inputCols, setInputCols] = useState(7);

  // Load from dataService on mount
  useEffect(() => {
    (async () => {
      const data = await dsLoadLayout(user?.id);
      if (data && data.rows && data.cols && data.grid) {
        savedRef.current = data;
        setRows(data.rows);
        setCols(data.cols);
        setRawGrid(data.grid);
        setInputRows(data.rows);
        setInputCols(data.cols);
      }
      setInitialLoaded(true);
    })();
  }, [user?.id]);

  // Numbered grid (derived)
  const grid = useMemo(() => assignSeatNumbers(rawGrid), [rawGrid]);

  // Persist on change (skip before initial load)
  useEffect(() => {
    if (!initialLoaded) return;
    const stripped = stripGrid(rawGrid);
    dsSaveLayout(user?.id, rows, cols, stripped);
    window.dispatchEvent(
      new CustomEvent('classroom-layout-change', {
        detail: { rows, cols, grid: rawGrid },
      })
    );
  }, [rows, cols, rawGrid, initialLoaded, user?.id]);

  // Generate / resize grid (preserves existing cells)
  const handleGenerate = useCallback(() => {
    const r = Math.max(1, Math.min(15, inputRows));
    const c = Math.max(1, Math.min(15, inputCols));
    if (r === rows && c === cols) return;

    setRawGrid((prev) => {
      const newGrid = buildGrid(r, c);
      for (let ri = 0; ri < Math.min(r, prev.length); ri++) {
        for (let ci = 0; ci < Math.min(c, prev[ri].length); ci++) {
          newGrid[ri][ci] = { ...prev[ri][ci] };
        }
      }
      return newGrid;
    });
    setRows(r);
    setCols(c);
  }, [inputRows, inputCols, rows, cols]);

  // 편집 모드: 'erase' = 좌석 삭제, 'draw' = 좌석 생성
  const [editMode, setEditMode] = useState('erase');

  const applyCell = useCallback((r, c) => {
    setRawGrid((prev) => {
      const targetType = editMode === 'erase' ? 'empty' : 'seat';
      if (prev[r][c].type === targetType) return prev;
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));
      next[r][c].type = targetType;
      return next;
    });
  }, [editMode]);

  const handleMouseDown = useCallback((r, c, e) => {
    e.preventDefault();
    applyCell(r, c);
  }, [applyCell]);

  const handleMouseEnter = useCallback((r, c, e) => {
    if (e.buttons !== 1) return;
    applyCell(r, c);
  }, [applyCell]);

  // Reset all to seats
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const handleReset = useCallback(() => {
    setRawGrid(buildGrid(rows, cols));
    setShowResetConfirm(false);
  }, [rows, cols]);

  // Count seats
  const seatCount = useMemo(() => {
    const nums = new Set();
    grid.forEach((row) =>
      row.forEach((cell) => {
        if (cell.seatNumber !== null) nums.add(cell.seatNumber);
      })
    );
    return nums.size;
  }, [grid]);

  // ─── 즉석 자리 뽑기 ─────────────────────────────────────────────
  const [assignment, setAssignment] = useState(null); // { seatNumber: studentName }
  const [revealed, setRevealed] = useState(new Set()); // 공개된 좌석 번호
  const [shuffling, setShuffling] = useState(false);

  const handleRevealSeat = useCallback((seatNumber) => {
    if (!assignment || !assignment[seatNumber]) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(seatNumber)) next.delete(seatNumber);
      else next.add(seatNumber);
      return next;
    });
  }, [assignment]);

  const handleRevealAll = useCallback(() => {
    if (!assignment) return;
    setRevealed(new Set(Object.keys(assignment).map(Number)));
  }, [assignment]);

  const handleHideAll = useCallback(() => setRevealed(new Set()), []);

  const handleQuickShuffle = useCallback(async () => {
    if (seatCount === 0 || shuffling) return;
    setShuffling(true);
    try {
      const data = await dsLoadStudents(user?.id);
      const students = data.students || [];
      if (students.length === 0) {
        showToast('학생이 없습니다. 학생 관리에서 등록해주세요.', 'error');
        setShuffling(false);
        return;
      }

      const seatNums = [];
      grid.forEach((row) => row.forEach((cell) => {
        if (cell.seatNumber !== null) seatNums.push(cell.seatNumber);
      }));

      // 학생을 무작위로 섞고 자리에 배정
      const pool = [...students].sort(() => Math.random() - 0.5);
      const result = {};
      seatNums.forEach((n, i) => {
        if (pool[i]) result[n] = pool[i].name;
      });
      setAssignment(result);
      setRevealed(new Set());
    } catch {
      showToast('자리 뽑기에 실패했습니다.', 'error');
    } finally {
      setShuffling(false);
    }
  }, [seatCount, shuffling, user?.id, grid, showToast]);

  const handleSaveShuffle = useCallback(async () => {
    if (!assignment) return;
    try {
      await dsSaveHistoryRecord(user?.id, {
        date: new Date().toISOString(),
        assignment,
        adjacencyPairs: [],
        layout: { rows, cols, cells: rawGrid },
      });
      showToast('히스토리에 저장되었습니다.', 'success');
    } catch {
      showToast('저장에 실패했습니다.', 'error');
    }
  }, [assignment, user?.id, rows, cols, rawGrid, showToast]);

  const handleClearShuffle = useCallback(() => {
    setAssignment(null);
    setRevealed(new Set());
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-800">교실 설정</h1>
          <div className="flex items-center gap-2">
            {assignment && (
              <>
                <button
                  onClick={revealed.size === Object.keys(assignment).length ? handleHideAll : handleRevealAll}
                  className="px-3 py-2.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  {revealed.size === Object.keys(assignment).length ? '모두 숨기기' : '모두 공개'}
                </button>
                <button
                  onClick={handleSaveShuffle}
                  className="px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
                >
                  저장
                </button>
                <button
                  onClick={handleClearShuffle}
                  className="px-4 py-2.5 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 active:scale-95 transition-all"
                >
                  지우기
                </button>
              </>
            )}
            <button
              onClick={handleQuickShuffle}
              disabled={seatCount === 0 || shuffling}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title={seatCount === 0 ? '좌석이 없습니다' : '즉석 자리 뽑기'}
            >
              {shuffling ? '뽑는 중...' : assignment ? '다시 뽑기' : '자리 뽑기'}
            </button>
            <button
              onClick={() => onNavigate?.('shuffle')}
              className="px-3 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="슬롯머신 효과로 뽑기"
            >
              연출 뽑기
            </button>
          </div>
        </div>

        {/* Grid size controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-gray-600">배열 크기</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={15}
                value={inputRows}
                onChange={(e) => setInputRows(Number(e.target.value) || 1)}
                className="w-16 px-2 py-1.5 text-center border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
              <span className="text-gray-400 font-medium">×</span>
              <input
                type="number"
                min={1}
                max={15}
                value={inputCols}
                onChange={(e) => setInputCols(Number(e.target.value) || 1)}
                className="w-16 px-2 py-1.5 text-center border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleGenerate}
              className="px-4 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors"
            >
              생성
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 active:bg-gray-400 transition-colors"
            >
              초기화
            </button>
            <span className="ml-auto text-sm text-gray-500">
              좌석 수: <span className="font-semibold text-gray-700">{seatCount}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-500">모드:</span>
            <button
              onClick={() => setEditMode('erase')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                editMode === 'erase'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              삭제
            </button>
            <button
              onClick={() => setEditMode('draw')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                editMode === 'draw'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              생성
            </button>
          </div>
        </div>

        {/* Teacher's desk */}
        <div className="flex justify-center mb-6">
          <div className="bg-gray-100 border-2 border-gray-300 rounded-xl px-12 py-3 text-center shadow-sm">
            <span className="text-gray-800 font-bold text-lg tracking-wider">교 탁</span>
          </div>
        </div>

        {/* Grid */}
        <div className="flex justify-center">
          <div
            className="inline-grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              touchAction: 'none',
              userSelect: 'none',
            }}
            onDragStart={(e) => e.preventDefault()}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const isEmpty = cell.type === 'empty';
                const studentName = !isEmpty && assignment ? assignment[cell.seatNumber] : null;
                const hasStudent = !!studentName;
                const isRevealed = hasStudent && revealed.has(cell.seatNumber);

                return (
                  <div
                    key={`${r}-${c}`}
                    onMouseDown={(e) => !assignment && handleMouseDown(r, c, e)}
                    onMouseEnter={(e) => !assignment && handleMouseEnter(r, c, e)}
                    onClick={() => assignment && hasStudent && handleRevealSeat(cell.seatNumber)}
                    className={[
                      'w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center',
                      'text-sm font-bold select-none transition-all duration-150',
                      assignment ? (hasStudent ? 'cursor-pointer' : '') : 'cursor-pointer',
                      isEmpty
                        ? 'border-2 border-dashed border-gray-300 bg-gray-100 text-gray-300 rounded-lg hover:border-gray-400'
                        : isRevealed
                        ? 'bg-blue-500 border-2 border-blue-600 text-white rounded-xl shadow-md'
                        : hasStudent
                        ? 'bg-white border-2 border-blue-400 text-blue-600 rounded-xl hover:bg-blue-50 hover:shadow-md'
                        : 'bg-blue-50 border-2 border-blue-300 text-blue-700 rounded-xl hover:bg-blue-100 hover:border-blue-400 hover:shadow-md',
                    ].join(' ')}
                    title={
                      isEmpty
                        ? '빈 칸 (복도)'
                        : isRevealed
                        ? `${studentName} (좌석 #${cell.seatNumber})`
                        : hasStudent
                        ? `좌석 #${cell.seatNumber} (클릭하여 공개)`
                        : `좌석 #${cell.seatNumber ?? ''}`
                    }
                  >
                    {isEmpty ? (
                      <span className="text-lg">·</span>
                    ) : isRevealed ? (
                      <>
                        <span className="text-[9px] font-normal text-blue-100 leading-none">{cell.seatNumber}</span>
                        <span className="text-xs leading-tight mt-0.5 truncate max-w-full px-0.5">{studentName}</span>
                      </>
                    ) : (
                      <span>{cell.seatNumber}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-6 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 bg-blue-50 border-2 border-blue-300 rounded"></div>
            <span>좌석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 bg-gray-100 border-2 border-dashed border-gray-300 rounded"></div>
            <span>복도 (빈 칸)</span>
          </div>
        </div>

        <ConfirmDialog
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          onConfirm={handleReset}
          title="교실 초기화"
          message="모든 좌석 설정이 초기화됩니다. 정말 초기화할까요?"
          confirmText="초기화"
          cancelText="취소"
          danger
        />
      </div>
    </div>
  );
}
