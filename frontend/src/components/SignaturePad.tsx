import { useRef, useState, useEffect, useCallback } from 'react';
import { Pencil, Type, Upload, Eraser } from 'lucide-react';

type Mode = 'draw' | 'type' | 'upload';

interface Props {
  value: string | null;          // PNG data URL (or null)
  onChange: (dataUrl: string | null) => void;
  isThai: boolean;
}

const W = 560;
const H = 200;

/**
 * Signature input with three easy modes so non-technical users never have to
 * "find a signature file": draw with finger/mouse, type their name into a
 * handwriting style, or upload an image. All three produce the same PNG data
 * URL stored in the document signature profile. This is a VISUAL signature
 * only (same legal weight as a signature on paper) — not a digital e-signature.
 */
export default function SignaturePad({ value, onChange, isThai }: Props) {
  const [mode, setMode] = useState<Mode>('draw');
  const [typedName, setTypedName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  // Prepare the canvas (retina-scaled, white-ish transparent background).
  const ctx = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return null;
    const g = c.getContext('2d');
    if (!g) return null;
    return g;
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#1f2937';
  }, [mode]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = ctx(); if (!g) return;
    drawing.current = true; dirty.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const g = ctx(); if (!g) return;
    const p = pos(e); g.lineTo(p.x, p.y); g.stroke();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current && canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'));
  }
  function clearCanvas() {
    const g = ctx(); if (!g || !canvasRef.current) return;
    g.clearRect(0, 0, W, H);
    dirty.current = false;
    onChange(null);
  }

  // Type mode → render the typed name in a signature-ish style to a PNG.
  function renderTyped(name: string) {
    setTypedName(name);
    if (!name.trim()) { onChange(null); return; }
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d'); if (!g) return;
    g.scale(dpr, dpr);
    g.fillStyle = '#1f2937';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = "italic 600 60px 'Sarabun', cursive";
    g.fillText(name.trim(), W / 2, H / 2, W - 40);
    onChange(c.toDataURL('image/png'));
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange((ev.target?.result as string) ?? null);
    reader.readAsDataURL(file);
  }

  const tabs: Array<{ id: Mode; label: string; Icon: typeof Pencil }> = [
    { id: 'draw', label: isThai ? 'วาด' : 'Draw', Icon: Pencil },
    { id: 'type', label: isThai ? 'พิมพ์ชื่อ' : 'Type', Icon: Type },
    { id: 'upload', label: isThai ? 'อัปโหลด' : 'Upload', Icon: Upload },
  ];

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex gap-1">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mode === id ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {mode === 'draw' && (
        <div>
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            className="w-full rounded-lg border border-dashed border-slate-300 bg-white"
            style={{ touchAction: 'none', aspectRatio: `${W} / ${H}` }}
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">{isThai ? 'เซ็นด้วยนิ้วหรือเมาส์' : 'Sign with finger or mouse'}</span>
            <button type="button" onClick={clearCanvas} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600">
              <Eraser className="h-3.5 w-3.5" /> {isThai ? 'ล้าง' : 'Clear'}
            </button>
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div>
          <input
            className="input-field"
            value={typedName}
            onChange={(e) => renderTyped(e.target.value)}
            placeholder={isThai ? 'พิมพ์ชื่อเพื่อสร้างลายเซ็น' : 'Type your name'}
          />
          <p className="mt-1 text-xs text-slate-400">{isThai ? 'ระบบจะแปลงชื่อเป็นลายเซ็นให้อัตโนมัติ' : 'Your name becomes a styled signature automatically.'}</p>
        </div>
      )}

      {mode === 'upload' && (
        <input
          type="file"
          accept="image/*"
          onChange={onUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
        />
      )}

      {value && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 p-2">
          <img src={value} alt="signature preview" className="h-16 max-w-[220px] object-contain" />
          <button type="button" onClick={() => onChange(null)} className="text-xs text-slate-500 hover:text-rose-600">
            {isThai ? 'ลบลายเซ็น' : 'Remove'}
          </button>
        </div>
      )}
    </div>
  );
}
