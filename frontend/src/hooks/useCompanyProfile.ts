import { useState, useEffect } from 'react';
import type { CompanyProfile } from '../types';

interface Options {
  token: string | null;
}

export function useCompanyProfile({ token }: Options) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/company/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j: { data?: CompanyProfile }) => setCompany(j.data ?? null))
      .catch(() => null);
  }, [token]);

  return { company };
}
