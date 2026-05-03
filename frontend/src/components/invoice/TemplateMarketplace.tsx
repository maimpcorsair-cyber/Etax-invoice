import { useState, useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { builtinDocumentTemplates, supportsDocumentType } from '../../lib/documentTemplatePresets';
import type { DocumentTemplateOption } from '../../types';
import type { InvoiceType } from '../../types';

/* ─── Color lookup: Tailwind class → hex ─────────────────────── */
const tw: Record<string, string> = {
  'bg-white': '#ffffff',
  'bg-slate-50': '#f8fafc',
  'bg-slate-100': '#f1f5f9',
  'bg-slate-200': '#e2e8f0',
  'bg-slate-300': '#cbd5e1',
  'bg-slate-400': '#94a3b8',
  'bg-slate-500': '#64748b',
  'bg-slate-600': '#475569',
  'bg-slate-700': '#334155',
  'bg-slate-800': '#1e293b',
  'bg-slate-900': '#0f172a',
  'bg-gray-100': '#f3f4f6',
  'bg-gray-200': '#e5e7eb',
  'bg-gray-400': '#9ca3af',
  'bg-gray-700': '#374151',
  'bg-gray-800': '#1f2937',
  'bg-gray-900': '#111827',
  'bg-neutral-900': '#171717',
  'bg-blue-50': '#eff6ff',
  'bg-blue-100': '#dbeafe',
  'bg-blue-200': '#bfdbfe',
  'bg-blue-300': '#93c5fd',
  'bg-blue-400': '#60a5fa',
  'bg-blue-500': '#3b82f6',
  'bg-blue-600': '#2563eb',
  'bg-blue-700': '#1d4ed8',
  'bg-blue-800': '#1e40af',
  'bg-blue-900': '#1e3a8a',
  'bg-blue-950': '#172554',
  'bg-indigo-200': '#c7d2fe',
  'bg-indigo-500': '#6366f1',
  'bg-violet-100': '#ede9fe',
  'bg-violet-200': '#ddd6fe',
  'bg-violet-400': '#a78bfa',
  'bg-violet-500': '#8b5cf6',
  'bg-violet-600': '#7c3aed',
  'bg-teal-100': '#ccfbf1',
  'bg-teal-500': '#14b8a6',
  'bg-teal-700': '#0f766e',
  'bg-emerald-100': '#d1fae5',
  'bg-emerald-200': '#a7f3d0',
  'bg-emerald-400': '#34d399',
  'bg-emerald-600': '#059669',
  'bg-emerald-700': '#047857',
  'bg-emerald-50': '#ecfdf5',
  'bg-green-100': '#dcfce7',
  'bg-green-800': '#166534',
  'bg-cyan-100': '#cffafe',
  'bg-cyan-400': '#22d3ee',
  'bg-cyan-700': '#0e7490',
  'bg-yellow-100': '#fef9c3',
  'bg-yellow-200': '#fef08a',
  'bg-yellow-300': '#fde047',
  'bg-yellow-400': '#facc15',
  'bg-amber-200': '#fde68a',
  'bg-amber-400': '#fbbf24',
  'bg-amber-500': '#f59e0b',
  'bg-orange-50': '#fff7ed',
  'bg-orange-200': '#fed7aa',
  'bg-orange-600': '#ea580c',
  'bg-orange-700': '#c2410c',
  'bg-red-400': '#f87171',
  'bg-pink-200': '#fbcfe8',
  'bg-pink-400': '#f472b6',
  'bg-pink-600': '#db2777',
  'bg-yellow-50': '#fefce8',
  'bg-yellow-800': '#854d0e',
  'bg-yellow-600': '#ca8a04',
  'bg-neutral-950': '#0a0a0a',
  'bg-neutral-800': '#262626',
  'bg-red-700': '#b91c1c',
  'bg-red-500': '#ef4444',
  'bg-red-50': '#fff5f5',
  'bg-cyan-500': '#06b6d4',
  'bg-cyan-950': '#083344',
  'bg-slate-950': '#020617',
  'bg-purple-950': '#3b0764',
  'bg-purple-700': '#7e22ce',
  'bg-purple-600': '#9333ea',
  'bg-purple-500': '#a855f7',
  'bg-purple-400': '#c084fc',
  'bg-purple-300': '#d8b4fe',
  'bg-purple-50': '#faf5ff',
  'bg-green-950': '#052e16',
  'bg-green-400': '#4ade80',
  'bg-violet-950': '#2e1065',
  'bg-violet-900': '#4c1d95',
  'bg-violet-50': '#f5f3ff',
  'bg-indigo-950': '#1e1b4b',
  'bg-indigo-900': '#312e81',
  'bg-stone-950': '#1c1917',
  'bg-stone-900': '#1c1917',
  'bg-pink-500': '#ec4899',
  'bg-pink-300': '#f9a8d4',
  'bg-pink-50': '#fdf2f8',
  'bg-orange-500': '#f97316',
};
const toHex = (cls: string) => tw[cls] ?? '#94a3b8';

/* ─── Category groups ─────────────────────────────────────────── */
const CATEGORIES = [
  { key: 'all',       labelTh: 'ทั้งหมด',      labelEn: 'All' },
  { key: 'Standard',  labelTh: 'มาตรฐาน',      labelEn: 'Standard' },
  { key: 'Minimal',   labelTh: 'Minimal',       labelEn: 'Minimal' },
  { key: 'Pro',       labelTh: 'Professional',  labelEn: 'Pro' },
  { key: 'Cute',      labelTh: 'น่ารัก',        labelEn: 'Cute' },
  { key: 'Dark',      labelTh: 'Dark / Man',    labelEn: 'Dark' },
  { key: 'Anime',     labelTh: 'Anime / Otaku', labelEn: 'Anime' },
  { key: 'Fun',       labelTh: 'สนุก',          labelEn: 'Fun' },
] as const;

/* ─── Mock document preview ───────────────────────────────────── */
function MockDocument({ swatches, tag }: {
  swatches: [string, string, string];
  tag: string;
}) {
  const [h, a, b] = [toHex(swatches[0]), toHex(swatches[1]), toHex(swatches[2])];
  const isCute = tag === 'Cute' || tag === 'Fun';
  const isMinimal = tag === 'Minimal';
  const isDark = tag === 'Dark';
  const isAnime = tag === 'Anime';

  // Dark templates: body bg = first swatch (dark color), text lines are dim
  const bodyBg = isDark ? h : (b === '#ffffff' || b === '#f8fafc' ? '#fafafa' : b);
  const lineColor = isDark ? 'rgba(255,255,255,0.15)' : (isAnime ? a : '#1e293b');
  const lineOpacity = isDark ? 1 : (isAnime ? 0.5 : 0.5);

  return (
    <div
      style={{
        width: 120,
        height: 170,
        background: bodyBg,
        borderRadius: isCute ? 10 : (isAnime ? 8 : 4),
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Header band */}
      {isMinimal ? (
        /* Minimal: just a thin accent bar + logo stub */
        <div style={{ height: 28, background: '#fff', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 5 }}>
          <div style={{ width: 22, height: 22, borderRadius: 3, background: a, opacity: 0.15 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 4, width: '60%', background: a, borderRadius: 2, marginBottom: 2, opacity: 0.6 }} />
            <div style={{ height: 2, width: '40%', background: a, borderRadius: 2, opacity: 0.3 }} />
          </div>
          <div style={{ width: 2, height: 24, background: a, borderRadius: 1, opacity: 0.9 }} />
        </div>
      ) : (
        <div style={{
          height: isCute ? 38 : 34,
          background: h,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 5,
        }}>
          {/* logo circle */}
          <div style={{
            width: 18, height: 18,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 3, width: '55%', background: 'rgba(255,255,255,0.9)', borderRadius: 2, marginBottom: 3 }} />
            <div style={{ height: 2, width: '35%', background: 'rgba(255,255,255,0.5)', borderRadius: 2 }} />
          </div>
          {/* invoice number block */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ height: 3, width: 28, background: 'rgba(255,255,255,0.8)', borderRadius: 2, marginBottom: 2, marginLeft: 'auto' }} />
            <div style={{ height: 2, width: 20, background: 'rgba(255,255,255,0.5)', borderRadius: 2, marginLeft: 'auto' }} />
          </div>
        </div>
      )}

      {/* Content area */}
      <div style={{ padding: '7px 8px', flex: 1 }}>
        {/* bill-to stub */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ height: 2, width: '45%', background: a, borderRadius: 2, opacity: 0.4, marginBottom: 2 }} />
          <div style={{ height: 2.5, width: '70%', background: lineColor, borderRadius: 2, opacity: lineOpacity, marginBottom: 1.5 }} />
          <div style={{ height: 2, width: '55%', background: isDark ? 'rgba(255,255,255,0.1)' : '#94a3b8', borderRadius: 2 }} />
        </div>

        {/* table header */}
        <div style={{
          height: isCute ? 12 : 10,
          background: isCute ? a : (isMinimal ? a : h),
          opacity: isCute ? 0.7 : (isMinimal ? 0.2 : 1),
          borderRadius: isCute ? 4 : 2,
          marginBottom: 3,
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px',
          gap: 4,
        }}>
          {[30, 15, 15, 20].map((w, i) => (
            <div key={i} style={{
              height: 2,
              width: `${w}%`,
              background: isMinimal ? a : 'rgba(255,255,255,0.8)',
              borderRadius: 1,
              opacity: 0.8,
            }} />
          ))}
        </div>

        {/* item rows */}
        {[1, 2, 3].map((_, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 4,
            padding: '3px 4px',
            background: i % 2 === 1 ? (isDark ? 'rgba(255,255,255,0.05)' : isCute ? `${a}18` : 'rgba(0,0,0,0.03)') : 'transparent',
            borderRadius: isCute ? 3 : 1,
            marginBottom: 1,
          }}>
            <div style={{ height: 2, width: '30%', background: '#475569', borderRadius: 2, opacity: 0.4 }} />
            <div style={{ flex: 1 }} />
            <div style={{ height: 2, width: '15%', background: '#475569', borderRadius: 2, opacity: 0.35 }} />
            <div style={{ height: 2, width: '15%', background: '#475569', borderRadius: 2, opacity: 0.35 }} />
            <div style={{ height: 2, width: '20%', background: '#475569', borderRadius: 2, opacity: 0.4 }} />
          </div>
        ))}

        {/* total row */}
        <div style={{
          marginTop: 5,
          background: isCute ? `${a}30` : (isMinimal ? `${a}18` : `${a}22`),
          borderRadius: isCute ? 6 : 3,
          padding: '4px 5px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ height: 2, width: '30%', background: a, borderRadius: 2, opacity: 0.5 }} />
          <div style={{ height: 3, width: '25%', background: a, borderRadius: 2, opacity: 0.9 }} />
        </div>
      </div>

      {/* Cute bottom decoration */}
      {isCute && (
        <div style={{
          position: 'absolute',
          bottom: 3,
          left: 0, right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 3,
          fontSize: 7,
          opacity: 0.5,
        }}>
          {'★ ♥ ★'.split(' ').map((s, i) => (
            <span key={i} style={{ color: a }}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Single template card ────────────────────────────────────── */
function TemplateCard({
  nameTh, nameEn, tagTh, tagEn, swatches,
  selected, isThai, onSelect,
}: {
  id?: string; nameTh: string; nameEn: string;
  tagTh: string; tagEn: string; swatches: [string, string, string];
  selected: boolean; isThai: boolean;
  onSelect: () => void;
}) {
  const tagColors: Record<string, { bg: string; text: string }> = {
    Minimal: { bg: '#f1f5f9', text: '#475569' },
    Pro:     { bg: '#eff6ff', text: '#1e40af' },
    Cute:    { bg: '#fdf2f8', text: '#be185d' },
    Kawaii:  { bg: '#f5f3ff', text: '#7c3aed' },
    Fun:     { bg: '#fff7ed', text: '#c2410c' },
    Standard: { bg: '#f0fdf4', text: '#166534' },
    Clean:   { bg: '#f0fdfa', text: '#0f766e' },
    Bold:    { bg: '#fafaf9', text: '#1c1917' },
    Spacious: { bg: '#f8fafc', text: '#334155' },
    Slate:   { bg: '#f1f5f9', text: '#475569' },
    Navy:    { bg: '#eff6ff', text: '#1e3a8a' },
    Gold:    { bg: '#fefce8', text: '#854d0e' },
    Warm:    { bg: '#fff7ed', text: '#9a3412' },
    Green:   { bg: '#f0fdf4', text: '#14532d' },
    Cyan:    { bg: '#ecfeff', text: '#155e75' },
    Dark:    { bg: '#1a1a1a', text: '#d4af37' },
    Anime:   { bg: '#fdf2f8', text: '#7c3aed' },
    default: { bg: '#f3f4f6', text: '#374151' },
  };
  const tagKey = tagEn in tagColors ? tagEn : 'default';
  const tagStyle = tagColors[tagKey];

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        background: '#ffffff',
        borderRadius: 16,
        border: selected
          ? '2px solid #1e3a8a'
          : '2px solid transparent',
        boxShadow: selected
          ? '0 0 0 3px rgba(30,58,138,0.12), 0 4px 20px rgba(30,58,138,0.1)'
          : '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        textAlign: 'left',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)';
        }
      }}
    >
      {/* Selected checkmark */}
      {selected && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#1e3a8a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
        }}>
          <Check size={11} color="#fff" strokeWidth={3} />
        </div>
      )}

      {/* Mock document */}
      <MockDocument swatches={swatches} tag={tagEn} />

      {/* Card footer */}
      <div style={{ width: '100%' }}>
        {/* Name */}
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#1e293b',
          lineHeight: 1.3,
          marginBottom: 5,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {isThai ? nameTh : nameEn}
        </div>

        {/* Tag + swatches row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 999,
            background: tagStyle.bg,
            color: tagStyle.text,
            letterSpacing: '0.02em',
          }}>
            {isThai ? tagTh : tagEn}
          </span>
          {/* Color swatches */}
          <div style={{ display: 'flex', gap: 3 }}>
            {swatches.map((cls, i) => (
              <div key={i} style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: toHex(cls),
                border: '1px solid rgba(0,0,0,0.08)',
                flexShrink: 0,
              }} />
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─── Main marketplace panel ──────────────────────────────────── */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplateId: string | null;
  onSelect: (id: string | null) => void;
  docType: InvoiceType;
  customTemplates: DocumentTemplateOption[];
  isThai: boolean;
}

export default function TemplateMarketplace({
  isOpen, onClose, selectedTemplateId, onSelect, docType, customTemplates, isThai,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 260);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  const matching = builtinDocumentTemplates.filter(t => supportsDocumentType(t, docType));

  const selectedName = selectedTemplateId
    ? matching.find(t => t.id === selectedTemplateId)?.nameTh
      ?? customTemplates.find(t => t.id === selectedTemplateId)?.name
      ?? (isThai ? 'มาตรฐาน' : 'Standard')
    : (isThai ? 'มาตรฐาน' : 'Standard');

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.35)',
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(780px, 88vw)',
          background: '#f8fafc',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '-4px 0 32px rgba(0,0,0,0.12)',
        }}
      >
        {/* ── Panel header ── */}
        <div style={{
          flexShrink: 0,
          padding: '20px 24px 16px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{
                fontSize: 17,
                fontWeight: 700,
                color: '#0f172a',
                margin: 0,
                lineHeight: 1.3,
              }}>
                {isThai ? 'เลือก Template เอกสาร' : 'Choose Document Template'}
              </h2>
              <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
                {isThai
                  ? `กำลังใช้: ${selectedName}`
                  : `Current: ${selectedName}`}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#f1f5f9',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                style={{
                  padding: '5px 13px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: activeCategory === cat.key ? 600 : 400,
                  border: activeCategory === cat.key ? '1.5px solid #1e3a8a' : '1.5px solid #e2e8f0',
                  background: activeCategory === cat.key ? '#1e3a8a' : '#fff',
                  color: activeCategory === cat.key ? '#fff' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  lineHeight: 1.4,
                }}
              >
                {isThai ? cat.labelTh : cat.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* ── Grid ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Default option */}
          {(activeCategory === 'all' || activeCategory === 'Standard') && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                {isThai ? 'ค่าเริ่มต้น' : 'Default'}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                gap: 12,
              }}>
                <TemplateCard
                  id=""
                  nameTh="มาตรฐาน"
                  nameEn="Standard"
                  tagTh="เริ่มต้น"
                  tagEn="Standard"
                  swatches={['bg-blue-900', 'bg-blue-200', 'bg-white']}
                  selected={!selectedTemplateId}
                  isThai={isThai}
                  onSelect={() => { onSelect(null); onClose(); }}
                />
              </div>
            </div>
          )}

          {/* Builtin templates grouped by category */}
          {(activeCategory === 'all'
            ? (['Standard', 'Minimal', 'Pro', 'Cute', 'Dark', 'Anime', 'Fun'] as const)
            : [activeCategory as string]
          ).map(cat => {
            const items = matching.filter(t => {
              if (cat === 'Standard') return !['Minimal','Pro','Cute','Kawaii','Fun','Clean','Bold','Spacious','Dark','Anime'].includes(t.tagEn);
              if (cat === 'Cute') return t.tagEn === 'Cute' || t.tagEn === 'Kawaii';
              return t.tagEn === cat;
            });
            if (items.length === 0) return null;
            const catLabel = CATEGORIES.find(c => c.key === cat);

            return (
              <div key={cat} style={{ marginBottom: 28 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#94a3b8',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}>
                  {isThai ? catLabel?.labelTh : catLabel?.labelEn}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                  gap: 12,
                }}>
                  {items.map(t => (
                    <TemplateCard
                      key={t.id}
                      id={t.id}
                      nameTh={t.nameTh}
                      nameEn={t.nameEn}
                      tagTh={t.tagTh}
                      tagEn={t.tagEn}
                      swatches={t.swatches}
                      selected={selectedTemplateId === t.id}
                      isThai={isThai}
                      onSelect={() => { onSelect(t.id); onClose(); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Custom templates */}
          {customTemplates.length > 0 && (activeCategory === 'all') && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                {isThai ? 'แม่แบบบริษัท' : 'Company Templates'}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                gap: 12,
              }}>
                {customTemplates.map(t => (
                  <TemplateCard
                    key={t.id}
                    id={t.id}
                    nameTh={t.name}
                    nameEn={t.name}
                    tagTh="บริษัท"
                    tagEn="Custom"
                    swatches={['bg-slate-700', 'bg-slate-300', 'bg-white']}
                    selected={selectedTemplateId === t.id}
                    isThai={isThai}
                    onSelect={() => { onSelect(t.id); onClose(); }}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={{ height: 24 }} />
        </div>
      </div>
    </>
  );
}
