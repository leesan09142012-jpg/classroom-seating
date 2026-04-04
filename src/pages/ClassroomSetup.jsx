import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadLayout as dsLoadLayout, saveLayout as dsSaveLayout } from '../lib/dataService';
import ConfirmDialog from '../components/ConfirmDialog';

function createCell(type = 'seat') {
  return { type, seatNumber: null, pairedWith: null };
}

function buildGrid(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => createCell('seat'))
  );
}

function assignSeatNumbers(grid) {
  let num = 1;
  return grid.map((row, r) =>
    row.map((cell, c) => {
      if (cell.type === 'seat') {
        if (cell.pairedWith) {
          const [pr, pc] = cell.pairedWith;
          if (pr < r || (pr === r && pc < c)) {
            return { ...cell, seatNumber: null };
          }
        }
        const seatNumber = num++;
        return { ...cell, seatNumber };
      }
      return { ...cell, seatNumber: null };
    })
  );
}

function fillPairedNumbers(grid) {
  return grid.map((row, r) =>
    row.map((cell, c) => {
      if (cell.type === 'seat' && cell.pairedWith && cell.seatNumber === null) {
        const [pr, pc] = cell.pairedWith;
        const primary = grid[pr]?.[pc];
        if (primary) {
          return { ...cell, seatNumber: primary.seatNumber };
        }
      }
      return cell;
    })
  );
}

