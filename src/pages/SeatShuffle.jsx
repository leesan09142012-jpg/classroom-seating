import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { IconSchool, IconStudents, IconDice, IconClipboard, IconSwap, IconUndo, IconSave, IconRefresh } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import {
  loadLayout as dsLoadLayout,
  loadStudents as dsLoadStudents,
  loadHistory as dsLoadHistory,
  saveHistoryRecord as dsSaveHistoryRecord,
} from '../lib/dataService';

// ─── Constants ─────────────────────────────────────────────────────

const SLOT_INTERVAL_MS = 60;
const STOP_INTERVAL_MS = 300;
const MAX_DEDUP_ATTEMPTS = 50;

// ─── Grid / adjacency helpers ──────────────────────────────────────

/** Build seat-number grid with numbering from a raw layout grid */
function buildNumberedGrid(rawGrid) {
  let num = 1;
  return rawGrid.map((row) =>
    row.map((cell) => {
      if (cell.type === 'seat') {
        return { ...cell, seatNumber: num++ };
      }
      return { ...cell, seatNumber: null };
    })
  );
}

/** Collect all unique seat numbers and their grid positions */
function collectSeats(grid) {
  const seats = []; // { seatNumber, positions: [[r,c]] }
  const seen = new Set();
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell.type === 'seat' && cell.seatNumber != null && !seen.has(cell.seatNumber)) {
        seen.add(cell.seatNumber);
        seats.push({ seatNumber: cell.seatNumber, positions: [[r, c]] });
      }
    }
  }
  return seats;
}

/**
 * Get adjacency pairs for a given assignment.
 * Adjacent = same row left/right 1 cell (not crossing empty), same column up/down 1 cell (not crossing empty).
 * Diagonal = NOT adjacent.
 */
function getAdjacencyPairs(grid, assignment) {
  const pairs = new Set();
  const seatPositions = {}; // seatNumber -> [[r,c], ...]

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell.type === 'seat' && cell.seatNumber != null) {
        if (!seatPositions[cell.seatNumber]) seatPositions[cell.seatNumber] = [];
        seatPositions[cell.seatNumber].push([r, c]);
      }
    }
  }

  // For each seat, find adjacent seats
  const allSeatNums = Object.keys(seatPositions).map(Number);
  for (const seatNum of allSeatNums) {
    const studentA = assignment[seatNum];
    if (!studentA) continue;

    for (const [r, c] of seatPositions[seatNum]) {
      // Check right neighbor (same row, c+1)
      if (c + 1 < grid[r].length) {
        const neighbor = grid[r][c + 1];
        if (neighbor.type === 'seat' && neighbor.seatNumber != null && neighbor.seatNumber !== seatNum) {
          const studentB = assignment[neighbor.seatNumber];
          if (studentB) {
            const key = [studentA, studentB].sort().join('|');
            pairs.add(key);
          }
        }
      }
      // Check below neighbor (same column, r+1)
      if (r + 1 < grid.length) {
        const neighbor = grid[r + 1][c];
        if (neighbor.type === 'seat' && neighbor.seatNumber != null && neighbor.seatNumber !== seatNum) {
          const studentB = assignment[neighbor.seatNumber];
          if (studentB) {
            const key = [studentA, studentB].sort().join('|');
            pairs.add(key);
          }
        }
      }
    }

    }

  return pairs;
}

// ─── Shuffle Algorithm ─────────────────────────────────────────────

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Perform seating assignment:
 *  1. Fixed seat students -> assigned to their seat
 *  2. Zone-locked students -> random within their zone
 *  3. Grouped students -> find adjacent empty blocks
 *  4. Remaining -> random among remaining seats
 *
 * Returns { assignment: { seatNumber: studentName }, errors: string[] }
 */
