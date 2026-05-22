import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

// /portal/verify?token=... — set token in localStorage, redirect to dashboard.
// We don't hit the server here; the token is its own credential and any
// downstream call will validate it via the Authorization header.

const STORAGE_KEY = 'customer_portal_token';

export default function CustomerPortalVerify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      navigate('/portal');
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch {
      // Ignore — Safari private mode etc.
    }
    navigate('/portal/dashboard', { replace: true });
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p>กำลังเปิดพอร์ทัล...</p>
      </div>
    </div>
  );
}
