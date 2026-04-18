import { useEffect, useRef } from 'react';
import Modal from './Modal';

function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = '확인',
  message = '정말 진행할까요?',
  confirmText = '확인',
  cancelText = '취소',
  danger = false,
  confirmLeft = false,
}) {
  const cancelRef = useRef(null);

  // 취소 버튼에 기본 포커스 (실수 방지)
  useEffect(() => {
    if (isOpen && cancelRef.current) {
      // 약간의 딜레이 후 포커스 (모달 애니메이션 완료 후)
      const timer = setTimeout(() => {
        cancelRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-6">
        {/* 메시지 */}
        <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
          {message}
        </p>

        {/* 버튼 영역 */}
        <div className={`flex gap-3 ${confirmLeft ? 'justify-start' : 'justify-end'}`}>
          {confirmLeft && (
            <button
              onClick={handleConfirm}
              className={`
                px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors
                focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                ${danger
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                }
              `}
            >
              {confirmText}
            </button>
          )}
          <button
            ref={cancelRef}
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-blue-700 bg-white border-2 border-blue-500 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            {cancelText}
          </button>
          {!confirmLeft && (
            <button
              onClick={handleConfirm}
              className={`
                px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors
                focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                ${danger
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                }
              `}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
