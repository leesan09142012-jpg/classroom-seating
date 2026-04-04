import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadStudents as dsLoadStudents, saveStudents as dsSaveStudents } from '../lib/dataService';
import { IconLock, IconPin, IconLink, IconStudents, IconClipboard, IconWarning } from '../components/Icons';

const PALETTE = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 's' + Date.now() + Math.random().toString(36).slice(2, 8);
}

function createStudent(name) {
  return {
    id: generateId(),
    name: name.trim(),
    constraints: {
      fixedSeat: null,
      fixedZone: null,
      group: null,
    },
  };
}


// ─── Badge Components ───────────────────────────────────────────────

function SeatBadge({ seatNumber }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
      <IconLock className="w-3 h-3" /> {seatNumber}번 고정
    </span>
  );
}

function ZoneBadge({ zone }) {
  const count = Array.isArray(zone.seats) ? zone.seats.length : 0;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
      <IconPin className="w-3 h-3" /> 구역 {count}개
    </span>
  );
}

function GroupBadge({ groupId, groups }) {
  const group = groups.find((g) => g.id === groupId);
  const color = group?.color || '#6B7280';
  const label = group?.label || groupId;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{
        backgroundColor: color + '20',
        color: color,
        borderColor: color + '40',
      }}
    >
      <IconLink className="w-3 h-3" /> {label}
    </span>
  );
}

// ─── Bulk Paste Modal ───────────────────────────────────────────────

