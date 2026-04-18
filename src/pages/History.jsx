import { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import {
  loadHistory as dsLoadHistory,
  deleteHistoryRecord as dsDeleteHistoryRecord,
  resetAllData as dsResetAllData,
  exportBackup as dsExportBackup,
  importBackup as dsImportBackup,
} from '../lib/dataService';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}년 ${mm}월 ${dd}일 ${hh}:${min}`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${mm}/${dd} (${day})`;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

function formatRelative(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

function getLayoutDims(layout) {
  if (!layout) return null;
  return `${layout.rows} × ${layout.cols}`;
}

function getStudentCount(assignment) {
  if (!assignment) return 0;
  return Object.values(assignment).filter(Boolean).length;
}

export default function History() {
  const { user } = useAuth();
  const { showToast } = useToast();

  // State
  const [history, setHistory] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetInput, setShowResetInput] = useState(false);
  const [resetInputValue, setResetInputValue] = useState('');
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState(null);
  const [exporting, setExporting] = useState(false);

  const gridPreviewRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load history from dataService
  const refreshHistory = useCallback(async () => {
    const data = await dsLoadHistory(user?.id);
    if (Array.isArray(data)) {
      const sorted = [...data].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
      setHistory(sorted);
    } else {
      setHistory([]);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Selected record
  const selectedRecord = selectedIndex !== null ? history[selectedIndex] : null;

  // Build assignment name map for the selected record
  const assignmentWithNames = (() => {
    if (!selectedRecord?.assignment) return {};
    // assignment may already be { seatNumber: studentName }
    // or { seatNumber: studentId } -- we handle both
    return selectedRecord.assignment;
  })();

  // --- Actions ---

  // Load assignment into Tab 3
  const handleLoad = () => {
    if (!selectedRecord) return;
    try {
      localStorage.setItem(
        'loaded-assignment',
        JSON.stringify({
          layout: selectedRecord.layout,
          assignment: selectedRecord.assignment,
          date: selectedRecord.date,
        })
      );
      showToast('배치를 불러왔습니다. 자리 뽑기 탭에서 확인하세요.', 'success');
    } catch {
      showToast('배치 불러오기에 실패했습니다.', 'error');
    }
  };

  // Export as image using html2canvas
  const handleExportImage = async () => {
    if (!gridPreviewRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(gridPreviewRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      const link = document.createElement('a');
      const dateStr = selectedRecord
        ? new Date(selectedRecord.date).toISOString().slice(0, 10)
        : 'seating';
      link.download = `자리배치_${dateStr}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('이미지를 저장했습니다.', 'success');
    } catch {
      showToast('이미지 저장에 실패했습니다.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // JSON backup - export all data
  const handleJsonExport = () => {
    try {
      const backup = dsExportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `교실자리배치_백업_${new Date().toISOString().slice(0, 10)}.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      showToast('백업 파일을 다운로드했습니다.', 'success');
    } catch {
      showToast('백업 내보내기에 실패했습니다.', 'error');
    }
  };

  // JSON import - upload file
  const handleJsonImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        // Validate structure
        if (!parsed.data || typeof parsed.data !== 'object') {
          showToast('올바른 백업 파일 형식이 아닙니다.', 'error');
          return;
        }
        setPendingImportData(parsed);
        setShowImportConfirm(true);
      } catch {
        showToast('JSON 파일을 읽을 수 없습니다.', 'error');
      }
    };
    reader.readAsText(file);
    // Reset file input so same file can be selected again
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (!pendingImportData) return;
    try {
      await dsImportBackup(user?.id, pendingImportData);
      await refreshHistory();
      setSelectedIndex(null);
      setPendingImportData(null);
      showToast('데이터를 복원했습니다. 다른 탭에서도 확인하세요.', 'success');
    } catch {
      showToast('데이터 복원에 실패했습니다.', 'error');
    }
  };

  // New semester reset - step 1: confirm dialog
  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  // Step 2: after first confirm, show text input
  const handleResetFirstConfirm = () => {
    setShowResetConfirm(false);
    setShowResetInput(true);
    setResetInputValue('');
  };

  // Step 3: execute reset if typed correctly
  const handleResetExecute = async () => {
    if (resetInputValue.trim() !== '초기화') return;
    try {
      await dsResetAllData(user?.id);
      setShowResetInput(false);
      setResetInputValue('');
      showToast('모든 데이터가 초기화되었습니다.', 'success');
      setTimeout(() => window.location.reload(), 500);
    } catch {
      showToast('초기화에 실패했습니다.', 'error');
    }
  };

  // Delete a single history record
  const handleDeleteRecord = async (index) => {
    await dsDeleteHistoryRecord(user?.id, index);
    const updated = history.filter((_, i) => i !== index);
    setHistory(updated);
    if (selectedIndex === index) {
      setSelectedIndex(null);
    } else if (selectedIndex !== null && selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
    showToast('배치 기록을 삭제했습니다.', 'info');
  };

  // --- Render ---

  // Empty state
  if (history.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center py-20">
          <div className="text-6xl mb-4 opacity-40">
            <svg
              className="w-20 h-20 mx-auto text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-500 mb-2">
            배치 기록이 없습니다
          </h2>
          <p className="text-gray-400 text-sm">
            자리 뽑기를 실행하면 여기에 기록이 저장됩니다.
          </p>
        </div>

        {/* Bottom action bar even with no history */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleJsonImportClick}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <UploadIcon />
                JSON 불러오기
              </button>
            </div>
            <button
              onClick={handleResetClick}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              <TrashIcon />
              새 학기 초기화
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Dialogs */}
        <ResetConfirmDialog
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          onConfirm={handleResetFirstConfirm}
        />
        <ResetInputModal
          isOpen={showResetInput}
          onClose={() => setShowResetInput(false)}
          value={resetInputValue}
          onChange={setResetInputValue}
          onConfirm={handleResetExecute}
        />
        <ImportConfirmDialog
          isOpen={showImportConfirm}
          onClose={() => {
            setShowImportConfirm(false);
            setPendingImportData(null);
          }}
          onConfirm={handleImportConfirm}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">배치 기록</h2>
          <p className="text-sm text-gray-500 mt-1">총 {history.length}건</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleJsonExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <DownloadIcon /> 백업
          </button>
          <button
            onClick={handleJsonImportClick}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <UploadIcon /> 복원
          </button>
          <button
            onClick={handleResetClick}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            <TrashIcon /> 초기화
          </button>
        </div>
      </div>

      {/* History cards */}
      <div className="space-y-1.5">
        {history.map((record, index) => {
          const isOpen = selectedIndex === index;
          const count = getStudentCount(record.assignment);

          return (
            <div
              key={`${record.date}-${index}`}
              className={`bg-white rounded-xl border transition-all ${
                isOpen ? 'border-blue-300 shadow-md' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Card header - always visible */}
              <div
                onClick={() => setSelectedIndex(isOpen ? null : index)}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none"
              >
                {/* Date */}
                <div className="shrink-0 w-16">
                  <div className="text-sm font-bold text-gray-900 leading-tight">
                    {formatDateShort(record.date)}
                  </div>
                  <div className="text-[10px] text-gray-400 leading-tight">
                    {formatTime(record.date)}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex items-center gap-2 text-xs text-gray-600">
                  <span className="font-semibold text-blue-700">{count}명</span>
                  {getLayoutDims(record.layout) && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span>{getLayoutDims(record.layout)}</span>
                    </>
                  )}
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-400">{formatRelative(record.date)}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex(index);
                      handleLoad();
                    }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="이 배치 불러오기"
                  >
                    <LoadIcon />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRecord(index); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="삭제"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-gray-100 px-6 py-5">
                  {/* Full date */}
                  <p className="text-xs text-gray-500 mb-3">
                    {formatDate(record.date)}
                  </p>

                  {/* Action buttons */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={handleLoad}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      <LoadIcon /> 이 배치 불러오기
                    </button>
                    <button
                      onClick={handleExportImage}
                      disabled={exporting}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <ImageIcon /> {exporting ? '저장 중...' : '이미지 저장'}
                    </button>
                  </div>

                  {/* Grid preview */}
                  <div ref={gridPreviewRef} className="bg-gray-50 rounded-xl p-4">
                    <FullGridPreview
                      layout={record.layout}
                      assignment={record.assignment}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Dialogs */}
      <ResetConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetFirstConfirm}
      />
      <ResetInputModal
        isOpen={showResetInput}
        onClose={() => setShowResetInput(false)}
        value={resetInputValue}
        onChange={setResetInputValue}
        onConfirm={handleResetExecute}
      />
      <ImportConfirmDialog
        isOpen={showImportConfirm}
        onClose={() => {
          setShowImportConfirm(false);
          setPendingImportData(null);
        }}
        onConfirm={handleImportConfirm}
      />
    </div>
  );
}

// --- Sub-components ---

function MiniGridPreview({ layout, assignment }) {
  if (!layout) return null;
  const { rows, cols, cells } = layout;

  const grid = cells
    ? cells
    : Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => ({
          type: 'seat',
          seatNumber: r * cols + c + 1,
        }))
      );

  return (
    <div
      className="grid gap-px"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          if (!cell || cell.type === 'empty') {
            return (
              <div
                key={`${r}-${c}`}
                className="w-3 h-3 rounded-sm"
              />
            );
          }
          const hasStudent =
            cell.seatNumber && assignment?.[cell.seatNumber];
          return (
            <div
              key={`${r}-${c}`}
              className={`w-3 h-3 rounded-sm ${
                hasStudent
                  ? 'bg-blue-500'
                  : 'bg-gray-200'
              }`}
            />
          );
        })
      )}
    </div>
  );
}

function FullGridPreview({ layout, assignment }) {
  if (!layout) return null;
  const { rows, cols, cells } = layout;

  const grid = cells
    ? cells
    : Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => ({
          type: 'seat',
          seatNumber: r * cols + c + 1,
        }))
      );

  return (
    <div className="w-full">
      {/* Teacher desk */}
      <div className="flex justify-center mb-3">
        <div className="bg-gray-100 border border-gray-300 rounded-lg px-8 py-1.5 text-xs font-medium text-gray-700">교탁</div>
      </div>
      <div
        className="grid gap-1.5 justify-center mx-auto"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          maxWidth: `${cols * 64}px`,
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            if (!cell || cell.type === 'empty') {
              return <div key={`${r}-${c}`} className="aspect-square" />;
            }
            const seatNum = cell.seatNumber;
            const studentName = seatNum ? assignment?.[seatNum] : null;
            return (
              <div
                key={`${r}-${c}`}
                className={`aspect-square rounded-lg border flex flex-col items-center justify-center p-0.5 text-xs ${
                  studentName
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <span className="text-[9px] text-gray-400 leading-none">{seatNum}</span>
                {studentName && (
                  <span className="font-medium text-gray-800 truncate w-full text-center text-[11px] leading-tight mt-0.5">
                    {studentName}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ResetConfirmDialog({ isOpen, onClose, onConfirm }) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="새 학기 초기화"
      message="모든 데이터(교실 설정, 학생 목록, 배치 기록)가 삭제됩니다. 정말 초기화할까요?"
      confirmText="계속"
      cancelText="취소"
      danger
    />
  );
}

function ResetInputModal({ isOpen, onClose, value, onChange, onConfirm }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const isValid = value.trim() === '초기화';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="초기화 확인">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          초기화를 진행하려면 아래에{' '}
          <span className="font-bold text-red-600">&quot;초기화&quot;</span>를
          입력하세요.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isValid) {
              onConfirm();
            }
          }}
          placeholder="초기화"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={!isValid}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            초기화 실행
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ImportConfirmDialog({ isOpen, onClose, onConfirm }) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="데이터 복원"
      message="백업 파일의 데이터로 현재 데이터를 덮어씁니다. 기존 데이터는 사라집니다. 계속할까요?"
      confirmText="복원"
      cancelText="취소"
      danger
    />
  );
}

// --- Icons ---

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function LoadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
