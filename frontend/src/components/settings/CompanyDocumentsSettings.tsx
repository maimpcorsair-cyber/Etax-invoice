import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Loader2, FileText, Download } from 'lucide-react';
import type { CompanyDocument, CompanyDocumentType } from '../../types';
import { ConfirmDialog, ToastStack, type ConfirmDialogState, type FeedbackToast } from '../ui/AppFeedback';

// Company library documents (ภ.พ.20, certificate, bank book, profile, catalog).
// Uploaded once here, then attached to quotation customer links by reference.

const DOC_TYPE_OPTIONS: Array<{ value: CompanyDocumentType; th: string; en: string }> = [
  { value: 'por_por_20', th: 'ภ.พ.20', en: 'Por.Por.20' },
  { value: 'company_cert', th: 'หนังสือรับรองบริษัท', en: 'Company certificate' },
  { value: 'bank_book', th: 'บุ๊คแบงก์ / หน้าสมุดบัญชี', en: 'Bank book' },
  { value: 'company_profile', th: 'โปรไฟล์บริษัท', en: 'Company profile' },
  { value: 'catalog', th: 'แคตตาล็อก / โบรชัวร์', en: 'Catalog / brochure' },
  { value: 'other', th: 'อื่น ๆ', en: 'Other' },
];

function typeLabel(docType: string, isThai: boolean): string {
  const opt = DOC_TYPE_OPTIONS.find((o) => o.value === docType);
  return opt ? (isThai ? opt.th : opt.en) : docType;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  token: string | null;
  isThai: boolean;
  canManage: boolean;
}

export default function CompanyDocumentsSettings({ token, isThai, canManage }: Props) {
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<CompanyDocumentType>('por_por_20');
  const [label, setLabel] = useState('');
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pushToast = useCallback((toast: Omit<FeedbackToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4800);
  }, []);

  const fetchDocs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/company-documents', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: CompanyDocument[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setDocs(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchDocs(); }, [fetchDocs]);

  async function handleUpload(file: File) {
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);
      if (label.trim()) formData.append('label', label.trim());
      const res = await fetch('/api/company-documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json() as { data?: CompanyDocument; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Upload failed');
      setDocs((prev) => [json.data!, ...prev]);
      setLabel('');
      pushToast({
        tone: 'success',
        title: isThai ? 'อัปโหลดเอกสารแล้ว' : 'Document uploaded',
        description: json.data.label || json.data.fileName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      pushToast({
        tone: 'error',
        title: isThai ? 'อัปโหลดไม่สำเร็จ' : 'Upload failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(id: string) {
    if (!token) return;
    setConfirmDialog(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/company-documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? 'Delete failed');
      }
      setDocs((prev) => prev.filter((d) => d.id !== id));
      pushToast({
        tone: 'success',
        title: isThai ? 'ลบเอกสารแล้ว' : 'Document deleted',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      pushToast({
        tone: 'error',
        title: isThai ? 'ลบเอกสารไม่สำเร็จ' : 'Delete failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeletingId(null);
    }
  }

  function requestDelete(doc: CompanyDocument) {
    setConfirmDialog({
      tone: 'error',
      title: isThai ? 'ลบเอกสารบริษัทนี้?' : 'Delete this company document?',
      description: isThai
        ? 'เอกสารนี้จะถูกนำออกจากคลังไฟล์บริษัท และลิงก์แนบกับใบเสนอราคาจะเปิดไม่ได้'
        : 'This removes the file from the company library and quotation attachments will no longer open.',
      confirmLabel: isThai ? 'ลบเอกสาร' : 'Delete document',
      cancelLabel: isThai ? 'ยกเลิก' : 'Cancel',
      detail: (
        <div>
          <p className="font-semibold text-slate-900">{doc.label || doc.fileName}</p>
          <p className="mt-1 text-xs text-slate-500">{typeLabel(doc.docType, isThai)} · {formatSize(doc.fileSize)}</p>
        </div>
      ),
      onConfirm: () => void deleteDocument(doc.id),
      onCancel: () => setConfirmDialog(null),
    });
  }

  return (
    <div className="space-y-4">
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))} />
      <ConfirmDialog dialog={confirmDialog} />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {canManage && (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <div>
            <label className="label">{isThai ? 'ประเภท' : 'Type'}</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value as CompanyDocumentType)} className="input-field">
              {DOC_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{isThai ? opt.th : opt.en}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{isThai ? 'ชื่อที่แสดง (ไม่บังคับ)' : 'Display label (optional)'}</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="input-field" placeholder={isThai ? 'เช่น ภ.พ.20 ปี 2569' : 'e.g. Por.Por.20 (2026)'} />
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-primary inline-flex w-full items-center justify-center gap-2"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isThai ? 'อัปโหลด' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
      ) : docs.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
          {isThai ? 'ยังไม่มีเอกสารบริษัท อัปโหลด ภ.พ.20 หนังสือรับรอง หรือบุ๊คแบงก์ ไว้แนบกับใบเสนอราคาได้' : 'No company documents yet. Upload Por.Por.20, certificate, or bank book to attach to quotations.'}
        </p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{doc.label || doc.fileName}</div>
                <div className="truncate text-xs text-slate-400">
                  {typeLabel(doc.docType, isThai)} · {doc.fileName} · {formatSize(doc.fileSize)}
                </div>
              </div>
              <a
                href={`/api/company-documents/${doc.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                title={isThai ? 'ดูไฟล์' : 'View file'}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              {canManage && (
                <button
                  type="button"
                  onClick={() => requestDelete(doc)}
                  disabled={deletingId === doc.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  title={isThai ? 'ลบ' : 'Delete'}
                >
                  {deletingId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