function BulkPasteModal({ onClose, onAdd }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const names = text
      .split(/[\n,\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length > 0) {
      onAdd(names);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">학생 일괄 등록</h3>
        <p className="text-sm text-gray-500 mb-4">
          엑셀이나 메모장에서 복사한 학생 이름을 붙여넣으세요.
          <br />
          줄바꿈, 쉼표, 탭으로 구분됩니다.
        </p>
        <textarea
          ref={textareaRef}
          className="w-full h-40 border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={"1 홍길동\n2 김철수\n3 이영희"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Constraint Settings Modal ──────────────────────────────────────

function ConstraintModal({ student, allStudents, groups, onClose, onSave }) {
  const [fixedSeat, setFixedSeat] = useState(student.constraints.fixedSeat ?? '');
  const [zoneSeats, setZoneSeats] = useState(() => {
    const z = student.constraints.fixedZone;
    return Array.isArray(z?.seats) ? new Set(z.seats) : new Set();
  });
  const [group, setGroup] = useState(student.constraints.group || '');
  const [activeTab, setActiveTab] = useState('seat');
  const [newGroupName, setNewGroupName] = useState('');
  const [localGroups, setLocalGroups] = useState(groups);

  // Load classroom layout for visual seat picker
  const [layout, setLayout] = useState(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('classroom-layout');
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.rows && data?.cols && data?.grid) setLayout(data);
      }
    } catch {}
  }, []);

  // Build seat number grid + find which seats are already fixed by other students
  const { grid, fixedByOthers } = useMemo(() => {
    if (!layout) return { grid: null, fixedByOthers: {} };
    let num = 1;
    const g = layout.grid.map((row, r) =>
      row.map((cell, c) => {
        if (cell.type !== 'seat') return { ...cell, seatNumber: null };
        if (cell.pairedWith) {
          const [pr, pc] = cell.pairedWith;
          if (pr < r || (pr === r && pc < c)) return { ...cell, seatNumber: null, _secondary: true };
        }
        return { ...cell, seatNumber: num++ };
      })
    );
    // Fill paired secondary
    const filled = g.map((row, r) =>
      row.map((cell, c) => {
        if (cell._secondary && cell.pairedWith) {
          const [pr, pc] = cell.pairedWith;
          const primary = g[pr]?.[pc];
          if (primary) return { ...cell, seatNumber: primary.seatNumber, _secondary: undefined };
        }
        const { _secondary, ...rest } = cell;
        return rest;
      })
    );
    // Find fixed seats by other students
    const others = {};
    allStudents.forEach((s) => {
      if (s.id !== student.id && s.constraints.fixedSeat != null) {
        others[s.constraints.fixedSeat] = s.name;
      }
    });
    return { grid: filled, fixedByOthers: others };
  }, [layout, allStudents, student.id]);

  const handleSeatClick = (seatNum) => {
    if (!seatNum) return;
    if (fixedByOthers[seatNum]) return; // 다른 학생이 이미 고정
    setFixedSeat(fixedSeat === seatNum ? '' : seatNum);
  };

  const handleSave = () => {
    const constraints = {
      fixedSeat: fixedSeat !== '' ? Number(fixedSeat) : null,
      fixedZone: zoneSeats.size > 0 ? { seats: [...zoneSeats] } : null,
      group: group || null,
    };
    onSave(student.id, constraints, localGroups);
    onClose();
  };

  const handleClearAll = () => {
    setFixedSeat('');
    setZoneSeats(new Set());
    setGroup('');
  };

  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const id = 'g-' + Date.now().toString(36);
    const color = PALETTE[localGroups.length % PALETTE.length];
    setLocalGroups((prev) => [...prev, { id, label: name, color, members: [] }]);
    setGroup(id);
    setNewGroupName('');
  };

  const toggleZoneSeat = (seatNum) => {
    setZoneSeats((prev) => {
      const next = new Set(prev);
      if (next.has(seatNum)) next.delete(seatNum);
      else next.add(seatNum);
      return next;
    });
  };

  const toggleZoneRow = (rowIndex) => {
    if (!grid) return;
    const rowSeatNums = grid[rowIndex]
      .filter((c) => c.seatNumber != null)
      .map((c) => c.seatNumber);
    const uniqueNums = [...new Set(rowSeatNums)];
    const allSelected = uniqueNums.every((n) => zoneSeats.has(n));
    setZoneSeats((prev) => {
      const next = new Set(prev);
      uniqueNums.forEach((n) => allSelected ? next.delete(n) : next.add(n));
      return next;
    });
  };

  // Group members preview
  const groupMembers = useMemo(() => {
    if (!group) return [];
    return allStudents
      .filter((s) => s.id !== student.id && s.constraints.group === group)
      .map((s) => s.name);
  }, [group, allStudents, student.id]);

  const tabs = [
    { id: 'seat', label: '좌석 고정', TabIcon: IconLock },
    { id: 'zone', label: '구역 고정', TabIcon: IconPin },
    { id: 'group', label: '그룹', TabIcon: IconLink },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {student.name} 조건 설정
        </h3>
        <p className="text-sm text-gray-500 mb-4">배치 조건을 설정합니다.</p>

        {/* Tab buttons */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors flex items-center justify-center gap-1 ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.TabIcon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Seat Lock Tab */}
        {activeTab === 'seat' && (
          <div>
            {grid && layout ? (
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  좌석을 클릭하여 고정하세요.
                  {fixedSeat && <span className="ml-1 font-semibold text-blue-600">선택: {fixedSeat}번</span>}
                </p>
                {/* Mini teacher desk */}
                <div className="flex justify-center mb-2">
                  <div className="bg-amber-100 border border-amber-300 rounded-lg px-6 py-1 text-xs font-medium text-amber-700">교탁</div>
                </div>
                {/* Grid */}
                <div
                  className="grid gap-1 justify-center mb-3"
                  style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
                >
                  {grid.map((row, r) =>
                    row.map((cell, c) => {
                      if (!cell || cell.type === 'empty' || cell.seatNumber == null) {
                        return <div key={`${r}-${c}`} className="w-9 h-9" />;
                      }
                      const seatNum = cell.seatNumber;
                      const isSelected = fixedSeat === seatNum;
                      const otherName = fixedByOthers[seatNum];
                      const isOtherFixed = !!otherName;

                      return (
                        <button
                          key={`${r}-${c}`}
                          onClick={() => handleSeatClick(seatNum)}
                          disabled={isOtherFixed}
                          title={isOtherFixed ? `${otherName} 고정석` : `${seatNum}번 좌석`}
                          className={`w-9 h-9 rounded-md text-[11px] font-bold transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white ring-2 ring-blue-300 scale-110'
                              : isOtherFixed
                                ? 'bg-red-100 text-red-400 border border-red-200 cursor-not-allowed'
                                : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                          }`}
                        >
                          {isOtherFixed ? <IconLock className="w-3 h-3" /> : seatNum}
                        </button>
                      );
                    })
                  )}
                </div>
                {/* Legend */}
                <div className="flex justify-center gap-4 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-600 rounded-sm inline-block" /> 선택됨
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm inline-block" /> 다른 학생 고정
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-gray-50 border border-gray-200 rounded-sm inline-block" /> 선택 가능
                  </span>
                </div>
                {fixedSeat && (
                  <button
                    onClick={() => setFixedSeat('')}
                    className="mt-2 w-full text-xs text-gray-500 hover:text-red-500 py-1 transition-colors"
                  >
                    고정 해제
                  </button>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-500 mb-2">교실 설정이 없어 번호로 입력합니다.</p>
                <input
                  type="number"
                  min="1"
                  placeholder="좌석 번호 입력 (예: 3)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={fixedSeat}
                  onChange={(e) => setFixedSeat(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* Zone Lock Tab */}
        {activeTab === 'zone' && (
          <div>
            {grid && layout ? (
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  좌석을 클릭하여 배치 가능 구역을 설정하세요. 줄 번호를 클릭하면 줄 전체를 선택합니다.
                  {zoneSeats.size > 0 && (
                    <span className="ml-1 font-semibold text-green-600">{zoneSeats.size}개 선택됨</span>
                  )}
                </p>
                {/* Mini teacher desk */}
                <div className="flex justify-center mb-2">
                  <div className="bg-amber-100 border border-amber-300 rounded-lg px-6 py-1 text-xs font-medium text-amber-700">교탁</div>
                </div>
                {/* Grid */}
                <div className="space-y-1 mb-3">
                  {grid.map((row, r) => {
                    const rowSeatNums = [...new Set(
                      row.filter((c) => c.seatNumber != null).map((c) => c.seatNumber)
                    )];
                    const allSelected = rowSeatNums.length > 0 && rowSeatNums.every((n) => zoneSeats.has(n));

                    return (
                      <div key={r} className="flex gap-1 justify-center">
                        {/* Row label - click to toggle entire row */}
                        <button
                          onClick={() => toggleZoneRow(r)}
                          className={`w-6 flex items-center justify-center text-[10px] font-bold rounded transition-colors ${
                            allSelected
                              ? 'text-green-600 bg-green-50'
                              : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                          }`}
                          title={`${r + 1}줄 전체 선택`}
                        >
                          {r + 1}
                        </button>
                        {row.map((cell, c) => {
                          if (!cell || cell.type === 'empty' || cell.seatNumber == null) {
                            return <div key={`${r}-${c}`} className="w-9 h-9" />;
                          }
                          const seatNum = cell.seatNumber;
                          const selected = zoneSeats.has(seatNum);
                          return (
                            <button
                              key={`${r}-${c}`}
                              onClick={() => toggleZoneSeat(seatNum)}
                              className={`w-9 h-9 rounded-md text-[11px] font-bold transition-all ${
                                selected
                                  ? 'bg-green-500 text-white ring-1 ring-green-300'
                                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-green-50 hover:border-green-300'
                              }`}
                            >
                              {seatNum}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex justify-center gap-4 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-500 rounded-sm inline-block" /> 배치 가능
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-gray-50 border border-gray-200 rounded-sm inline-block" /> 미선택
                  </span>
                </div>
                {zoneSeats.size > 0 && (
                  <button
                    onClick={() => setZoneSeats(new Set())}
                    className="mt-2 w-full text-xs text-gray-500 hover:text-red-500 py-1 transition-colors"
                  >
                    구역 해제
                  </button>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-500 mb-2">교실 설정이 없습니다. 먼저 교실 설정 탭에서 격자를 만들어주세요.</p>
              </div>
            )}
          </div>
        )}

        {/* Group Tab */}
        {activeTab === 'group' && (
          <div>
            <p className="text-xs text-gray-500 mb-3">같은 그룹의 학생들은 인접하게 배치됩니다.</p>

            {/* Existing groups */}
            {localGroups.length > 0 && (
              <div className="space-y-2 mb-3">
                {localGroups.map((g) => {
                  const selected = group === g.id;
                  const memberNames = g.members
                    .map((mid) => allStudents.find((s) => s.id === mid)?.name)
                    .filter(Boolean);
                  return (
                    <button
                      key={g.id}
                      onClick={() => setGroup(selected ? '' : g.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                        selected ? 'shadow-md scale-[1.01]' : 'hover:shadow-sm'
                      }`}
                      style={{
                        backgroundColor: selected ? g.color + '15' : '#fafafa',
                        borderColor: selected ? g.color : '#e5e7eb',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="text-sm font-semibold" style={{ color: selected ? g.color : '#374151' }}>
                          {g.label}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-auto">{g.members.length}명</span>
                      </div>
                      {memberNames.length > 0 && (
                        <p className="text-[11px] text-gray-500 mt-1 ml-5 truncate">
                          {memberNames.join(', ')}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* New group creation */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="새 그룹 이름 (예: 시력 낮은 학생)"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newGroupName.trim()) {
                    handleCreateGroup();
                  }
                }}
              />
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                + 만들기
              </button>
            </div>

            {group && (
              <button
                onClick={() => setGroup('')}
                className="w-full text-xs text-gray-500 hover:text-red-500 py-1 transition-colors"
              >
                그룹 해제
              </button>
            )}
          </div>
        )}

        {/* Bottom buttons */}
        <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={handleClearAll}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            전체 초기화
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Student Card ───────────────────────────────────────────────────

function StudentCard({ student, groups, index, onDelete, onOpenConstraints }) {
  const { constraints } = student;
  const hasBadges = constraints.fixedSeat != null || constraints.fixedZone != null || constraints.group != null;

  return (
    <div
      className="group flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer"
      onClick={() => onOpenConstraints(student)}
    >
      {/* Index */}
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-medium flex items-center justify-center">
        {index + 1}
      </span>

      {/* Name + Badges */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{student.name}</div>
        {hasBadges && (
          <div className="flex flex-wrap gap-1 mt-1">
            {constraints.fixedSeat != null && <SeatBadge seatNumber={constraints.fixedSeat} />}
            {constraints.fixedZone != null && <ZoneBadge zone={constraints.fixedZone} />}
            {constraints.group != null && <GroupBadge groupId={constraints.group} groups={groups} />}
          </div>
        )}
      </div>

      {/* Actions */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(student.id);
        }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
        title="삭제"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function StudentManage() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [inputName, setInputName] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [constraintTarget, setConstraintTarget] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const inputRef = useRef(null);
  const initialLoaded = useRef(false);

  // Load from dataService on mount
  useEffect(() => {
    (async () => {
      const data = await dsLoadStudents(user?.id);
      setStudents(data.students || []);
      setGroups(data.groups || []);
      initialLoaded.current = true;
    })();
  }, [user?.id]);

  // Persist via dataService on change
  useEffect(() => {
    if (!initialLoaded.current) return;
    dsSaveStudents(user?.id, { students, groups });
  }, [students, groups, user?.id]);

  // Rebuild groups when student constraints change (preserve label/color from existing groups)
  const rebuildGroups = useCallback((studentList, existingGroups) => {
    const existingMap = {};
    (existingGroups || groups).forEach((g) => { existingMap[g.id] = g; });

    const groupMap = {};
    for (const s of studentList) {
      if (s.constraints.group) {
        const gId = s.constraints.group;
        if (!groupMap[gId]) {
          const existing = existingMap[gId];
          groupMap[gId] = {
            id: gId,
            label: existing?.label || gId,
            color: existing?.color || PALETTE[Object.keys(groupMap).length % PALETTE.length],
            members: [],
          };
        }
        groupMap[gId].members.push(s.id);
      }
    }
    return Object.values(groupMap);
  }, [groups]);

  const checkDuplicate = useCallback(
    (name) => {
      return students.some((s) => s.name === name.trim());
    },
    [students]
  );

  const addStudent = useCallback(
    (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      if (checkDuplicate(trimmed)) {
        setDuplicateWarning(`"${trimmed}" 이름이 이미 존재합니다. 그래도 추가되었습니다.`);
        setTimeout(() => setDuplicateWarning(''), 3000);
      }

      const newStudent = createStudent(trimmed);
      setStudents((prev) => {
        const next = [...prev, newStudent];
        setGroups(rebuildGroups(next));
        return next;
      });
    },
    [checkDuplicate, rebuildGroups]
  );

  const handleInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && inputName.trim()) {
        e.preventDefault();
        addStudent(inputName);
        setInputName('');
        // Keep focus for continuous entry
        inputRef.current?.focus();
      }
    },
    [inputName, addStudent]
  );

  const handleAddClick = useCallback(() => {
    if (inputName.trim()) {
      addStudent(inputName);
      setInputName('');
      inputRef.current?.focus();
    }
  }, [inputName, addStudent]);

  const handleBulkAdd = useCallback(
    (names) => {
      const dupes = names.filter((n) => checkDuplicate(n));
      if (dupes.length > 0) {
        setDuplicateWarning(`중복 이름 ${dupes.length}개가 포함되어 있습니다. 그래도 모두 추가되었습니다.`);
        setTimeout(() => setDuplicateWarning(''), 3000);
      }

      const newStudents = names.map((name) => createStudent(name));
      setStudents((prev) => {
        const next = [...prev, ...newStudents];
        setGroups(rebuildGroups(next));
        return next;
      });
    },
    [checkDuplicate, rebuildGroups]
  );

  const deleteStudent = useCallback(
    (id) => {
      setStudents((prev) => {
        const next = prev.filter((s) => s.id !== id);
        setGroups(rebuildGroups(next));
        return next;
      });
    },
    [rebuildGroups]
  );

  const handleSaveConstraints = useCallback(
    (studentId, constraints, updatedGroups) => {
      setStudents((prev) => {
        const next = prev.map((s) =>
          s.id === studentId ? { ...s, constraints } : s
        );
        setGroups(rebuildGroups(next, updatedGroups));
        return next;
      });
    },
    [rebuildGroups]
  );

  const handleClearAll = useCallback(() => {
    if (students.length === 0) return;
    if (window.confirm(`학생 ${students.length}명을 모두 삭제하시겠습니까?`)) {
      setStudents([]);
      setGroups([]);
    }
  }, [students.length]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">학생 관리</h2>
        <p className="text-sm text-gray-500 mt-1">학생을 추가하고 배치 조건을 설정하세요.</p>
      </div>

      {/* Input Area */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
            placeholder="학생 이름 입력 후 Enter"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <button
            onClick={handleAddClick}
            className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
          >
            추가
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
            title="엑셀/메모장에서 일괄 붙여넣기"
          >
            <IconClipboard className="w-4 h-4" /> 일괄 등록
          </button>
        </div>

        {/* Duplicate Warning */}
        {duplicateWarning && (
          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            <IconWarning className="w-3.5 h-3.5 shrink-0" /> {duplicateWarning}
          </div>
        )}
      </div>

      {/* Student Count & Actions */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600">
          전체 <span className="font-semibold text-gray-900">{students.length}</span>명
        </span>
        {students.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            전체 삭제
          </button>
        )}
      </div>

      {/* Student List */}
      {students.length === 0 ? (
        <div className="bg-white border border-gray-200 border-dashed rounded-xl p-12 text-center">
          <div className="mb-3 flex justify-center"><IconStudents className="w-12 h-12 text-gray-300" /></div>
          <p className="text-sm text-gray-500 font-medium mb-1">등록된 학생이 없습니다</p>
          <p className="text-xs text-gray-400">위에서 학생 이름을 입력하거나 일괄 등록을 사용하세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {students.map((student, index) => (
            <StudentCard
              key={student.id}
              student={student}
              groups={groups}
              index={index}
              onDelete={deleteStudent}
              onOpenConstraints={setConstraintTarget}
            />
          ))}
        </div>
      )}

      {/* Group Summary */}
      {groups.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">그룹 현황</h3>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => {
              const memberNames = g.members
                .map((mid) => students.find((s) => s.id === mid)?.name)
                .filter(Boolean);
              return (
                <div
                  key={g.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                  style={{
                    backgroundColor: g.color + '15',
                    color: g.color,
                    borderColor: g.color + '30',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: g.color }}
                  />
                  {g.label}: {memberNames.join(', ')}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showBulkModal && (
        <BulkPasteModal
          onClose={() => setShowBulkModal(false)}
          onAdd={handleBulkAdd}
        />
      )}

      {constraintTarget && (
        <ConstraintModal
          student={constraintTarget}
          allStudents={students}
          groups={groups}
          onClose={() => setConstraintTarget(null)}
          onSave={handleSaveConstraints}
        />
      )}
    </div>
  );
}
