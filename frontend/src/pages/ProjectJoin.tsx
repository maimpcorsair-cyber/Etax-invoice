import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';

interface ProjectJoinPreview {
  company?: { id: string; name: string } | null;
  project: { id: string; code: string; name: string; customerName?: string | null };
  lineGroup: { id: string; groupName?: string | null; pictureUrl?: string | null; memberCount?: number | null };
  member: {
    id: string;
    displayName?: string | null;
    pictureUrl?: string | null;
    role: string;
    linkedUser?: { id: string; name: string; email: string; role: string } | null;
  };
}

export default function ProjectJoin() {
  const { token: inviteToken = '' } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const { isThai } = useLanguage();
  const [preview, setPreview] = useState<ProjectJoinPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadPreview() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/project-portal/join/${inviteToken}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Project invite failed');
        if (active) setPreview(json.data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Project invite failed');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPreview();
    return () => { active = false; };
  }, [inviteToken]);

  async function acceptInvite() {
    if (!token || !preview) return;
    setAccepting(true);
    setError('');
    try {
      const res = await fetch(`/api/project-portal/join/${inviteToken}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Join project failed');
      navigate(`/app/projects/${json.data?.projectId ?? preview.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Join project failed');
    } finally {
      setAccepting(false);
    }
  }

  const loginHref = `/login?projectInvite=${encodeURIComponent(inviteToken)}`;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl lg:grid-cols-[0.95fr_1.05fr]">
          <section className="bg-slate-950 p-8 text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">
              <MessageCircle className="h-3.5 w-3.5" />
              {isThai ? 'LINE project team' : 'LINE project team'}
            </div>
            <h1 className="mt-5 text-3xl font-bold leading-tight">
              {isThai ? 'เข้าร่วมทีมโปรเจคจาก LINE' : 'Join the project team from LINE'}
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {isThai
                ? 'Billboy รับเอกสารจาก LINE guest ได้ก่อน แล้วให้คุณยืนยัน Google ทีหลังเพื่อดูสถานะ โปรเจค และสิทธิ์ในทีม'
                : 'Billboy lets LINE guests submit documents first, then verify with Google later for project access and team permissions.'}
            </p>
            <div className="mt-8 space-y-3 text-sm text-slate-200">
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> {isThai ? 'ผูก LINE นี้กับบัญชี Billboy' : 'Link this LINE identity to Billboy'}</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> {isThai ? 'เข้าเป็นสมาชิกโปรเจคอัตโนมัติ' : 'Join the project automatically'}</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> {isThai ? 'แอดมินยังปรับสิทธิ์ได้ภายหลัง' : 'Admins can adjust your role later'}</p>
            </div>
          </section>

          <section className="p-8">
            {loading ? (
              <div className="flex min-h-72 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            ) : error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <p className="font-semibold text-rose-800">{error}</p>
                <Link to="/login" className="mt-4 inline-flex text-sm font-semibold text-rose-700 underline">
                  {isThai ? 'กลับไปหน้า Login' : 'Back to login'}
                </Link>
              </div>
            ) : preview ? (
              <div>
                <div className="flex items-start gap-4">
                  {preview.lineGroup.pictureUrl ? (
                    <img src={preview.lineGroup.pictureUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <Users className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-500">{preview.company?.name ?? 'Billboy'}</p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">{preview.project.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {preview.project.code}
                      {preview.lineGroup.groupName ? ` · ${preview.lineGroup.groupName}` : ''}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {isThai ? 'LINE member' : 'LINE member'}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {preview.member.displayName || (isThai ? 'สมาชิก LINE' : 'LINE member')}
                    {preview.member.linkedUser ? ` → ${preview.member.linkedUser.email}` : ''}
                  </p>
                </div>

                {preview.member.linkedUser ? (
                  <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="font-semibold text-emerald-900">
                      {isThai ? 'สมาชิกนี้ผูกบัญชีแล้ว' : 'This member is already linked'}
                    </p>
                    <Link to={`/app/projects/${preview.project.id}`} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                      {isThai ? 'เปิดโปรเจค' : 'Open project'}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                ) : token && user ? (
                  <button
                    type="button"
                    onClick={() => void acceptInvite()}
                    disabled={accepting}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {isThai ? `ยืนยันเข้าทีมด้วย ${user.email}` : `Join with ${user.email}`}
                  </button>
                ) : (
                  <a
                    href={loginHref}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {isThai ? 'เข้าสู่ระบบด้วย Google เพื่อเข้าทีม' : 'Continue with Google to join'}
                  </a>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
