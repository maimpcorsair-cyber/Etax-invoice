import { useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { translateZodMessage } from '../utils/invoiceHelpers';

interface Options {
  token: string | null;
  clearAuth: () => void;
  navigate: NavigateFunction;
  isThai: boolean;
}

export function useInvoicePreview({ token, clearAuth, navigate, isThai }: Options) {
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<object | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const openPreview = async (payload: object) => {
    if (!token) {
      clearAuth();
      navigate('/login');
      return;
    }

    setPreviewError(null);
    setPreviewHtml(null);
    setPreviewLoading(true);
    setShowPreviewModal(true);
    setPreviewPayload(payload);

    try {
      const response = await fetch('/api/invoices/preview?format=html', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 401) {
          clearAuth();
          navigate('/login');
          return;
        }
        let message = isThai ? 'ไม่สามารถแสดงตัวอย่างได้' : 'Preview failed';
        try {
          const errData = (await response.json()) as {
            error?: string;
            details?: { path: (string | number)[]; message: string }[];
          };
          if (errData.details?.length) {
            message = errData.details
              .map((d) => {
                const field = d.path.join('.');
                const msg = isThai ? translateZodMessage(d.message) : d.message;
                return `${field}: ${msg}`;
              })
              .join('\n');
          } else if (errData.error) {
            message = errData.error;
          }
        } catch {
          /* ignore parse errors */
        }
        throw new Error(message);
      }

      const html = await response.text();
      if (html.length < 100) {
        throw new Error(isThai ? 'ตัวอย่างว่างเปล่า' : 'Received empty preview');
      }
      setPreviewHtml(html);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : isThai
            ? 'ไม่สามารถแสดงตัวอย่างได้ กรุณาลองใหม่'
            : 'Preview failed. Please try again.';
      setPreviewError(message);
      setShowPreviewModal(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!token || !previewPayload) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      const response = await fetch('/api/invoices/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(previewPayload),
      });
      if (!response.ok) {
        throw new Error(isThai ? 'ดาวน์โหลดล้มเหลว' : 'Download failed');
      }
      const blob = new Blob([await response.arrayBuffer()], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : isThai
            ? 'ดาวน์โหลดล้มเหลว'
            : 'Download failed',
      );
    } finally {
      setDownloading(false);
    }
  };

  const closePreview = () => {
    setShowPreviewModal(false);
    setPreviewHtml(null);
    setPreviewPayload(null);
    setDownloadError(null);
  };

  return {
    showPreviewModal,
    previewHtml,
    previewPayload,
    previewLoading,
    downloading,
    previewError,
    downloadError,
    clearPreviewError: () => setPreviewError(null),
    clearDownloadError: () => setDownloadError(null),
    openPreview,
    handleDownloadPdf,
    closePreview,
  };
}
