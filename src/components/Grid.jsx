import { useMemo } from 'react';

/**
 * 교실 좌석 배치 그리드 컴포넌트 (읽기 전용 뷰)
 *
 * Props:
 *  - layout: { rows, cols, cells } — cells는 2D 배열 [row][col], 각 셀은 { type: 'seat'|'empty', seatNumber }
 *  - assignment: { [seatNumber]: studentName } — 좌석 번호별 학생 이름
 *  - constraints: { fixed: { studentName: seatNumber }, zoned: { studentName: zone } }
 *  - onCellClick: (row, col, cell) => void
 *  - interactive: boolean — 클릭 가능 여부
 */
function Grid({
  layout = { rows: 5, cols: 6, cells: null },
  assignment = {},
  constraints = {},
  onCellClick,
  interactive = false,
}) {
  const { rows, cols, cells } = layout;

  // 셀 매트릭스 생성 (cells가 없으면 기본 좌석으로 채움)
  const grid = useMemo(() => {
    if (cells) return cells;

    let seatNum = 1;
    const matrix = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({ type: 'seat', seatNumber: seatNum++ });
      }
      matrix.push(row);
    }
    return matrix;
  }, [cells, rows, cols]);

  // 제약조건 인덱스 빌드: seatNumber → constraint 정보
  const constraintMap = useMemo(() => {
    const map = {};

    // 고정 좌석 (🔒)
    if (constraints.fixed) {
      Object.entries(constraints.fixed).forEach(([student, seat]) => {
        if (!map[seat]) map[seat] = {};
        map[seat].fixed = student;
      });
    }

    // 영역 지정 (📍)
    if (constraints.zoned) {
      // zoned는 학생→영역 매핑이므로, assignment를 역참조해서 seatNumber 찾기
      Object.entries(constraints.zoned).forEach(([student]) => {
        // assignment에서 해당 학생이 어디 앉아있는지 찾기
        const seat = Object.entries(assignment).find(([, name]) => name === student)?.[0];
        if (seat) {
          if (!map[seat]) map[seat] = {};
          map[seat].zoned = student;
        }
      });
    }

    return map;
  }, [constraints, assignment]);

  const handleClick = (r, c, cell) => {
    if (interactive && onCellClick) {
      onCellClick(r, c, cell);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* 교탁 */}
      <div className="mb-4 mx-auto w-48 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-center text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
        교탁
      </div>

      {/* 좌석 그리드 */}
      <div
        className="grid gap-2 justify-center"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            if (!cell || cell.type === 'empty') {
              return <div key={`${r}-${c}`} className="aspect-square" />;
            }

            const seatNum = cell.seatNumber;
            const studentName = seatNum ? assignment[seatNum] : null;
            const constraint = seatNum ? constraintMap[seatNum] : null;
            // 테두리 색상 결정
            let borderClass = 'border-gray-200 dark:border-gray-600';
            if (constraint?.fixed) {
              borderClass = 'border-red-400 dark:border-red-500 border-2';
            } else if (constraint?.zoned) {
              borderClass = 'border-blue-400 dark:border-blue-500 border-2';
            }

            return (
              <div
                key={`${r}-${c}`}
                onClick={() => handleClick(r, c, cell)}
                className={`
                  relative flex flex-col items-center justify-center
                  aspect-square rounded-lg border p-1
                  text-xs sm:text-sm
                  transition-all duration-150
                  ${borderClass}
                  ${studentName
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'bg-white dark:bg-gray-800'
                  }
                  ${interactive
                    ? 'cursor-pointer hover:shadow-md hover:scale-105 active:scale-95'
                    : ''
                  }
                `}
              >
                {/* 좌석 번호 */}
                <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">
                  {seatNum}
                </span>

                {/* 학생 이름 */}
                {studentName && (
                  <span className="font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center leading-tight mt-0.5">
                    {studentName}
                  </span>
                )}

                {/* 제약조건 배지 */}
                {constraint && (
                  <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
                    {constraint.fixed && (
                      <span className="text-[10px] bg-red-100 dark:bg-red-900/50 rounded-full w-4 h-4 flex items-center justify-center" title={`고정: ${constraint.fixed}`}>
                        🔒
                      </span>
                    )}
                    {constraint.zoned && (
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/50 rounded-full w-4 h-4 flex items-center justify-center" title={`영역 지정: ${constraint.zoned}`}>
                        📍
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 범례 */}
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 border-2 border-red-400 rounded" />
          🔒 고정 좌석
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 border-2 border-blue-400 rounded" />
          📍 영역 지정
        </span>
      </div>
    </div>
  );
}

export default Grid;
