import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileText, Eye, EyeOff, ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useLanguage } from '../hooks/useLanguage';
import { buildPlaneUrl, detectSurface, getApexOrigin, getPlanePath } from '../lib/platform';

interface GoogleConfigResponse {
  enabled: boolean;
  clientId: string | null;
}

export default function Login() {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth, token, user, authReady } = useAuthStore();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleConfig, setGoogleConfig] = useState<GoogleConfigResponse | null>(null);
  const surface = detectSurface();
  const ownerMode = location.pathname.startsWith('/ops/') || surface === 'ops';
  const isLocalSubdomain = window.location.hostname === 'app.localhost' || window.location.hostname === 'ops.localhost';
  const localGoogleSafeUrl = `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ''}${ownerMode ? '/ops/login' : '/app/login'}`;

  useEffect(() => {
    if (!authReady || !token || !user) {
      return;
    }

    if (ownerMode) {
      if (user.role === 'super_admin') {
        window.location.replace(buildPlaneUrl('/ops/overview', 'ops', { token, user }));
      } else {
        window.location.replace(buildPlaneUrl('/app/dashboard', 'app', { token, user }));
      }
      return;
    }

    if (user.role === 'super_admin') {
      window.location.replace(buildPlaneUrl('/ops/overview', 'ops', { token, user }));
      return;
    }

    window.location.replace(buildPlaneUrl('/app/dashboard', 'app', { token, user }));
  }, [authReady, ownerMode, token, user]);

  useEffect(() => {
    // Use build-time env var first (instant, no backend round-trip)
    const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (envClientId) {
      setGoogleConfig({ enabled: true, clientId: envClientId });
      return;
    }

    // Fallback: fetch from backend (slower — avoid in production by setting VITE_GOOGLE_CLIENT_ID)
    let active = true;
    async function loadGoogleConfig() {
      try {
        const res = await fetch('/api/auth/google/config');
        if (!res.ok) return;
        const data = await res.json() as GoogleConfigResponse;
        if (active) setGoogleConfig(data);
      } catch {
        if (active) setGoogleConfig({ enabled: false, clientId: null });
      }
    }
    loadGoogleConfig();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!googleConfig?.enabled || !googleConfig.clientId || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;
    const clientId = googleConfig.clientId;

    const renderGoogleButton = () => {
      if (cancelled || !googleButtonRef.current || !window.google) {
        return false;
      }

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setGoogleLoading(true);
          setError('');

          try {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });

            const data = await res.json();
            if (!res.ok) {
              setError(data?.error || (isThai ? 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ' : 'Google sign-in failed'));
              return;
            }

            setAuth(data.token, data.user);
            if (data.user?.role === 'super_admin') {
              window.location.replace(buildPlaneUrl('/ops/overview', 'ops', { token: data.token, user: data.user }));
              return;
            }

            window.location.replace(buildPlaneUrl('/app/dashboard', 'app', { token: data.token, user: data.user }));
          } catch {
            setError(isThai ? 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ' : 'Google sign-in failed');
          } finally {
            setGoogleLoading(false);
          }
        },
      });

      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: Math.min(380, googleButtonRef.current.clientWidth || 380),
        logo_alignment: 'left',
      });

      return true;
    };

    if (renderGoogleButton()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (renderGoogleButton()) {
        window.clearInterval(intervalId);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [googleConfig, isThai, navigate, ownerMode, setAuth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || t('auth.loginError'));
        return;
      }

      setAuth(data.token, data.user);
      if (data.user?.role === 'super_admin') {
        window.location.replace(buildPlaneUrl('/ops/overview', 'ops', { token: data.token, user: data.user }));
        return;
      }
      window.location.replace(buildPlaneUrl('/app/dashboard', 'app', { token: data.token, user: data.user }));
    } catch {
      setError(t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex items-center justify-between p-4 sm:p-6">
        <a href={getApexOrigin()} className="flex items-center gap-2 group">
          <FileText className="w-6 h-6 text-primary-700" strokeWidth={2} />
          <span className="font-bold text-lg text-gray-900 group-hover:text-primary-600 transition-colors hidden sm:inline">{t('app.shortName')}</span>
        </a>
        <div className="flex items-center gap-3">
          {!ownerMode && (
            <a href={getPlanePath('/login', 'ops')} className="hidden sm:inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100">
              <ShieldCheck className="h-4 w-4" />
              {isThai ? 'Owner Login' : 'Owner Login'}
            </a>
          )}
          {ownerMode && (
            <a href={getPlanePath('/login', 'app')} className="hidden sm:inline-flex rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100">
              {isThai ? 'Customer Login' : 'Customer Login'}
            </a>
          )}
          <LanguageSwitcher variant="toggle" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12 z-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="card shadow-2xl">
            <div className="mb-8">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]">
                {ownerMode ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                    <span className="text-amber-900">{isThai ? 'Owner Plane Access' : 'Owner Plane Access'}</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5 text-primary-700" />
                    <span className="text-primary-900">{isThai ? 'Customer Workspace' : 'Customer Workspace'}</span>
                  </>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                {ownerMode ? (isThai ? 'เข้าสู่ระบบสำหรับเจ้าของระบบ' : 'Owner sign in') : t('auth.login')}
              </h1>
              <p className="text-sm text-gray-500">
                {ownerMode
                  ? (isThai ? 'ทางเข้าเฉพาะสำหรับ Owner Plane และงานดูแลทั้งระบบ' : 'Dedicated entry for Owner Plane and system-wide operations.')
                  : t('app.tagline')}
              </p>
            </div>

            <div className={`mb-6 rounded-2xl px-4 py-3 ${ownerMode ? 'border border-amber-200 bg-amber-50' : 'border border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-start gap-3">
                {ownerMode ? (
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-amber-700" />
                ) : (
                  <Lock className="mt-0.5 h-4 w-4 text-emerald-700" />
                )}
                <div className="space-y-1">
                  <p className={`text-sm font-semibold ${ownerMode ? 'text-amber-900' : 'text-emerald-900'}`}>
                    {ownerMode
                      ? (isThai ? 'ใช้เฉพาะบัญชีเจ้าของระบบ' : 'Use only with owner accounts')
                      : (isThai ? 'เจ้าของระบบ / Super Admin' : 'Owner / Super Admin')}
                  </p>
                  <p className={`text-xs leading-5 ${ownerMode ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {ownerMode
                      ? (isThai
                        ? 'ถ้าบัญชีนี้ไม่ใช่ super_admin ระบบจะไม่อนุญาตให้เข้า Owner Plane จากหน้านี้'
                        : 'Only super admin accounts can continue from this entry into Owner Plane.')
                      : (isThai
                        ? 'ถ้าบัญชีเป็น super_admin ระบบจะพาไปหน้า Owner Plane อัตโนมัติหลัง login'
                        : 'If the account is a super_admin, the system will take it to Owner Plane automatically after sign-in.')}
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-3 mb-6">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {isThai ? 'เข้าสู่ระบบด้วย Google' : 'Continue with Google'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {isThai
                    ? 'บัญชี Google ต้องถูกเพิ่มอีเมลไว้ในระบบก่อนโดยผู้ดูแล'
                    : 'Your Google email must already be added by an administrator.'}
                </p>
              </div>

              {isLocalSubdomain && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-900">
                        {isThai ? 'Google อาจบล็อก app.localhost ในเครื่อง dev' : 'Google may block app.localhost in local dev'}
                      </p>
                      <p className="text-xs leading-5 text-amber-800">
                        {isThai
                          ? 'ถ้าขึ้น “การเข้าถึงถูกบล็อก” ให้เปิดผ่าน localhost หรือใช้รหัสผ่านด้านล่าง'
                          : 'If access is blocked, open through localhost or use the password form below.'}
                      </p>
                      <a href={localGoogleSafeUrl} className="inline-flex text-xs font-semibold text-amber-900 underline underline-offset-2">
                        {isThai ? 'เปิดหน้า login ผ่าน localhost' : 'Open login through localhost'}
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <div
                ref={googleButtonRef}
                className={`min-h-[44px] flex items-center justify-center ${googleLoading ? 'opacity-60' : ''}`}
              >
                {!googleConfig?.enabled && (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-full border border-gray-300 bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-400"
                  >
                    {isThai ? 'กำลังตั้งค่า Google Sign-In' : 'Google Sign-In is not configured'}
                  </button>
                )}
              </div>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                <span className="bg-white px-3">{isThai ? 'หรือ' : 'or'}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="admin@siamtech.co.th"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label">{t('auth.password')}</label>
                  <span className="text-xs font-semibold text-gray-400">
                    {isThai ? 'ใช้ได้กับบัญชีที่ตั้งรหัสผ่านไว้' : 'Available for password-enabled accounts'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" strokeWidth={2} />
                    ) : (
                      <Eye className="w-5 h-5" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-2 border-gray-300 text-primary-600 focus:ring-2 focus:ring-primary-500 cursor-pointer"
                  defaultChecked
                />
                <span className="font-medium group-hover:text-gray-900 transition-colors">{t('auth.rememberMe')}</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full lg justify-center group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.loading')}
                  </span>
                ) : (
                  <>
                    {t('auth.loginButton')}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="my-6 border-t border-gray-200" />

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-2">
              <p className="text-xs font-semibold text-gray-600">{isThai ? 'แนวทางการเข้าใช้งาน' : 'How access works'}</p>
              <div className="space-y-1 text-xs text-gray-600">
                <p>{isThai ? '1. ผู้ดูแลเพิ่มอีเมลผู้ใช้ในหน้า Admin > User Management' : '1. Admin adds the user email in Admin > User Management'}</p>
                <p>{isThai ? '2. ผู้ใช้กด Sign in with Google ด้วยอีเมลเดียวกัน' : '2. User signs in with the same Google email'}</p>
                <p>{isThai ? '3. หากบัญชีนั้นมีรหัสผ่าน จะยังใช้ password login เดิมได้' : '3. If the account has a password, password login still works too'}</p>
              </div>
            </div>
          </div>

          <div className="text-center mt-6">
            <p className="text-sm text-gray-600">
              {ownerMode
                ? (isThai ? 'หากคุณเป็นผู้ใช้ทั่วไป ให้กลับไปใช้หน้า Customer Login' : 'If you are a regular user, go back to Customer Login.')
                : (isThai ? 'หากยังไม่มีสิทธิ์เข้าใช้ ให้ติดต่อผู้ดูแลระบบ' : 'If you do not have access yet, contact your administrator')}
            </p>
            <div className="mt-3">
              <a href={ownerMode ? getPlanePath('/login', 'app') : getPlanePath('/login', 'ops')} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                {ownerMode ? (isThai ? 'ไปหน้า Customer Login' : 'Go to Customer Login') : (isThai ? 'ไปหน้า Owner Login' : 'Go to Owner Login')}
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center p-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Lock className="w-3 h-3" />
          {t('auth.secure')} • SSL Encrypted
        </span>
      </div>
    </div>
  );
}
