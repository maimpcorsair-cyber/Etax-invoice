import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import type { CompanyAccessPolicy } from '../types';

export function useCompanyAccessPolicy() {
  const { token } = useAuthStore();
  const [policy, setPolicy] = useState<CompanyAccessPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPolicy() {
      if (!token) {
        if (active) {
          setPolicy(null);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch('/api/billing/access-policy', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: CompanyAccessPolicy; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Failed to load access policy');
        if (active) setPolicy(json.data ?? null);
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPolicy();
    return () => { active = false; };
  }, [token]);

  return { policy, loading, error };
}