function performAssignment(grid, students, groups) {
  const seats = collectSeats(grid);
  const seatNumbers = seats.map((s) => s.seatNumber);
  const errors = [];

  // Check capacity
  if (students.length > seatNumbers.length) {
    errors.push(
      `학생 수(${students.length}명)가 좌석 수(${seatNumbers.length}개)보다 많습니다.`
    );
    return { assignment: {}, errors };
  }

  const assignment = {}; // seatNumber -> studentName
  const assigned = new Set(); // student names already assigned
  const occupied = new Set(); // seat numbers already taken

  // ── Step 1: Fixed seat students ──
  for (const student of students) {
    if (student.constraints.fixedSeat != null) {
      const seatNum = student.constraints.fixedSeat;
      if (!seatNumbers.includes(seatNum)) {
        errors.push(`${student.name}: 고정 좌석 ${seatNum}번이 존재하지 않습니다.`);
        continue;
      }
      if (occupied.has(seatNum)) {
        errors.push(`${student.name}: 고정 좌석 ${seatNum}번이 이미 다른 학생에게 배정되었습니다.`);
        continue;
      }
      assignment[seatNum] = student.name;
      assigned.add(student.name);
      occupied.add(seatNum);
    }
  }

  // ── Step 2: Zone-locked students ──
  for (const student of students) {
    if (assigned.has(student.name)) continue;
    if (!student.constraints.fixedZone) continue;

    const zone = student.constraints.fixedZone;
    const allowedSet = new Set(Array.isArray(zone.seats) ? zone.seats : []);

    // Find available seats in the zone
    const zoneSeats = seats.filter(
      (s) => !occupied.has(s.seatNumber) && allowedSet.has(s.seatNumber)
    );

    if (zoneSeats.length === 0) {
      errors.push(`${student.name}: 지정 구역에 빈 좌석이 없습니다.`);
      continue;
    }

    const shuffled = shuffleArray(zoneSeats);
    const chosen = shuffled[0];
    assignment[chosen.seatNumber] = student.name;
    assigned.add(student.name);
    occupied.add(chosen.seatNumber);
  }

  // ── Step 3: Grouped students ──
  // Group students by group ID, then try to find adjacent blocks
  const groupMap = {};
  for (const student of students) {
    if (assigned.has(student.name)) continue;
    if (!student.constraints.group) continue;
    const gId = student.constraints.group;
    if (!groupMap[gId]) groupMap[gId] = [];
    groupMap[gId].push(student);
  }

  // Build adjacency map between seats
  const seatAdjacency = {}; // seatNumber -> Set of adjacent seatNumbers
  for (const seat of seats) {
    seatAdjacency[seat.seatNumber] = new Set();
  }
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell.type !== 'seat' || cell.seatNumber == null) continue;

      // Right neighbor
      if (c + 1 < grid[r].length) {
        const right = grid[r][c + 1];
        if (right.type === 'seat' && right.seatNumber != null && right.seatNumber !== cell.seatNumber) {
          seatAdjacency[cell.seatNumber].add(right.seatNumber);
          seatAdjacency[right.seatNumber].add(cell.seatNumber);
        }
      }
      // Below neighbor
      if (r + 1 < grid.length) {
        const below = grid[r + 1][c];
        if (below.type === 'seat' && below.seatNumber != null && below.seatNumber !== cell.seatNumber) {
          seatAdjacency[cell.seatNumber].add(below.seatNumber);
          seatAdjacency[below.seatNumber].add(cell.seatNumber);
        }
      }
    }
  }

  for (const gId of Object.keys(groupMap)) {
    const groupStudents = groupMap[gId];
    const needed = groupStudents.length;

    // Find a connected block of `needed` empty seats using BFS
    const availableSeats = seatNumbers.filter((sn) => !occupied.has(sn));
    let bestBlock = null;

    for (const startSeat of shuffleArray(availableSeats)) {
      // BFS to find connected block
      const block = [];
      const visited = new Set();
      const queue = [startSeat];
      visited.add(startSeat);

      while (queue.length > 0 && block.length < needed) {
        const current = queue.shift();
        if (!occupied.has(current)) {
          block.push(current);
        }
        for (const neighbor of (seatAdjacency[current] || [])) {
          if (!visited.has(neighbor) && !occupied.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      if (block.length >= needed) {
        bestBlock = block.slice(0, needed);
        break;
      }
    }

    if (bestBlock) {
      const shuffledStudents = shuffleArray(groupStudents);
      for (let i = 0; i < shuffledStudents.length; i++) {
        assignment[bestBlock[i]] = shuffledStudents[i].name;
        assigned.add(shuffledStudents[i].name);
        occupied.add(bestBlock[i]);
      }
    } else {
      // Fallback: assign randomly to remaining seats
      const remaining = shuffleArray(seatNumbers.filter((sn) => !occupied.has(sn)));
      for (let i = 0; i < groupStudents.length && i < remaining.length; i++) {
        assignment[remaining[i]] = groupStudents[i].name;
        assigned.add(groupStudents[i].name);
        occupied.add(remaining[i]);
      }
      if (remaining.length < groupStudents.length) {
        errors.push(`${gId}그룹: 인접한 빈 좌석이 부족하여 일부 학생을 배치할 수 없습니다.`);
      }
    }
  }

  // ── Step 4: Remaining students ──
  const unassigned = students.filter((s) => !assigned.has(s.name));
  const emptySeats = shuffleArray(seatNumbers.filter((sn) => !occupied.has(sn)));

  for (let i = 0; i < unassigned.length; i++) {
    if (i >= emptySeats.length) {
      errors.push(`${unassigned[i].name}: 빈 좌석이 부족합니다.`);
      continue;
    }
    assignment[emptySeats[i]] = unassigned[i].name;
  }

  return { assignment, errors };
}

/**
 * Try to generate an assignment that avoids repeating adjacency pairs from the
 * previous assignment. Best effort: max MAX_DEDUP_ATTEMPTS tries.
 */
function performDedupAssignment(grid, students, groups, prevAdjPairs) {
  if (!prevAdjPairs || prevAdjPairs.size === 0) {
    return performAssignment(grid, students, groups);
  }

  let best = null;
  let bestOverlap = Infinity;

  for (let attempt = 0; attempt < MAX_DEDUP_ATTEMPTS; attempt++) {
    const result = performAssignment(grid, students, groups);
    if (result.errors.length > 0) return result; // can't fix errors by retrying

    const adjPairs = getAdjacencyPairs(grid, result.assignment);
    let overlap = 0;
    for (const pair of adjPairs) {
      if (prevAdjPairs.has(pair)) overlap++;
    }

    if (overlap === 0) return result;
    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      best = result;
    }
  }

  return best;
}

// ─── Sound helpers (Web Audio API) ────────────────────────────────

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function beep(freq, duration, volume = 0.08) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* ignore */ }
}

