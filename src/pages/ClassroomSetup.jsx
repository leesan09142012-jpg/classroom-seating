import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadLayout as dsLoadLayout, saveLayout as dsSaveLayout } from '../lib/dataService';
import ConfirmDialog from '../components/ConfirmDialog';

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

export default function ClassroomSetup() {
  const { user } = useAuth();
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

  // Toggle seat/empty (click = 토글, drag = 삭제만)
  const dragged = useRef(false);
  const downCell = useRef(null);

  const toggleCell = useCallback((r, c) => {
    setRawGrid((prev) => {
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));
      const cell = next[r][c];
      cell.type = cell.type === 'seat' ? 'empty' : 'seat';
      return next;
    });
  }, []);

  const handleMouseDown = useCallback((r, c, e) => {
    e.preventDefault();
    dragged.current = false;
    downCell.current = `${r}-${c}`;
  }, []);

  const handleMouseEnter = useCallback((r, c, e) => {
    if (e.buttons !== 1) return;
    dragged.current = true;
    // 드래그 중엔 좌석→빈칸만
    setRawGrid((prev) => {
      if (prev[r][c].type === 'empty') return prev;
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));
      next[r][c].type = 'empty';
      return next;
    });
  }, []);

  const handleMouseUp = useCallback((r, c) => {
    // 드래그 없이 같은 칸에서 뗐으면 클릭(토글)
    if (!dragged.current && downCell.current === `${r}-${c}`) {
      toggleCell(r, c);
    }
    downCell.current = null;
  }, [toggleCell]);

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

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-800 mb-6">교실 설정</h1>

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
          <p className="text-xs text-gray-400 mt-2">
            클릭: 좌석/복도 전환
          </p>
        </div>

        {/* Teacher's desk */}
        <div className="flex justify-center mb-6">
          <div className="bg-amber-100 border-2 border-amber-300 rounded-xl px-12 py-3 text-center shadow-sm">
            <span className="text-amber-800 font-bold text-lg tracking-wider">교 탁</span>
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

                return (
                  <div
                    key={`${r}-${c}`}
                    onMouseDown={(e) => handleMouseDown(r, c, e)}
                    onMouseEnter={(e) => handleMouseEnter(r, c, e)}
                    onMouseUp={() => handleMouseUp(r, c)}
                    className={[
                      'w-14 h-14 md:w-16 md:h-16 flex items-center justify-center',
                      'text-sm font-bold select-none cursor-pointer transition-all duration-150',
                      isEmpty
                        ? 'border-2 border-dashed border-gray-300 bg-gray-100 text-gray-300 rounded-lg hover:border-gray-400'
                        : 'bg-blue-50 border-2 border-blue-300 text-blue-700 rounded-xl hover:bg-blue-100 hover:border-blue-400 hover:shadow-md',
                    ].join(' ')}
                    title={isEmpty ? '빈 칸 (복도)' : `좌석 #${cell.seatNumber ?? ''}`}
                  >
                    {isEmpty ? (
                      <span className="text-lg">·</span>
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
