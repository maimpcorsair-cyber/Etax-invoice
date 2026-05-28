import { X, Download } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

interface Props {
  show: boolean;
  previewLoading: boolean;
  previewHtml: string | null;
  downloading: boolean;
  onDownload: () => void;
  onClose: () => void;
}

export default function PreviewModal({
  show,
  previewLoading,
  previewHtml,
  downloading,
  onDownload,
  onClose,
}: Props) {
  const { isThai } = useLanguage();
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <style>{`
        .invoice-preview-stage {
          width: 100%;
          max-width: 794px;
          height: 100%;
          margin: 0 auto;
        }
        .invoice-preview-frame {
          width: 100%;
          height: 100%;
          border: 0;
          background: white;
        }
        @media (max-width: 640px) {
          .invoice-preview-stage {
            width: calc(100vw - 32px);
            height: calc((100vw - 32px) * 1.414);
            max-width: none;
          }
          .invoice-preview-frame {
            width: 794px;
            height: 1123px;
            transform: scale(calc((100vw - 32px) / 794));
            transform-origin: top left;
          }
        }
      `}</style>
      <div className="flex h-[100dvh] w-full flex-col bg-white shadow-xl sm:h-[90vh] sm:max-w-5xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
              {isThai ? 'ตัวอย่างเอกสาร' : 'Document Preview'}
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-gray-500">
              {isThai
                ? 'ตรวจข้อความและรูปแบบก่อนบันทึกหรือดาวน์โหลด PDF'
                : 'Review the wording and layout before saving or downloading the PDF.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gray-100 p-4">
          {previewLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                {isThai ? 'กำลังโหลดตัวอย่าง...' : 'Loading preview...'}
              </div>
            </div>
          ) : previewHtml ? (
            <div className="invoice-preview-stage overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
              <iframe
                srcDoc={previewHtml}
                className="invoice-preview-frame"
                title="Invoice Preview"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              {isThai ? 'ไม่สามารถโหลดตัวอย่างได้' : 'Unable to load preview'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-gray-200 bg-white p-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:flex sm:justify-end sm:p-4">
          {previewHtml && (
            <button onClick={onDownload} disabled={downloading} className="btn-secondary justify-center">
              <Download className="w-4 h-4" />
              {downloading
                ? isThai
                  ? 'กำลังสร้าง PDF...'
                  : 'Generating PDF...'
                : isThai
                  ? 'ดาวน์โหลด PDF'
                  : 'Download PDF'}
            </button>
          )}
          <button onClick={onClose} className="btn-primary justify-center">
            {isThai ? 'ปิด' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
