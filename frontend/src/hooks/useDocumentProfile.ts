import { useCallback, useEffect, useState } from 'react';
import type { BankAccountProfile, SignatureProfile } from '../types';

interface DocumentProfile {
  bankAccounts: BankAccountProfile[];
  signatureProfile: SignatureProfile | null;
}

type BankAccountProfileInput = Omit<BankAccountProfile, 'id'> & { id?: string };

interface DocumentProfileInput {
  bankAccounts?: BankAccountProfileInput[];
  signatureProfile?: SignatureProfile | null;
}

interface Options {
  token: string | null;
}

const emptyProfile: DocumentProfile = {
  bankAccounts: [],
  signatureProfile: null,
};

export function formatBankPaymentInfo(account: BankAccountProfile, isThai: boolean) {
  const lines = [
    `${isThai ? 'ธนาคาร' : 'Bank'}: ${account.bankName}`,
    `${isThai ? 'ชื่อบัญชี' : 'Account name'}: ${account.accountName}`,
    `${isThai ? 'เลขที่บัญชี' : 'Account no.'}: ${account.accountNumber}`,
    account.branch ? `${isThai ? 'สาขา' : 'Branch'}: ${account.branch}` : null,
    account.promptPayId ? `PromptPay: ${account.promptPayId}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

export function useDocumentProfile({ token }: Options) {
  const [profile, setProfile] = useState<DocumentProfile>(emptyProfile);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/company/document-profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: DocumentProfile; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to load document profile');
      setProfile({
        bankAccounts: json.data.bankAccounts ?? [],
        signatureProfile: json.data.signatureProfile ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document profile');
      setProfile(emptyProfile);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const saveProfile = useCallback(async (next: DocumentProfileInput) => {
    if (!token) return null;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        bankAccounts: next.bankAccounts,
        signatureProfile: next.signatureProfile,
      };
      const res = await fetch('/api/company/document-profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { data?: DocumentProfile; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to save document profile');
      const saved = {
        bankAccounts: json.data.bankAccounts ?? [],
        signatureProfile: json.data.signatureProfile ?? null,
      };
      setProfile(saved);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document profile');
      return null;
    } finally {
      setSaving(false);
    }
  }, [token]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return {
    profile,
    loading,
    saving,
    error,
    reloadProfile: loadProfile,
    saveProfile,
    setProfile,
  };
}
