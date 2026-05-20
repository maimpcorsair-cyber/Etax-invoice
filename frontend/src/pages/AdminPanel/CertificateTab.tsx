import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, FlaskConical, Loader2, Upload, XCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function CertificateTab({ isThai }: { isThai: boolean; t: (k: string) => string }) {
  const { token } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [certInfo, setCertInfo] = useState<Record<string, unknown> | null>(null);
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok'|'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/certificate', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => setCertInfo((j as { data?: Record<string, unknown> }).data ?? null))
      .catch(() => {});
  }, [token]);

  async function handleUpload() {
    if (!selectedFile || !password) {
      setMsg({ type: 'err', text: isThai ? 'กรุณาเลือกไฟล์และใส่รหัสผ่าน' : 'Please select a file and enter password' });
      return;
    }
    setUploading(true); setMsg(null);
    try {
      const arrayBuf = await selectedFile.arrayBuffer();
      const p12Base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      const res = await fetch('/api/admin/certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ p12Base64, password }),
      });
      const json = await res.json() as { data?: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setCertInfo(json.data ?? null);
      setMsg({ type: 'ok', text: isThai ? '✅ อัพโหลด Certificate สำเร็จ' : '✅ Certificate uploaded successfully' });
      setSelectedFile(null);
      setPassword('');
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally { setUploading(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/admin/signing-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setTestResult(await res.json() as Record<string, unknown>);
    } catch (e) {
      setTestResult({ success: false, error: (e as Error).message });
    } finally { setTesting(false); }
  }

  const loaded = certInfo?.loaded as boolean | undefined;
  const isDev   = certInfo?.isDev as boolean | undefined;
  const isExpired = certInfo?.isExpired as boolean | undefined;

  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-lg text-gray-900">
        {isThai ? '🔐 ใบรับรองดิจิทัล (Digital Certificate)' : '🔐 Digital Certificate'}
      </h2>

      {/* Current cert status */}
      <div className={`p-4 rounded-xl border ${loaded ? (isExpired ? 'bg-red-50 border-red-200' : isDev ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200') : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start gap-3">
          {loaded
            ? isExpired ? <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"/>
            : <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0"/>
            : <AlertTriangle className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"/>
          }
          <div className="space-y-1 text-sm">
            {loaded ? (
              <>
                <p className="font-semibold">{certInfo?.commonName as string}</p>
                {isDev && <span className="inline-block px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded font-medium">DEV Self-Signed</span>}
                {isExpired && <span className="inline-block px-2 py-0.5 bg-red-200 text-red-800 text-xs rounded font-medium">EXPIRED</span>}
                <p className="text-gray-500">{isThai ? 'หมดอายุ:' : 'Valid until:'} {new Date(certInfo?.validUntil as string).toLocaleDateString('th-TH')}</p>
                <p className="text-gray-400 font-mono text-xs break-all">SHA-256: {(certInfo?.thumbprint as string)?.slice(0, 32)}...</p>
              </>
            ) : (
              <p className="text-gray-500">{certInfo?.error as string ?? (isThai ? 'ยังไม่ได้ตั้งค่า Certificate' : 'No certificate configured')}</p>
            )}
          </div>
        </div>
      </div>

      {isDev && loaded && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 space-y-1">
          <p className="font-semibold">⚠️ {isThai ? 'ใช้ Self-Signed Certificate (Dev Mode)' : 'Using Self-Signed Certificate (Dev Mode)'}</p>
          <p>{isThai ? 'Certificate นี้สร้างขึ้นเพื่อทดสอบเท่านั้น สรรพากรจะ reject ถ้าส่งจริง ต้องใช้ Certificate จาก TDID/INET/TOT' : 'This certificate is for testing only. RD will reject it in production. Replace with a TDID/INET/TOT issued certificate.'}</p>
        </div>
      )}

      {/* Upload new cert */}
      <div className="space-y-3">
        <h3 className="font-medium text-gray-800">{isThai ? 'อัพโหลด Certificate ใหม่' : 'Upload New Certificate'}</h3>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-primary-400 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2"/>
          {selectedFile ? (
            <p className="text-sm font-medium text-primary-600">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">{isThai ? 'คลิกเพื่อเลือกไฟล์ .p12 / .pfx' : 'Click to select .p12 / .pfx file'}</p>
              <p className="text-xs text-gray-400 mt-1">PKCS#12 format</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".p12,.pfx" className="hidden"
            onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />
        </div>

        <div>
          <label className="label">{isThai ? 'รหัสผ่าน Certificate' : 'Certificate Password'}</label>
          <input type="password" className="input-field" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)} />
        </div>

        {msg && (
          <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg.type === 'ok' ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
            {msg.text}
          </div>
        )}

        <button className="btn-primary" onClick={handleUpload} disabled={uploading || !selectedFile}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
          {isThai ? 'อัพโหลดและตรวจสอบ' : 'Upload & Validate'}
        </button>
      </div>

      {/* Signing test */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-800">{isThai ? '🧪 ทดสอบระบบ Signing' : '🧪 Signing System Test'}</h3>
          <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={handleTest} disabled={testing || !loaded}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin"/> : <FlaskConical className="w-4 h-4"/>}
            {isThai ? 'ทดสอบเลย' : 'Run Test'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {isThai ? 'ทดสอบ: โหลด cert → Sign XML (XAdES-BES) → ขอ Timestamp (TSA) — ตรวจสอบว่า pipeline ทำงานได้ก่อนส่งจริง' : 'Tests: load cert → Sign XML (XAdES-BES) → Request TSA timestamp — verify pipeline works before live submission'}
        </p>

        {testResult && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
            <div className={`flex items-center gap-2 font-semibold ${(testResult.success as boolean) ? 'text-green-700' : 'text-red-600'}`}>
              {(testResult.success as boolean) ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
              {(testResult.success as boolean)
                ? (isThai ? 'ทุกขั้นตอนผ่าน ✅' : 'All steps passed ✅')
                : (isThai ? 'มีขั้นตอนที่ล้มเหลว ❌' : 'Some steps failed ❌')}
            </div>
            {((testResult.steps ?? []) as { step: string; status: string; detail?: string; ms?: number }[]).map((s, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${s.status === 'ok' ? 'text-gray-600' : 'text-red-600'}`}>
                {s.status === 'ok' ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-green-500 flex-shrink-0"/> : <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>}
                <div>
                  <span className="font-medium">{s.step}</span>
                  {s.ms !== undefined && <span className="text-gray-400 ml-1">({s.ms}ms)</span>}
                  {s.detail && <p className="text-gray-500 font-mono break-all">{s.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
