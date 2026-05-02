import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';

export interface DriveStatus {
  configured: boolean;
  connected: boolean;
  linkedAt: string | null;
}

export function useDriveStatus() {
  const { token } = useAuthStore();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/drive/status', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setStatus(json.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Handle redirect back from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const drive = params.get('drive');
    if (drive) {
      // Remove the query param without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('drive');
      window.history.replaceState({}, '', url.toString());
      void refresh();
    }
  }, [refresh]);

  async function connect() {
    if (!token) return;
    setConnecting(true);
    try {
      const res = await fetch('/api/drive/connect', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.data?.url) {
        window.location.href = json.data.url;
      }
    } catch {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!token) return;
    await fetch('/api/drive/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    await refresh();
  }

  return { status, loading, connecting, connect, disconnect, refresh };
}