function stripGrid(grid) {
  return grid.map((row) =>
    row.map((cell) => ({
      type: cell.type,
      pairedWith: cell.pairedWith,
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

  // Long-press tracking
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

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
  const grid = useMemo(() => {
    const numbered = assignSeatNumbers(rawGrid);
    return fillPairedNumbers(numbered);
  }, [rawGrid]);

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
    if (r === rows && c === cols) return; // 같은 크기면 무시

    setRawGrid((prev) => {
      const newGrid = buildGrid(r, c);
      // 기존 셀 보존 (겹치는 범위)
      for (let ri = 0; ri < Math.min(r, prev.length); ri++) {
        for (let ci = 0; ci < Math.min(c, prev[ri].length); ci++) {
          const old = prev[ri][ci];
          // 짝꿍이 새 범위를 벗어나면 해제
          if (old.pairedWith) {
            const [pr, pc] = old.pairedWith;
            if (pr >= r || pc >= c) {
              newGrid[ri][ci] = { ...old, pairedWith: null };
              continue;
            }
          }
          newGrid[ri][ci] = { ...old };
        }
      }
      return newGrid;
    });
    setRows(r);
    setCols(c);
  }, [inputRows, inputCols, rows, cols]);

  // Toggle seat/empty
  const toggleCell = useCallback(
    (r, c) => {
      setRawGrid((prev) => {
        const next = prev.map((row) => row.map((cell) => ({ ...cell })));
        const cell = next[r][c];

        // If cell is paired, unpair first
        if (cell.pairedWith) {
          const [pr, pc] = cell.pairedWith;
          if (next[pr]?.[pc]) {
            next[pr][pc] = { ...next[pr][pc], pairedWith: null };
          }
          cell.pairedWith = null;
        }

        cell.type = cell.type === 'seat' ? 'empty' : 'seat';
        return next;
      });
    },
    []
  );

  // Pair / unpair two adjacent cells (2-in-1 desk)
  const handlePair = useCallback(
    (r, c) => {
      setRawGrid((prev) => {
        const next = prev.map((row) => row.map((cell) => ({ ...cell })));
        const cell = next[r][c];

        // If already paired, unpair
        if (cell.pairedWith) {
          const [pr, pc] = cell.pairedWith;
          if (next[pr]?.[pc]) {
            next[pr][pc] = { ...next[pr][pc], pairedWith: null };
          }
          cell.pairedWith = null;
          return next;
        }

        // Only pair seats
        if (cell.type !== 'seat') return prev;

        // Try to pair with right neighbor
        const neighbor = next[r]?.[c + 1];
        if (neighbor && neighbor.type === 'seat' && !neighbor.pairedWith) {
          cell.pairedWith = [r, c + 1];
          neighbor.pairedWith = [r, c];
          return next;
        }

        // Fallback: try left neighbor
        const leftNeighbor = next[r]?.[c - 1];
        if (leftNeighbor && leftNeighbor.type === 'seat' && !leftNeighbor.pairedWith) {
          cell.pairedWith = [r, c - 1];
          leftNeighbor.pairedWith = [r, c];
          return next;
        }

        return prev;
      });
    },
    []
  );

  // Context menu (right-click) for pairing
  const handleContextMenu = useCallback(
    (e, r, c) => {
      e.preventDefault();
      handlePair(r, c);
    },
    [handlePair]
  );

  // Long-press handlers for mobile pairing
  const handlePointerDown = useCallback(
    (r, c) => {
      longPressTriggered.current = false;
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        handlePair(r, c);
      }, 600);
    },
    [handlePair]
  );

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(
    (r, c) => {
      if (longPressTriggered.current) {
        longPressTriggered.current = false;
        return;
      }
      toggleCell(r, c);
    },
    [toggleCell]
  );

  // Reset all to seats
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const handleReset = useCallback(() => {
    setRawGrid(buildGrid(rows, cols));
    setShowResetConfirm(false);
  }, [rows, cols]);

  // Count seats
  const seatCount = useMemo(() => {
    let count = 0;
    grid.forEach((row) =>
      row.forEach((cell) => {
        if (cell.type === 'seat' && cell.seatNumber !== null) {
          // Don't double-count paired seats
          if (cell.pairedWith) {
            const [pr, pc] = cell.pairedWith;
            if (pr < cell._r || (pr === cell._r && pc < cell._c)) return;
          }
          count++;
        }
      })
    );
    // Simpler: just count unique seat numbers
    const nums = new Set();
    grid.forEach((row) =>
      row.forEach((cell) => {
        if (cell.seatNumber !== null) nums.add(cell.seatNumber);
      })
    );
    return nums.size;
  }, [grid]);

  // Check if a cell is the "secondary" in a pair (right side)
  const isSecondary = useCallback((r, c, cell) => {
    if (!cell.pairedWith) return false;
    const [pr, pc] = cell.pairedWith;
    return pc < c || pr < r;
  }, []);

  // Check if a cell is the "primary" in a pair (left side)
  const isPrimary = useCallback((r, c, cell) => {
    if (!cell.pairedWith) return false;
    const [pr, pc] = cell.pairedWith;
    return pc > c || pr > r;
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
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
            클릭: 좌석/복도 전환 &nbsp;|&nbsp; 우클릭 또는 꾹 누르기: 2인 1석 짝꿍 책상 설정
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
            }}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const secondary = isSecondary(r, c, cell);
                const primary = isPrimary(r, c, cell);
                const paired = cell.pairedWith !== null;
                const isEmpty = cell.type === 'empty';

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleClick(r, c)}
                    onContextMenu={(e) => handleContextMenu(e, r, c)}
                    onPointerDown={() => handlePointerDown(r, c)}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className={[
                      'w-14 h-14 md:w-16 md:h-16 flex items-center justify-center',
                      'text-sm font-bold select-none cursor-pointer transition-all duration-150',
                      isEmpty
                        ? 'border-2 border-dashed border-gray-300 bg-gray-100 text-gray-300 rounded-lg hover:border-gray-400'
                        : paired
                          ? [
                              'bg-indigo-100 border-2 border-indigo-400 text-indigo-700',
                              primary
                                ? 'rounded-l-xl rounded-r-none border-r-0'
                                : secondary
                                  ? 'rounded-r-xl rounded-l-none border-l-0'
                                  : 'rounded-xl',
                            ].join(' ')
                          : 'bg-blue-50 border-2 border-blue-300 text-blue-700 rounded-xl hover:bg-blue-100 hover:border-blue-400 hover:shadow-md',
                    ]
                      .flat()
                      .join(' ')}
                    title={
                      isEmpty
                        ? '빈 칸 (복도)'
                        : paired
                          ? `짝꿍 책상 #${cell.seatNumber ?? ''}`
                          : `좌석 #${cell.seatNumber ?? ''}`
                    }
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
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 bg-indigo-100 border-2 border-indigo-400 rounded"></div>
            <span>짝꿍 책상</span>
          </div>
        </div>

        <ConfirmDialog
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          onConfirm={handleReset}
          title="교실 초기화"
          message="모든 좌석 설정(빈칸, 짝꿍 책상)이 초기화됩니다. 정말 초기화할까요?"
          confirmText="초기화"
          cancelText="취소"
          danger
        />
      </div>
    </div>
  );
}
