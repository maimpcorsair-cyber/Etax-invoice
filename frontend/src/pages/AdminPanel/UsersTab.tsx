import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function UsersTab({ isThai, t }: { isThai: boolean; t: (k: string) => string }) {
  const { token, user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<Array<{
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'accountant' | 'viewer' | 'super_admin';
    isActive: boolean;
    createdAt: string;
    lastLoginAt?: string | null;
    auth?: {
      hasPassword: boolean;
      hasGoogle: boolean;
    };
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'viewer',
    password: '',
  });

  useEffect(() => {
    let active = true;

    async function loadUsers() {
      try {
        const res = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: typeof users; error?: string };
        if (!res.ok) {
          throw new Error(json.error ?? 'Failed to fetch users');
        }
        if (active) {
          setUsers(json.data ?? []);
        }
      } catch (e) {
        if (active) {
          setMsg({ type: 'err', text: (e as Error).message });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      active = false;
    };
  }, [token]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMsg(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          email: form.email.trim(),
          role: form.role,
          password: form.password.trim() || undefined,
        }),
      });

      const json = await res.json() as { data?: typeof users[number]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to create user');
      }

      if (json.data) {
        const createdUser = json.data;
        setUsers((prev) => [...prev, createdUser]);
      }
      setForm({ name: '', email: '', role: 'viewer', password: '' });
      setMsg({
        type: 'ok',
        text: isThai ? 'เพิ่มผู้ใช้สำเร็จ และบัญชีนี้สามารถเข้า Google ได้ทันที' : 'User added. This account can now sign in with Google.',
      });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateUser(targetUser: typeof users[number], updates: Partial<typeof users[number]> & { password?: string }) {
    setSavingId(targetUser.id);
    setMsg(null);

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const json = await res.json() as { data?: typeof users[number]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to update user');
      }

      if (json.data) {
        setUsers((prev) => prev.map((item) => item.id === json.data!.id ? json.data! : item));
      }
      setMsg({ type: 'ok', text: isThai ? 'อัปเดตผู้ใช้แล้ว' : 'User updated' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg text-gray-900">{t('admin.users')}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isThai
              ? 'เพิ่มอีเมลเพื่ออนุญาตให้ผู้ใช้เข้าสู่ระบบด้วย Google และกำหนดบทบาทได้จากหน้านี้'
              : 'Add user emails here to authorize Google sign-in and manage roles in one place.'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50/70">
        <form className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3" onSubmit={handleCreateUser}>
          <div>
            <label className="label">{t('common.name')}</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={isThai ? 'ชื่อที่แสดงผล' : 'Display name'}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input-field"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="user@company.com"
              required
            />
          </div>
          <div>
            <label className="label">{isThai ? 'บทบาท' : 'Role'}</label>
            <select
              className="input-field"
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
            >
              <option value="viewer">{isThai ? 'ผู้ดู' : 'Viewer'}</option>
              <option value="accountant">{isThai ? 'บัญชี' : 'Accountant'}</option>
              <option value="admin">{isThai ? 'ผู้ดูแลบริษัท' : 'Workspace Owner'}</option>
            </select>
          </div>
          <div>
            <label className="label">{isThai ? 'รหัสผ่านเริ่มต้น (ไม่บังคับ)' : 'Initial password (optional)'}</label>
            <input
              type="password"
              className="input-field"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder={isThai ? 'ปล่อยว่างเพื่อใช้ Google อย่างเดียว' : 'Leave blank for Google-only access'}
            />
          </div>
          <div className="md:col-span-2 xl:col-span-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={creating || !form.email.trim()}
              onClick={async () => {
                setCreating(true);
                setMsg(null);
                try {
                  const res = await fetch('/api/admin/team/invite', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      email: form.email.trim(),
                      role: form.role,
                      inviterName: currentUser?.name,
                    }),
                  });
                  const json = await res.json() as { data?: { acceptUrl?: string }; error?: string };
                  if (!res.ok) throw new Error(json.error ?? 'Failed to send invite');
                  setMsg({
                    type: 'ok',
                    text: isThai
                      ? `ส่งคำเชิญไปยัง ${form.email} แล้ว (ลิงก์อายุ 7 วัน)`
                      : `Invite sent to ${form.email} (7-day link)`,
                  });
                  setForm((prev) => ({ ...prev, email: '', name: '', password: '' }));
                } catch (e) {
                  setMsg({ type: 'err', text: (e as Error).message });
                } finally {
                  setCreating(false);
                }
              }}
            >
              {isThai ? 'ส่งคำเชิญทางอีเมล' : 'Send email invite'}
            </button>
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : (isThai ? '+ เพิ่มทันที' : '+ Add directly')}
            </button>
          </div>
        </form>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="table-header">{t('common.name')}</th>
              <th className="table-header">Email</th>
              <th className="table-header">{isThai ? 'สิทธิ์' : 'Access'}</th>
              <th className="table-header">{isThai ? 'วิธีเข้าใช้' : 'Sign-in methods'}</th>
              <th className="table-header">{isThai ? 'เข้าใช้ล่าสุด' : 'Last login'}</th>
              <th className="table-header">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((managedUser) => {
              const isSelf = managedUser.id === currentUser?.id;
              const canToggleActive = !isSelf;
              return (
                <tr key={managedUser.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="font-medium text-gray-900">{managedUser.name}</div>
                    <div className="text-xs text-gray-400">
                      {managedUser.isActive ? t('common.active') : t('common.inactive')}
                    </div>
                  </td>
                  <td className="table-cell text-gray-600 font-mono text-xs">{managedUser.email}</td>
                  <td className="table-cell">
                    <select
                      className="input-field min-w-[140px] py-2"
                      value={managedUser.role}
                      onChange={(e) => {
                        const role = e.target.value as typeof managedUser.role;
                        setUsers((prev) => prev.map((item) => item.id === managedUser.id ? { ...item, role } : item));
                      }}
                    >
                      {managedUser.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                      <option value="viewer">{isThai ? 'ผู้ดู' : 'Viewer'}</option>
                      <option value="accountant">{isThai ? 'บัญชี' : 'Accountant'}</option>
                      <option value="admin">{isThai ? 'ผู้ดูแลบริษัท' : 'Workspace Owner'}</option>
                    </select>
                  </td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-2">
                      <span className={managedUser.auth?.hasGoogle ? 'badge-success' : 'badge-info'}>
                        Google
                      </span>
                      <span className={managedUser.auth?.hasPassword ? 'badge-success' : 'badge-info'}>
                        Password
                      </span>
                    </div>
                  </td>
                  <td className="table-cell text-gray-500">
                    {managedUser.lastLoginAt
                      ? new Date(managedUser.lastLoginAt).toLocaleString(isThai ? 'th-TH' : 'en-GB')
                      : (isThai ? 'ยังไม่เคยเข้าใช้' : 'Never logged in')}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <label className={`flex items-center gap-2 text-xs ${canToggleActive ? 'text-gray-700' : 'text-gray-400'}`}>
                        <input
                          type="checkbox"
                          checked={managedUser.isActive}
                          disabled={!canToggleActive}
                          onChange={(e) => {
                            const isActive = e.target.checked;
                            setUsers((prev) => prev.map((item) => item.id === managedUser.id ? { ...item, isActive } : item));
                          }}
                        />
                        {isThai ? 'เปิดใช้งาน' : 'Active'}
                      </label>
                      <button
                        className="text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:text-gray-400"
                        disabled={savingId === managedUser.id || managedUser.role === 'super_admin'}
                        onClick={() => handleUpdateUser(managedUser, {
                          role: managedUser.role,
                          isActive: managedUser.isActive,
                        })}
                      >
                        {savingId === managedUser.id ? (isThai ? 'กำลังบันทึก...' : 'Saving...') : t('common.save')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
