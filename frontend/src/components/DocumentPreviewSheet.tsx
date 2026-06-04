import { useEffect } from 'react';
import { Download, Loader2, Pencil, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';

interface DocumentPreviewSheetProps {
  open: boolean;
  title: string;
  description?: string;
  documentNumber: string;
  previewHtml: string | null;
  loading: boolean;
  error?: string | null;
  downloading?: boolean;
  editHref?: string;
  onDownload: () => void;
  onClose: () => void;
}

export default function DocumentPreviewSheet({
  open,
  title,
  description,
  documentNumber,
  previewHtml,
  loading,
  error,
  downloading = false,
  editHref,
  onDownload,
  onClose,
}: DocumentPreviewSheetProps) {
  const { isThai } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/55 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <style>{`
        .document-preview-stage {
          width: 100%;
          max-width: 794px;
          height: 100%;
          margin: 0 auto;
        }
        .document-preview-frame {
          width: 100%;
          height: 100%;
          border: 0;
          background: white;
        }
        @media (max-width: 640px) {
          .document-preview-stage {
            width: calc(100vw - 32px);
            height: calc((100vw - 32px) * 1.414);
            max-width: none;
          }
          .document-preview-frame {
            width: 794px;
            height: 1123px;
            transform: scale(calc((100vw - 32px) / 794));
            transform-origin: top left;
          }
        }
      `}</style>
      <section
        className="ml-auto flex h-[100dvh] w-full flex-col bg-white shadow-2xl shadow-slate-950/25 sm:max-w-5xl sm:border-l sm:border-slate-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              {isThai ? 'ตัวอย่างเอกสาร' : 'Document preview'}
            </p>
            <h2 id="document-preview-title" className="mt-1 truncate text-base font-bold text-slate-950 sm:text-lg">
              {title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              <span className="font-mono font-semibold text-slate-700">{documentNumber}</span>
              {description ? ` · ${description}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={isThai ? 'ปิดตัวอย่างเอกสาร' : 'Close document preview'}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                {isThai ? 'กำลังโหลดตัวอย่าง...' : 'Loading preview...'}
              </div>
            </div>
          ) : error ? (
            <div className="mx-auto mt-10 max-w-md rounded-2xl border border-rose-200 bg-white p-5 text-center shadow-sm">
              <p className="text-sm font-semibold text-rose-800">
                {isThai ? 'โหลดตัวอย่างเอกสารไม่สำเร็จ' : 'Could not load the document preview'}
              </p>
              <p className="mt-2 text-xs text-rose-600">{error}</p>
            </div>
          ) : previewHtml ? (
            <div className="document-preview-stage overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-950/10">
              <iframe
                srcDoc={previewHtml}
                className="document-preview-frame"
                title={title}
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              {isThai ? 'ยังไม่มีตัวอย่างเอกสาร' : 'No preview available'}
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white p-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:justify-end sm:p-4">
          {editHref && (
            <Link to={editHref} className="btn-secondary justify-center">
              <Pencil className="h-4 w-4" />
              {isThai ? 'แก้ไขเอกสาร' : 'Edit document'}
            </Link>
          )}
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading || loading || !previewHtml}
            className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading
              ? isThai ? 'กำลังสร้าง PDF...' : 'Generating PDF...'
              : isThai ? 'ดาวน์โหลด PDF' : 'Download PDF'}
          </button>
        </footer>
      </section>
    </div>
  );
}
