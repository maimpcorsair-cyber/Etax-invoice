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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isThai ? 'ตัวอย่างเอกสาร' : 'Document Preview'}
            </h3>
            <p className="text-xs text-gray-500">
              {isThai
                ? 'ตรวจข้อความและรูปแบบก่อนบันทึกหรือดาวน์โหลด PDF'
                : 'Review the wording and layout before saving or downloading the PDF.'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 p-4 min-h-0 bg-gray-100 overflow-auto">
          {previewLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                {isThai ? 'กำลังโหลดตัวอย่าง...' : 'Loading preview...'}
              </div>
            </div>
          ) : previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full border border-gray-200 rounded bg-white"
              title="Invoice Preview"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              {isThai ? 'ไม่สามารถโหลดตัวอย่างได้' : 'Unable to load preview'}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
          {previewHtml && (
            <button onClick={onDownload} disabled={downloading} className="btn-secondary">
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
          <button onClick={onClose} className="btn-primary">
            {isThai ? 'ปิด' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