async function ensureAudioStarted() {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') await ctx.resume();
}

function playCountdownTick(soundEnabled) {
  if (!soundEnabled) return;
  beep(1000, 0.1, 0.1);
}

function playSlotClick(soundEnabled) {
  if (!soundEnabled) return;
  beep(800, 0.05, 0.06);
}

function playFanfare(soundEnabled) {
  if (!soundEnabled) return;
  beep(1200, 0.4, 0.12);
}

// ─── Main Component ────────────────────────────────────────────────

export default function SeatShuffle({ onUnsavedChange }) {
  const { user } = useAuth();
  // ── Data ──
  const [layout, setLayout] = useState(null);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);

  // ── UI state ──
  const [phase, setPhase] = useState('idle'); // 'idle' | 'countdown' | 'slotmachine' | 'done'
  const [countdownNum, setCountdownNum] = useState(3);
  const [assignment, setAssignment] = useState({}); // seatNumber -> studentName
  const [slotDisplay, setSlotDisplay] = useState({}); // seatNumber -> currently displayed name
  const [stoppedSeats, setStoppedSeats] = useState(new Set());
  const [errors, setErrors] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  // ── Swap state ──
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirst, setSwapFirst] = useState(null); // seatNumber
  const [undoState, setUndoState] = useState(null); // previous assignment for undo

  // ── Reveal state ── (뽑기 결과를 클릭으로 공개)
  const [revealed, setRevealed] = useState(new Set());
  const handleRevealSeat = useCallback((seatNumber) => {
    if (swapMode) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(seatNumber)) next.delete(seatNumber);
      else next.add(seatNumber);
      return next;
    });
  }, [swapMode]);
  const handleRevealAll = useCallback(() => {
    setRevealed(new Set(Object.keys(assignment).map(Number)));
  }, [assignment]);
  const handleHideAll = useCallback(() => setRevealed(new Set()), []);

  // Refs for animation cleanup
  const slotTimerRef = useRef(null);
  const stopTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // ── Load data from dataService ──
  useEffect(() => {
    (async () => {
      const layoutData = await dsLoadLayout(user?.id);
      setLayout(layoutData);
      const studentData = await dsLoadStudents(user?.id);
      setStudents(studentData.students || []);
      setGroups(studentData.groups || []);
    })();

    // Listen for external changes (tabs within same page)
    const handleLayoutChange = () => {
      dsLoadLayout(user?.id).then((d) => setLayout(d));
    };
    const handleStudentChange = () => {
      dsLoadStudents(user?.id).then((d) => {
        setStudents(d.students || []);
        setGroups(d.groups || []);
      });
    };

    // Check for loaded assignment from History tab
    try {
      const loaded = localStorage.getItem('loaded-assignment');
      if (loaded) {
        const parsed = JSON.parse(loaded);
        if (parsed.assignment) {
          setAssignment(parsed.assignment);
          setPhase('done');
          setRevealed(new Set(Object.keys(parsed.assignment).map(Number)));
        }
        localStorage.removeItem('loaded-assignment');
      }
    } catch {}

    window.addEventListener('classroom-layout-change', handleLayoutChange);
    const handleStorage = (e) => {
      if (e.key === 'classroom-layout') handleLayoutChange();
      if (e.key === 'student-list') handleStudentChange();
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('classroom-layout-change', handleLayoutChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user?.id]);

  // ── Build numbered grid ──
  const grid = useMemo(() => {
    if (!layout?.grid) return null;
    return buildNumberedGrid(layout.grid);
  }, [layout]);

  const seatList = useMemo(() => {
    if (!grid) return [];
    return collectSeats(grid);
  }, [grid]);

  const seatCount = seatList.length;
  const studentCount = students.length;

  // ── Cleanup timers on unmount ──
  useEffect(() => {
    return () => {
      if (slotTimerRef.current) clearInterval(slotTimerRef.current);
      if (stopTimerRef.current) clearInterval(stopTimerRef.current);
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
  }, []);

  // ── 번호순 초기 배치 ──
  const handleOrderedPlacement = useCallback(() => {
    if (!grid || students.length === 0) return;
    const seats = collectSeats(grid);
    const seatNumbers = seats.map((s) => s.seatNumber).sort((a, b) => a - b);

    if (students.length > seatNumbers.length) {
      setErrors([`학생 수(${students.length}명)가 좌석 수(${seatNumbers.length}개)보다 많습니다.`]);
      return;
    }

    const newAssignment = {};
    for (let i = 0; i < students.length; i++) {
      newAssignment[seatNumbers[i]] = students[i].name;
    }

    setAssignment(newAssignment);
    setPhase('done');
    setRevealed(new Set(Object.keys(newAssignment).map(Number)));
    setErrors([]);
    setSwapMode(false);
    setSwapFirst(null);
    setUndoState(null);
    setSaved(false);
  }, [grid, students]);

  // ── Get previous adjacency pairs from history ──
  const getPrevAdjPairs = useCallback(async () => {
    const history = await dsLoadHistory(user?.id);
    if (history.length === 0) return new Set();
    const last = history[history.length - 1];
    if (last.adjacencyPairs) return new Set(last.adjacencyPairs);
    return new Set();
  }, [user?.id]);

  // ── Start shuffle ──
  const handleStartShuffle = useCallback(async () => {
    if (!grid || students.length === 0) return;

    // Validate
    if (studentCount > seatCount) {
      setErrors([`학생 수(${studentCount}명)가 좌석 수(${seatCount}개)보다 많습니다.`]);
      return;
    }

    await ensureAudioStarted();

    // Compute assignment first
    const prevAdj = await getPrevAdjPairs();
    const result = performDedupAssignment(grid, students, groups, prevAdj);

    if (result.errors.length > 0) {
      setErrors(result.errors);
      return;
    }

    setErrors([]);
    setAssignment(result.assignment);
    setSwapMode(false);
    setSwapFirst(null);
    setUndoState(null);
    setSaved(false);
    setFullscreen(false);

    // 모션 없이 바로 결과 (이름은 클릭으로 공개)
    setPhase('done');
    setRevealed(new Set());
    playFanfare(soundEnabled);
  }, [grid, students, groups, studentCount, seatCount, soundEnabled, getPrevAdjPairs]);

  // ── Slot machine animation ──
  const startSlotMachine = useCallback(
    (finalAssignment) => {
      setPhase('slotmachine');
      setStoppedSeats(new Set());

      const studentNames = students.map((s) => s.name);
      const orderedSeats = [...seatList].sort((a, b) => {
        // Top-left first: sort by first position row, then col
        const [ar, ac] = a.positions[0];
        const [br, bc] = b.positions[0];
        if (ar !== br) return ar - br;
        return ac - bc;
      });

      // Rapid cycling
      slotTimerRef.current = setInterval(() => {
        const display = {};
        for (const seat of orderedSeats) {
          const randomIdx = Math.floor(Math.random() * studentNames.length);
          display[seat.seatNumber] = studentNames[randomIdx];
        }
        setSlotDisplay((prev) => {
          // Keep stopped seats showing final name
          const merged = { ...display };
          // This will be overridden by the stop logic below
          return merged;
        });
        playSlotClick(soundEnabled);
      }, SLOT_INTERVAL_MS);

      // Stop seats one by one
      let stopIndex = 0;
      const stopped = new Set();

      stopTimerRef.current = setInterval(() => {
        if (stopIndex >= orderedSeats.length) {
          clearInterval(stopTimerRef.current);
          clearInterval(slotTimerRef.current);
          slotTimerRef.current = null;
          stopTimerRef.current = null;

          // Final state
          setSlotDisplay(finalAssignment);
          setStoppedSeats(new Set(orderedSeats.map((s) => s.seatNumber)));
          setPhase('done');
          setRevealed(new Set());
          setFullscreen(false);
          playFanfare(soundEnabled);
          return;
        }

        const seat = orderedSeats[stopIndex];
        stopped.add(seat.seatNumber);
        setStoppedSeats(new Set(stopped));
        stopIndex++;
      }, STOP_INTERVAL_MS);
    },
    [students, seatList, soundEnabled]
  );

  // ── The display map for slot machine: stopped seats show final, others show random ──
  const displayAssignment = useMemo(() => {
    if (phase === 'done' || phase === 'idle') return assignment;
    if (phase === 'slotmachine') {
      const merged = {};
      for (const seat of seatList) {
        if (stoppedSeats.has(seat.seatNumber)) {
          merged[seat.seatNumber] = assignment[seat.seatNumber];
        } else {
          merged[seat.seatNumber] = slotDisplay[seat.seatNumber] || '';
        }
      }
      return merged;
    }
    return {};
  }, [phase, assignment, slotDisplay, stoppedSeats, seatList]);

  // ── Save result ──
  const handleSave = useCallback(async () => {
    if (!grid) return;
    const adjPairs = getAdjacencyPairs(grid, assignment);
    const record = {
      date: new Date().toISOString(),
      assignment: { ...assignment },
      adjacencyPairs: [...adjPairs],
      layout: { rows: layout.rows, cols: layout.cols, cells: grid },
    };
    await dsSaveHistoryRecord(user?.id, record);
    window.dispatchEvent(new CustomEvent('seat-history-change'));
    setErrors([]);
    setSaved(true);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [grid, assignment, layout, user?.id]);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saved, setSaved] = useState(false);

  // Notify parent about unsaved state
  useEffect(() => {
    const unsaved = phase === 'done' && !saved && Object.keys(assignment).length > 0;
    onUnsavedChange?.(unsaved);
  }, [phase, saved, assignment, onUnsavedChange]);

  // ── Manual swap ──
  const handleCellClick = useCallback(
    (seatNumber) => {
      if (!swapMode || phase !== 'done') return;
      if (!assignment[seatNumber]) return; // empty seat

      if (swapFirst === null) {
        setSwapFirst(seatNumber);
      } else if (swapFirst === seatNumber) {
        setSwapFirst(null); // deselect
      } else {
        // Perform swap
        setUndoState({ ...assignment });
        setAssignment((prev) => {
          const next = { ...prev };
          const temp = next[swapFirst];
          next[swapFirst] = next[seatNumber];
          next[seatNumber] = temp;
          return next;
        });
        setSwapFirst(null);
      }
    },
    [swapMode, phase, swapFirst, assignment]
  );

  const handleUndo = useCallback(() => {
    if (undoState) {
      setAssignment(undoState);
      setUndoState(null);
      setSwapFirst(null);
    }
  }, [undoState]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    setPhase('idle');
    setAssignment({});
    setSlotDisplay({});
    setStoppedSeats(new Set());
    setErrors([]);
    setSwapMode(false);
    setSwapFirst(null);
    setUndoState(null);
    setSaved(false);
    setFullscreen(false);
    setSaveSuccess(false);
    if (slotTimerRef.current) clearInterval(slotTimerRef.current);
    if (stopTimerRef.current) clearInterval(stopTimerRef.current);
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
  }, []);

  // ── No layout or no students ──
  if (!layout || !grid) {
    return (
      <div className="text-center py-20 text-gray-400">
        <div className="mb-4 flex justify-center"><IconSchool className="w-14 h-14 text-gray-300" /></div>
        <h2 className="text-xl font-semibold text-gray-600 mb-2">교실 설정 필요</h2>
        <p>먼저 "교실 설정" 탭에서 좌석 배치를 만들어주세요.</p>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <div className="mb-4 flex justify-center"><IconStudents className="w-14 h-14 text-gray-300" /></div>
        <h2 className="text-xl font-semibold text-gray-600 mb-2">학생 등록 필요</h2>
        <p>먼저 "학생 관리" 탭에서 학생을 등록해주세요.</p>
      </div>
    );
  }

  // ── Fullscreen countdown overlay ──
  if (fullscreen && (phase === 'countdown' || phase === 'slotmachine')) {
    return (
      <div className="fixed inset-0 z-[200] bg-gray-900 flex flex-col items-center justify-center">
        {/* Sound toggle */}
        <button
          onClick={() => setSoundEnabled((v) => !v)}
          className="absolute top-4 right-4 p-2 text-white/60 hover:text-white/90 transition-colors"
          title={soundEnabled ? '소리 끄기' : '소리 켜기'}
        >
          {soundEnabled ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          )}
        </button>

        {phase === 'countdown' && (
          <div
            key={countdownNum}
            className="text-[12rem] font-black text-white select-none"
            style={{
              animation: 'countdownPop 0.7s ease-out',
              textShadow: '0 0 60px rgba(255,255,255,0.3)',
            }}
          >
            {countdownNum}
          </div>
        )}

        {phase === 'slotmachine' && grid && (
          <div className="w-full max-w-6xl px-4 overflow-auto">
            {/* Teacher's desk */}
            <div className="mb-4 mx-auto w-48 py-2 bg-white/10 rounded-lg text-center text-sm font-medium text-white/60 border border-white/20">
              교탁
            </div>

            <div
              className="grid gap-2 justify-center mx-auto"
              style={{
                gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                maxWidth: `${layout.cols * 80}px`,
              }}
            >
              {grid.map((row, r) =>
                row.map((cell, c) => {
                  if (cell.type !== 'seat' || cell.seatNumber == null) {
                    return <div key={`${r}-${c}`} className="aspect-square" />;
                  }

                  // Skip secondary paired cells visually — or show them
                  const seatNum = cell.seatNumber;
                  const isStopped = stoppedSeats.has(seatNum);

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`
                        relative flex flex-col items-center justify-center
                        aspect-square rounded-lg border p-1
                        text-xs sm:text-sm transition-all duration-200
                        ${isStopped
                          ? 'bg-blue-500/20 border-blue-400/60 scale-105'
                          : 'bg-white/10 border-white/20'
                        }
                      `}
                    >
                      {isStopped ? (
                        <span className="font-black text-blue-300 text-2xl leading-none">{seatNum}</span>
                      ) : (
                        <>
                          <span className="text-[10px] text-white/40 leading-none">{seatNum}</span>
                          <span className="font-bold w-full text-center leading-tight mt-0.5 text-xl text-white/60 animate-pulse">?</span>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <style>{`
          @keyframes countdownPop {
            0% { transform: scale(0.3); opacity: 0; }
            50% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // ── Main render ──
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">자리 뽑기</h2>
          <p className="text-sm text-gray-500 mt-1">
            학생 {studentCount}명 / 좌석 {seatCount}개
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound toggle */}
          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className={`p-2 rounded-lg border transition-colors ${
              soundEnabled
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}
            title={soundEnabled ? '소리 끄기' : '소리 켜기'}
          >
            {soundEnabled ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-2">배치 오류</h3>
          <ul className="space-y-1">
            {errors.map((err, i) => (
              <li key={i} className="text-sm text-red-600 flex items-start gap-2">
                <span className="text-red-400 mt-0.5">&#x2022;</span>
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Save success */}
      {saveSuccess && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700 font-medium text-center">
          저장되었습니다!
        </div>
      )}

      {/* Reveal controls (뽑기 후 클릭으로 공개) */}
      {phase === 'done' && !swapMode && Object.keys(assignment).length > 0 && (
        <div className="flex justify-center items-center gap-2 mb-4 text-sm">
          <span className="text-gray-500">좌석을 클릭하면 학생 이름이 공개됩니다</span>
          <button
            onClick={revealed.size === Object.keys(assignment).length ? handleHideAll : handleRevealAll}
            className="px-3 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
          >
            {revealed.size === Object.keys(assignment).length ? '모두 숨기기' : '모두 공개'}
          </button>
        </div>
      )}

      {/* Teacher's desk */}
      <div className="flex justify-center mb-4">
        <div className="bg-gray-100 border-2 border-gray-300 rounded-xl px-12 py-2 text-center shadow-sm">
          <span className="text-gray-800 font-bold text-sm tracking-wider">교 탁</span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex justify-center mb-6">
        <div
          className="inline-grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
          }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => {
              if (cell.type !== 'seat' || cell.seatNumber == null) {
                return <div key={`${r}-${c}`} className="w-16 h-16 md:w-20 md:h-20" />;
              }

              const seatNum = cell.seatNumber;
              const studentName = phase === 'done' ? assignment[seatNum] : null;
              const isSwapSelected = swapMode && swapFirst === seatNum;
              const isRevealed = !!studentName && revealed.has(seatNum);
              const showName = !!studentName && (swapMode || isRevealed);
              const isClickableForReveal = !!studentName && phase === 'done' && !swapMode;

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => {
                    if (phase !== 'done') return;
                    if (swapMode) handleCellClick(seatNum);
                    else if (studentName) handleRevealSeat(seatNum);
                  }}
                  className={`
                    relative w-16 h-16 md:w-20 md:h-20 flex flex-col items-center justify-center
                    rounded-lg border p-1 text-xs sm:text-sm transition-all duration-150 select-none
                    ${showName
                      ? 'bg-blue-50 border-blue-200'
                      : studentName
                      ? 'bg-white border-blue-300 hover:bg-blue-50'
                      : 'bg-white border-gray-200'
                    }
                    ${isSwapSelected
                      ? 'ring-2 ring-red-400 ring-offset-1 bg-red-50 border-red-300 scale-105'
                      : ''
                    }
                    ${swapMode && phase === 'done' && assignment[seatNum]
                      ? 'cursor-pointer hover:shadow-md hover:scale-105 active:scale-95'
                      : ''
                    }
                    ${isClickableForReveal ? 'cursor-pointer hover:shadow-md' : ''}
                  `}
                >
                  <span className="text-[10px] text-gray-400 leading-none">{seatNum}</span>
                  {showName && (
                    <span className="font-medium text-gray-800 truncate w-full text-center leading-tight mt-0.5">
                      {studentName}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col items-center gap-3">
        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-3">
            {studentCount !== seatCount && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 text-center">
                학생 수({studentCount}명)와 좌석 수({seatCount}개)가 일치하지 않습니다.
                <br />
                <span className="text-xs text-red-500">학생 관리 또는 교실 설정을 확인해주세요.</span>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => setShowConfirm(true)}
                disabled={studentCount !== seatCount}
                className="px-8 py-4 bg-blue-600 text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-blue-700 hover:shadow-xl active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-lg"
              >
                <IconDice className="w-5 h-5" /> 자리 뽑기
              </button>
              <button
                onClick={handleOrderedPlacement}
                disabled={studentCount !== seatCount}
                className="px-6 py-4 bg-white text-gray-700 text-sm font-medium rounded-2xl shadow border border-gray-300 hover:bg-gray-50 hover:shadow-md active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <IconClipboard className="w-4 h-4" /> 번호순 배치
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-wrap justify-center gap-3">
            {/* Swap mode toggle */}
            <button
              onClick={() => {
                setSwapMode((v) => !v);
                setSwapFirst(null);
              }}
              className={`px-5 py-2.5 text-sm font-medium rounded-xl border transition-colors ${
                swapMode
                  ? 'bg-red-100 border-red-300 text-red-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <IconSwap className="w-4 h-4" /> {swapMode ? '교환 모드 ON' : '자리 교환'}
            </button>

            {/* Undo */}
            {undoState && (
              <button
                onClick={handleUndo}
                className="px-5 py-2.5 text-sm font-medium rounded-xl border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <IconUndo className="w-4 h-4" /> 되돌리기
              </button>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              className="px-5 py-2.5 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <IconSave className="w-4 h-4" /> 저장
            </button>

            {/* Reshuffle */}
            <button
              onClick={handleReset}
              className="px-5 py-2.5 text-sm font-medium rounded-xl border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <IconRefresh className="w-4 h-4" /> 다시 뽑기
            </button>
          </div>
        )}

        {swapMode && phase === 'done' && (
          <p className="text-sm text-red-600 font-medium">
            {swapFirst != null
              ? `${assignment[swapFirst]}을(를) 선택했습니다. 교환할 학생을 클릭하세요.`
              : '교환할 첫 번째 학생을 클릭하세요.'}
          </p>
        )}
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleStartShuffle}
        title="자리 뽑기"
        message="정말 자리를 뽑을까요?"
        confirmText="뽑기 시작"
        cancelText="취소"
        confirmLeft
      />
    </div>
  );
}
