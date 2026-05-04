import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import type { DocumentTemplateOption, InvoiceType } from '../../types';

type CatalogGroup = 'all' | 'corporate' | 'official' | 'dark' | 'playful';
type DecorKind =
  | 'crown' | 'samurai' | 'carbon' | 'moon' | 'shadow' | 'matrix' | 'graffiti' | 'cyber' | 'gold' | 'mono'
  | 'line' | 'mint' | 'beige' | 'darkAccent' | 'cloud' | 'bear' | 'leaf' | 'sun' | 'heart' | 'cube' | 'seal' | 'truck' | 'anime';

type TemplatePreset = {
  id: string;
  no: string;
  name: string;
  group: CatalogGroup;
  tags: string[];
  variables: {
    bg: string;
    paper: string;
    accent: string;
    accent2: string;
    text: string;
    muted: string;
    border: string;
    tableHead: string;
    totalBg: string;
  };
  decor: DecorKind;
};

const templatePresets: TemplatePreset[] = [
  { id: 'builtin:minimal-white', no: '01', name: 'Minimal White', group: 'corporate', tags: ['Minimal', 'White'], decor: 'line', variables: { bg: '#f7f8fa', paper: '#ffffff', accent: '#111827', accent2: '#e6e8ed', text: '#111827', muted: '#5d6878', border: '#d6dbe4', tableHead: '#eef1f5', totalBg: '#f4f6f9' } },
  { id: 'builtin:pro-blue-modern', no: '02', name: 'Corporate Blue', group: 'corporate', tags: ['Corporate', 'Blue'], decor: 'cube', variables: { bg: '#e8f1ff', paper: '#ffffff', accent: '#0f4ea3', accent2: '#082d63', text: '#0e2444', muted: '#566b86', border: '#b8cae8', tableHead: '#0b3778', totalBg: '#0f4ea3' } },
  { id: 'builtin:pro-green-eco', no: '03', name: 'Green e-Tax', group: 'corporate', tags: ['Green', 'e-Tax'], decor: 'leaf', variables: { bg: '#eef8ea', paper: '#ffffff', accent: '#2f8736', accent2: '#bfe4b4', text: '#183c1e', muted: '#667d63', border: '#bddab6', tableHead: '#2f8736', totalBg: '#e6f4df' } },
  { id: 'builtin:dark-gold', no: '04', name: 'Luxury Gold', group: 'dark', tags: ['Luxury', 'Gold'], decor: 'gold', variables: { bg: '#0e0b06', paper: '#11100d', accent: '#f0b737', accent2: '#8e681b', text: '#fff1c4', muted: '#bda66c', border: '#5a4216', tableHead: '#d89f28', totalBg: '#f0b737' } },
  { id: 'builtin:dark-carbon', no: '05', name: 'Dark Tech', group: 'dark', tags: ['Dark', 'Tech'], decor: 'cyber', variables: { bg: '#02070b', paper: '#071017', accent: '#00b7f0', accent2: '#0d2b3d', text: '#e8faff', muted: '#87a7b7', border: '#113748', tableHead: '#006ea2', totalBg: '#00a9e2' } },
  { id: 'builtin:minimal-light-gray', no: '06', name: 'Soft Gray', group: 'corporate', tags: ['Soft', 'Gray'], decor: 'mono', variables: { bg: '#eef0f4', paper: '#f9fafc', accent: '#5c6a7f', accent2: '#d9dee7', text: '#1d2735', muted: '#6e7a8d', border: '#d0d6e0', tableHead: '#69778c', totalBg: '#e6ebf2' } },
  { id: 'builtin:pro-navy', no: '07', name: 'Thai Official', group: 'official', tags: ['Official', 'Thai'], decor: 'seal', variables: { bg: '#f3f6fb', paper: '#ffffff', accent: '#143e75', accent2: '#d7e4f5', text: '#102745', muted: '#61758e', border: '#bdd0e8', tableHead: '#143e75', totalBg: '#eaf1fb' } },
  { id: 'builtin:pro-gradient', no: '08', name: 'Modern Gradient', group: 'corporate', tags: ['Modern', 'Gradient'], decor: 'cube', variables: { bg: '#eef2ff', paper: '#ffffff', accent: '#6c36e8', accent2: '#28a9ff', text: '#1d2452', muted: '#697093', border: '#d8dcff', tableHead: '#6337df', totalBg: '#6c36e8' } },
  { id: 'builtin:pro-classic-orange', no: '09', name: 'Logistics Orange', group: 'corporate', tags: ['Logistics', 'Orange'], decor: 'truck', variables: { bg: '#fff1e9', paper: '#ffffff', accent: '#f05a1a', accent2: '#ffd0b7', text: '#3b2015', muted: '#8a6555', border: '#f3c6b1', tableHead: '#f05a1a', totalBg: '#ffe5d8' } },
  { id: 'builtin:cute-pink', no: '10', name: 'Anime Friendly', group: 'playful', tags: ['Anime', 'Friendly'], decor: 'anime', variables: { bg: '#fff1f7', paper: '#fff9fc', accent: '#ec5f9c', accent2: '#ffd5e8', text: '#5a2440', muted: '#9d6b83', border: '#f5c6dc', tableHead: '#ec6da4', totalBg: '#ffe2ef' } },
];

const groups = [
  { key: 'all', labelTh: 'ทั้งหมด', labelEn: 'All' },
  { key: 'corporate', labelTh: 'Corporate', labelEn: 'Corporate' },
  { key: 'official', labelTh: 'Official', labelEn: 'Official' },
  { key: 'dark', labelTh: 'Dark', labelEn: 'Dark' },
  { key: 'playful', labelTh: 'Anime / Cute', labelEn: 'Anime / Cute' },
] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplateId: string | null;
  onSelect: (id: string | null) => void;
  docType: InvoiceType;
  customTemplates: DocumentTemplateOption[];
  isThai: boolean;
}

function InvoiceTemplate({ preset }: { preset: TemplatePreset }) {
  const style = {
    '--bg': preset.variables.bg,
    '--paper': preset.variables.paper,
    '--accent': preset.variables.accent,
    '--accent2': preset.variables.accent2,
    '--text': preset.variables.text,
    '--muted': preset.variables.muted,
    '--border': preset.variables.border,
    '--tableHead': preset.variables.tableHead,
    '--totalBg': preset.variables.totalBg,
  } as CSSProperties;

  const dark = preset.group === 'dark';

  return (
    <div className={`invoiceTemplate invoiceTemplate-${preset.group} decor-${preset.decor}`} style={style}>
      <div className="invoiceGlow" />
      <div className="invoiceHeader">
        <div className="brandBlock">
          <div className="logoMark">{preset.no}</div>
          <div>
            <strong>บริษัท ตัวอย่าง จำกัด</strong>
            <span>123 ถนนสุขุมวิท กรุงเทพฯ 10110</span>
            <span>เลขประจำตัวผู้เสียภาษี 0105560123456</span>
          </div>
        </div>
        <div className="invoiceTitle">
          <b>ใบกำกับภาษี</b>
          <span>TAX INVOICE</span>
          <small>ต้นฉบับ</small>
        </div>
      </div>

      <div className="invoiceMeta">
        <div>
          <span>ผู้ซื้อ</span>
          <strong>บริษัท ลูกค้า จำกัด</strong>
          <em>เลขประจำตัวผู้เสียภาษี 0105599000000</em>
        </div>
        <div>
          <span>เลขที่ / No.</span>
          <strong>INV-2026-001</strong>
          <span>วันที่ / Date</span>
          <strong>03/05/2569</strong>
        </div>
      </div>

      <div className="invoiceTable">
        <div className="tableHead">
          <span>รายการ</span><span>จำนวน</span><span>ราคา</span><span>รวม</span>
        </div>
        {[0, 1, 2, 3].map((row) => (
          <div className="tableRow" key={row}>
            <span>บริการออกแบบเอกสาร {row + 1}</span><span>{row + 1}</span><span>1,200</span><span>{(1200 * (row + 1)).toLocaleString('th-TH')}</span>
          </div>
        ))}
      </div>

      <div className="invoiceLower">
        <div className="verifyBox">
          <div className="qrBox" aria-hidden="true">
            {Array.from({ length: 25 }).map((_, index) => <i key={index} />)}
          </div>
          <div>
            <strong>e-Tax Verify</strong>
            <span>สแกนตรวจสอบเอกสาร</span>
          </div>
        </div>
        <div className="totalCard">
          <span>Subtotal</span><b>5,600.00</b>
          <span>VAT 7%</span><b>392.00</b>
          <strong>Total</strong><strong>5,992.00</strong>
        </div>
      </div>

      <div className="invoiceFooter">
        <div>
          <span>ช่องทางชำระเงิน / Payment</span>
          <b>PromptPay / Bank Transfer</b>
        </div>
        <div className="signatureLine">ผู้มีอำนาจลงนาม</div>
      </div>

      <svg className="decorSvg" viewBox="0 0 180 180" aria-hidden="true">
        {dark ? (
          <>
            <path d="M22 146 C54 84 94 52 156 28" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity=".34" />
            <path d="M28 68 L62 38 L92 58 L150 28" fill="none" stroke="currentColor" strokeWidth="3" opacity=".42" />
            <circle cx="132" cy="54" r="28" fill="currentColor" opacity=".14" />
          </>
        ) : preset.group === 'playful' ? (
          <>
            <path d="M52 110 C22 86 42 44 76 64 C94 24 148 48 130 94 C122 120 82 132 52 110 Z" fill="currentColor" opacity=".16" />
            <circle cx="54" cy="58" r="12" fill="currentColor" opacity=".2" />
            <path d="M96 54 L103 68 L119 70 L108 82 L111 98 L96 90 L81 98 L84 82 L73 70 L89 68 Z" fill="currentColor" opacity=".23" />
          </>
        ) : (
          <>
            <rect x="22" y="34" width="118" height="88" rx="10" fill="none" stroke="currentColor" strokeWidth="3" opacity=".17" />
            <path d="M34 58 H128 M34 82 H114 M34 106 H96" stroke="currentColor" strokeWidth="4" opacity=".2" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

function TemplateCard({
  preset,
  selected,
  onSelect,
}: {
  preset: TemplatePreset;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`marketCard ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="thumbStage">
        {selected && (
          <span className="selectedBadge">
            <Check size={14} strokeWidth={3} />
          </span>
        )}
        <InvoiceTemplate preset={preset} />
      </div>
      <div className="cardCaption">
        <div>
          <strong>{preset.no}. {preset.name}</strong>
          <span>{preset.tags.join(' / ')}</span>
        </div>
        <i aria-hidden="true" style={{ background: preset.variables.accent }} />
      </div>
    </button>
  );
}

export default function TemplateMarketplace({
  isOpen,
  onClose,
  selectedTemplateId,
  onSelect,
  docType,
  customTemplates,
  isThai,
}: Props) {
  void docType;
  void customTemplates;
  const [mounted, setMounted] = useState(false);
  const [activeGroup, setActiveGroup] = useState<(typeof groups)[number]['key']>('all');
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      return;
    }
    const timeout = window.setTimeout(() => setMounted(false), 240);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const visiblePresets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return templatePresets.filter((preset) => {
      if (activeGroup !== 'all' && preset.group !== activeGroup) return false;
      if (!normalizedQuery) return true;
      return `${preset.no} ${preset.name} ${preset.tags.join(' ')}`.toLowerCase().includes(normalizedQuery);
    });
  }, [activeGroup, query]);

  const selectedName = templatePresets.find((preset) => preset.id === selectedTemplateId)?.name
    ?? customTemplates.find((template) => template.id === selectedTemplateId)?.name
    ?? (isThai ? 'มาตรฐาน' : 'Standard');

  if (!mounted) return null;

  return (
    <>
      <div className="catalogBackdrop" onClick={onClose} style={{ opacity: isOpen ? 1 : 0 }} />
      <div ref={panelRef} className="catalogPanel" style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}>
        <style>{catalogCss}</style>
        <header className="catalogHero">
          <div className="heroCopy">
            <div className="heroKicker"><Sparkles size={15} /> Thai e-Tax Template Gallery</div>
            <h2>{isThai ? 'เลือกดีไซน์ใบกำกับภาษี' : 'Choose a Tax Invoice Design'}</h2>
            <p>
              {isThai
                ? `กำลังใช้: ${selectedName} · แสดงแบบ A4 portrait พร้อมช่อง RD/e-Tax ครบ`
                : `Current: ${selectedName} · A4 portrait previews with RD/e-Tax fields intact`}
            </p>
          </div>
          <button className="closeButton" onClick={onClose} aria-label="Close template gallery">
            <X size={19} />
          </button>
        </header>

        <section className="catalogToolbar">
          <div className="searchBox">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isThai ? 'ค้นหาชื่อ template หรือสไตล์' : 'Search templates or styles'}
            />
          </div>
          <div className="groupTabs">
            {groups.map((group) => (
              <button
                key={group.key}
                className={activeGroup === group.key ? 'active' : ''}
                onClick={() => setActiveGroup(group.key)}
              >
                {isThai ? group.labelTh : group.labelEn}
              </button>
            ))}
          </div>
        </section>

        <main className="catalogScroll">
          <div className="catalogGrid">
            {visiblePresets.map((preset) => (
              <TemplateCard
                key={preset.id}
                preset={preset}
                selected={selectedTemplateId === preset.id}
                onSelect={() => {
                  onSelect(preset.id);
                  onClose();
                }}
              />
            ))}
          </div>

          {visiblePresets.length === 0 && (
            <div className="emptyState">
              {isThai ? 'ไม่พบ template ที่ตรงกับการค้นหา' : 'No matching templates found.'}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

const catalogCss = `
.catalogBackdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background:
    radial-gradient(circle at 18% 12%, rgba(245, 190, 90, .18), transparent 34%),
    rgba(10, 15, 24, .56);
  transition: opacity .24s ease;
}
.catalogPanel {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 50;
  width: min(1580px, 96vw);
  display: flex;
  flex-direction: column;
  background: #f4f1ea;
  color: #151515;
  box-shadow: -30px 0 80px rgba(0, 0, 0, .24);
  transition: transform .28s cubic-bezier(.22, 1, .36, 1);
  font-family: "Sarabun", "Noto Sans Thai", sans-serif;
}
.catalogHero {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 28px clamp(22px, 4vw, 44px) 24px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(17, 17, 17, .98), rgba(45, 34, 19, .96)),
    repeating-linear-gradient(45deg, transparent 0 18px, rgba(255, 255, 255, .04) 18px 19px);
  color: #fff8e8;
}
.catalogHero::before {
  content: "";
  position: absolute;
  width: 360px;
  height: 360px;
  right: 82px;
  top: -210px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(232, 185, 93, .34), transparent 62%);
}
.catalogHero::after {
  content: "10";
  position: absolute;
  right: 82px;
  bottom: -46px;
  font-size: 128px;
  line-height: 1;
  font-weight: 800;
  color: rgba(255, 255, 255, .06);
}
.heroCopy { position: relative; z-index: 1; }
.heroKicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: #e9c773;
  font-size: .78rem;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.catalogHero h2 {
  margin: 0;
  font-size: clamp(1.55rem, 2.8vw, 2.35rem);
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: 0;
}
.catalogHero p {
  margin: 8px 0 0;
  max-width: 66ch;
  color: rgba(255, 248, 232, .72);
  font-size: .9rem;
  line-height: 1.65;
}
.closeButton {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 10px;
  background: rgba(255, 255, 255, .08);
  color: #fff8e8;
  cursor: pointer;
}
.catalogToolbar {
  display: grid;
  grid-template-columns: minmax(240px, 330px) 1fr;
  gap: 16px;
  align-items: center;
  padding: 18px clamp(22px, 4vw, 44px);
  border-bottom: 1px solid #ded8ca;
  background: #faf7ef;
}
.searchBox {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid #d9d2c5;
  border-radius: 12px;
  background: #fffdfa;
  color: #776d5e;
}
.searchBox input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #191714;
  font: inherit;
  font-size: .9rem;
}
.groupTabs {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.groupTabs button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #ded7ca;
  border-radius: 999px;
  background: #fffdfa;
  color: #51483c;
  font-size: .83rem;
  font-weight: 700;
  cursor: pointer;
}
.groupTabs button.active {
  border-color: #151515;
  background: #151515;
  color: #fff8e8;
}
.catalogScroll {
  flex: 1;
  overflow: auto;
  padding: clamp(22px, 3.1vw, 38px);
}
.catalogGrid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: clamp(18px, 2vw, 26px);
  align-items: start;
}
.marketCard {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 11px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.thumbStage {
  position: relative;
  width: 100%;
  padding: 9px;
  border-radius: 18px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, .86), rgba(226, 218, 204, .72));
  box-shadow:
    0 22px 42px rgba(46, 38, 25, .17),
    0 2px 0 rgba(255, 255, 255, .9) inset;
  transition: transform .18s ease, box-shadow .18s ease;
}
.marketCard:hover .thumbStage {
  transform: translateY(-5px);
  box-shadow:
    0 32px 58px rgba(38, 30, 18, .24),
    0 2px 0 rgba(255, 255, 255, .9) inset;
}
.marketCard.selected .thumbStage {
  outline: 3px solid #151515;
  outline-offset: 3px;
}
.selectedBadge {
  position: absolute;
  top: 17px;
  right: 17px;
  z-index: 5;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #151515;
  color: #fff8e8;
  box-shadow: 0 10px 22px rgba(0, 0, 0, .28);
}
.cardCaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 3px;
}
.cardCaption strong {
  display: block;
  color: #151515;
  font-size: .9rem;
  line-height: 1.28;
  font-weight: 800;
}
.cardCaption span {
  display: block;
  margin-top: 2px;
  color: #7b7164;
  font-size: .72rem;
  font-weight: 700;
}
.cardCaption i {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid #fffdfa;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .12);
  flex: 0 0 auto;
}
.invoiceTemplate {
  --bg: #f5f5f5;
  --paper: #fff;
  --accent: #111;
  --accent2: #ddd;
  --text: #111;
  --muted: #667085;
  --border: #ddd;
  --tableHead: #eee;
  --totalBg: #f4f4f4;
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 210 / 297;
  overflow: hidden;
  border-radius: 11px;
  padding: 8.5%;
  background:
    radial-gradient(circle at 78% 8%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 26%),
    linear-gradient(155deg, var(--paper), var(--bg));
  color: var(--text);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .65) inset;
  isolation: isolate;
  container-type: inline-size;
}
.invoiceTemplate::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -2;
  background:
    linear-gradient(115deg, transparent 0 42%, color-mix(in srgb, var(--accent) 16%, transparent) 42% 43%, transparent 43%),
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--border) 48%, transparent) 0 1px, transparent 1px 17px),
    repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 34%, transparent) 0 1px, transparent 1px 17px);
  opacity: .34;
}
.invoiceTemplate::after {
  content: "";
  position: absolute;
  right: -18%;
  top: 13%;
  width: 56%;
  aspect-ratio: 1;
  border-radius: 32%;
  background:
    radial-gradient(circle at 42% 34%, color-mix(in srgb, var(--accent) 42%, transparent), transparent 28%),
    linear-gradient(135deg, color-mix(in srgb, var(--accent2) 48%, transparent), transparent);
  transform: rotate(18deg);
  opacity: .46;
  z-index: -1;
}
.invoiceGlow {
  position: absolute;
  inset: auto -10% -8% 18%;
  height: 23%;
  background: radial-gradient(ellipse, color-mix(in srgb, var(--accent) 28%, transparent), transparent 68%);
  z-index: -1;
}
.decorSvg {
  position: absolute;
  right: -5%;
  top: 17%;
  width: 42%;
  color: var(--accent);
  opacity: .95;
  pointer-events: none;
}
.decor-matrix::before {
  background:
    repeating-linear-gradient(90deg, rgba(57,255,117,.13) 0 1px, transparent 1px 12px),
    repeating-linear-gradient(0deg, rgba(57,255,117,.1) 0 1px, transparent 1px 12px);
  opacity: .55;
}
.decor-carbon::before {
  background:
    repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 5px, transparent 5px 10px),
    repeating-linear-gradient(-45deg, rgba(0,0,0,.3) 0 5px, transparent 5px 10px);
  opacity: .5;
}
.decor-graffiti::before {
  background:
    radial-gradient(circle at 8% 10%, var(--accent2) 0 4px, transparent 5px),
    radial-gradient(circle at 92% 18%, var(--accent2) 0 6px, transparent 7px),
    repeating-linear-gradient(-9deg, transparent 0 18px, rgba(0,0,0,.08) 18px 21px);
  opacity: .76;
}
.decor-cyber::before {
  background:
    linear-gradient(90deg, rgba(0,245,255,.12), transparent 35%, rgba(255,79,216,.12)),
    repeating-linear-gradient(90deg, rgba(0,245,255,.12) 0 1px, transparent 1px 18px),
    repeating-linear-gradient(0deg, rgba(255,79,216,.1) 0 1px, transparent 1px 18px);
  opacity: .65;
}
.decor-cube::after {
  border-radius: 18%;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 58%, transparent), transparent),
    linear-gradient(45deg, transparent 0 42%, color-mix(in srgb, var(--accent2) 72%, transparent) 42% 64%, transparent 64%);
}
.decor-seal::before {
  background:
    radial-gradient(circle at 11% 11%, transparent 0 22px, color-mix(in srgb, var(--accent) 26%, transparent) 23px 25px, transparent 26px),
    radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--accent2) 78%, transparent) 0 42px, transparent 43px),
    repeating-linear-gradient(45deg, transparent 0 13px, color-mix(in srgb, var(--accent) 8%, transparent) 13px 14px);
  opacity: .76;
}
.decor-truck::after {
  border-radius: 8px;
  background:
    linear-gradient(0deg, color-mix(in srgb, var(--accent) 55%, transparent), color-mix(in srgb, var(--accent2) 74%, transparent)),
    repeating-linear-gradient(90deg, transparent 0 18px, rgba(255,255,255,.26) 18px 22px);
  clip-path: polygon(0 30%, 58% 30%, 58% 50%, 82% 50%, 100% 68%, 100% 82%, 0 82%);
}
.decor-anime::before {
  background:
    radial-gradient(circle at 13% 12%, color-mix(in srgb, var(--accent2) 90%, transparent) 0 16px, transparent 17px),
    radial-gradient(circle at 88% 15%, color-mix(in srgb, var(--accent) 24%, transparent) 0 12px, transparent 13px),
    radial-gradient(circle at 16% 90%, color-mix(in srgb, var(--accent) 18%, transparent) 0 18px, transparent 19px),
    repeating-linear-gradient(135deg, transparent 0 20px, color-mix(in srgb, var(--accent) 8%, transparent) 20px 22px);
  opacity: .88;
}
.decor-anime::after {
  border-radius: 999px 999px 42% 42%;
  background:
    radial-gradient(circle at 48% 38%, #ffd8c8 0 24%, transparent 25%),
    radial-gradient(circle at 33% 36%, var(--accent) 0 20%, transparent 21%),
    radial-gradient(circle at 64% 34%, color-mix(in srgb, var(--accent) 78%, #8b5cf6) 0 22%, transparent 23%),
    linear-gradient(180deg, color-mix(in srgb, var(--accent2) 85%, white), transparent);
}
.decor-moon::after {
  border-radius: 999px;
  background: radial-gradient(circle at 37% 34%, #edf4ff 0 22%, rgba(143,180,255,.35) 23% 55%, transparent 56%);
}
.decor-heart::before,
.decor-cloud::before,
.decor-bear::before,
.decor-leaf::before,
.decor-sun::before {
  background:
    radial-gradient(circle at 12% 12%, color-mix(in srgb, var(--accent2) 72%, transparent) 0 18px, transparent 19px),
    radial-gradient(circle at 84% 14%, color-mix(in srgb, var(--accent) 22%, transparent) 0 12px, transparent 13px),
    radial-gradient(circle at 18% 92%, color-mix(in srgb, var(--accent) 18%, transparent) 0 18px, transparent 19px);
  opacity: .88;
}
.invoiceHeader {
  position: relative;
  z-index: 1;
  min-height: 20%;
  display: grid;
  grid-template-columns: 1.25fr .85fr;
  gap: 8%;
  align-items: start;
  padding-bottom: 7%;
}
.brandBlock {
  display: flex;
  gap: 6%;
  min-width: 0;
}
.logoMark {
  display: grid;
  place-items: center;
  width: 22%;
  aspect-ratio: 1;
  border-radius: 14%;
  background: var(--accent);
  color: var(--paper);
  font-size: clamp(.38rem, 8cqw, .7rem);
  font-weight: 900;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 25%, transparent);
}
.brandBlock strong,
.brandBlock span,
.invoiceTitle b,
.invoiceTitle span,
.invoiceTitle small,
.invoiceMeta strong,
.invoiceMeta span,
.invoiceMeta em,
.verifyBox strong,
.verifyBox span,
.invoiceFooter span,
.invoiceFooter b {
  display: block;
}
.brandBlock strong {
  font-size: clamp(.46rem, 8cqw, .78rem);
  line-height: 1.22;
  font-weight: 900;
}
.brandBlock span {
  margin-top: 2%;
  color: var(--muted);
  font-size: clamp(.32rem, 5.8cqw, .5rem);
  line-height: 1.42;
}
.invoiceTitle {
  text-align: right;
}
.invoiceTitle b {
  font-size: clamp(.62rem, 9.5cqw, .98rem);
  line-height: 1.04;
  font-weight: 900;
}
.invoiceTitle span {
  margin-top: 3%;
  color: var(--accent);
  font-size: clamp(.34rem, 5.8cqw, .5rem);
  font-weight: 900;
  letter-spacing: .09em;
}
.invoiceTitle small {
  width: max-content;
  margin: 7% 0 0 auto;
  padding: 2% 7%;
  border: 1px solid color-mix(in srgb, var(--accent) 54%, transparent);
  border-radius: 999px;
  color: var(--accent);
  font-size: clamp(.3rem, 4.8cqw, .42rem);
  font-weight: 800;
}
.invoiceMeta {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr .72fr;
  gap: 5%;
  margin-bottom: 6%;
}
.invoiceMeta > div {
  min-height: 64px;
  padding: 5%;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--paper) 84%, transparent);
}
.invoiceMeta span,
.invoiceMeta em {
  color: var(--muted);
  font-size: clamp(.3rem, 5cqw, .43rem);
  line-height: 1.36;
  font-style: normal;
}
.invoiceMeta strong {
  margin: 2% 0 3%;
  font-size: clamp(.4rem, 6.5cqw, .58rem);
  line-height: 1.25;
}
.invoiceTable {
  position: relative;
  z-index: 1;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
}
.tableHead,
.tableRow {
  display: grid;
  grid-template-columns: 1fr .34fr .42fr .45fr;
  gap: 2%;
  align-items: center;
}
.tableHead {
  min-height: 24px;
  padding: 3.4% 4%;
  background: var(--tableHead);
  color: var(--paper);
  font-size: clamp(.3rem, 5cqw, .43rem);
  font-weight: 900;
}
.decor-graffiti .tableHead,
.decor-gold .tableHead,
.invoiceTemplate-minimal .tableHead,
.invoiceTemplate-playful .tableHead {
  color: var(--text);
}
.decor-darkAccent .tableHead {
  color: #fff;
}
.tableRow {
  min-height: 23px;
  padding: 3.2% 4%;
  border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
  color: var(--text);
  font-size: clamp(.3rem, 4.8cqw, .42rem);
}
.tableRow span:not(:first-child),
.tableHead span:not(:first-child) {
  text-align: right;
}
.invoiceLower {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: .9fr 1fr;
  gap: 6%;
  align-items: start;
  margin-top: 6%;
}
.verifyBox {
  display: flex;
  gap: 7%;
  align-items: center;
}
.qrBox {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1px;
  width: 36%;
  aspect-ratio: 1;
  padding: 3px;
  border: 1px solid var(--border);
  background: var(--paper);
}
.qrBox i {
  background: var(--text);
  opacity: .18;
}
.qrBox i:nth-child(3n),
.qrBox i:nth-child(7n),
.qrBox i:nth-child(11n) {
  opacity: .9;
}
.verifyBox strong,
.totalCard strong,
.totalCard b {
  font-size: clamp(.34rem, 5.6cqw, .48rem);
}
.verifyBox span {
  color: var(--muted);
  font-size: clamp(.28rem, 4.8cqw, .4rem);
}
.totalCard {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 9px;
  padding: 7%;
  border-radius: 8px;
  background: var(--totalBg);
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}
.totalCard span,
.totalCard strong {
  font-size: clamp(.31rem, 5.1cqw, .43rem);
}
.totalCard b,
.totalCard strong:nth-last-child(1) {
  text-align: right;
}
.invoiceFooter {
  position: absolute;
  left: 8.5%;
  right: 8.5%;
  bottom: 7%;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr .82fr;
  gap: 8%;
  align-items: end;
  color: var(--muted);
}
.invoiceFooter span {
  font-size: clamp(.28rem, 4.7cqw, .39rem);
}
.invoiceFooter b {
  margin-top: 2%;
  color: var(--text);
  font-size: clamp(.32rem, 5.2cqw, .44rem);
}
.signatureLine {
  padding-top: 10%;
  border-top: 1px solid color-mix(in srgb, var(--text) 42%, transparent);
  text-align: center;
  font-size: clamp(.28rem, 4.7cqw, .39rem);
}
.invoiceTemplate-dark {
  padding: 7.4%;
  border-radius: 8px;
  background:
    radial-gradient(circle at 78% 15%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 25%),
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 13%, var(--paper)) 0 25%, var(--paper) 25% 100%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent) inset;
}
.invoiceTemplate-dark::before {
  opacity: .5;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent) 0 1px, transparent 1px 48%),
    repeating-linear-gradient(135deg, transparent 0 12px, color-mix(in srgb, var(--accent) 12%, transparent) 12px 13px),
    repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 44%, transparent) 0 1px, transparent 1px 18px);
}
.invoiceTemplate-dark::after {
  right: -20%;
  top: 7%;
  width: 62%;
  opacity: .55;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--accent) 35%, transparent));
}
.invoiceTemplate-dark .decorSvg {
  top: 10%;
  right: -6%;
  width: 45%;
  opacity: .92;
}
.invoiceTemplate-dark .invoiceHeader {
  min-height: 27%;
  margin: -7.4% -7.4% 7%;
  padding: 8.2% 7.4% 7%;
  align-items: start;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent 58%),
    linear-gradient(180deg, rgba(0, 0, 0, .2), transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 48%, transparent);
}
.invoiceTemplate-dark .logoMark {
  border-radius: 18%;
  background: var(--accent);
  color: #0b0b0b;
  font-size: clamp(.5rem, 9.5cqw, .82rem);
  box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 38%, transparent);
}
.invoiceTemplate-dark .brandBlock strong {
  font-size: clamp(.5rem, 8.8cqw, .86rem);
  color: var(--text);
}
.invoiceTemplate-dark .brandBlock span {
  color: color-mix(in srgb, var(--muted) 84%, var(--text));
  font-size: clamp(.34rem, 5.9cqw, .51rem);
}
.invoiceTemplate-dark .invoiceTitle b {
  color: var(--text);
  font-size: clamp(.78rem, 12cqw, 1.16rem);
  text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 28%, transparent);
}
.invoiceTemplate-dark .invoiceTitle span {
  display: inline-block;
  margin-top: 5%;
  padding: 2.8% 7%;
  border-radius: 999px;
  background: var(--accent);
  color: #090909;
  letter-spacing: .08em;
}
.invoiceTemplate-dark .invoiceTitle small {
  border-color: color-mix(in srgb, var(--accent) 72%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--paper) 70%, transparent);
}
.invoiceTemplate-dark .invoiceMeta {
  grid-template-columns: 1fr;
  gap: 3.5%;
  margin-bottom: 5.2%;
}
.invoiceTemplate-dark .invoiceMeta > div {
  min-height: auto;
  padding: 4.3% 5%;
  border-color: color-mix(in srgb, var(--accent) 26%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent 52%),
    color-mix(in srgb, var(--paper) 82%, transparent);
}
.invoiceTemplate-dark .invoiceMeta > div:nth-child(2) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2% 8%;
}
.invoiceTemplate-dark .invoiceMeta strong {
  margin: 1% 0 2%;
  color: var(--text);
}
.invoiceTemplate-dark .invoiceMeta > div,
.invoiceTemplate-dark .invoiceTable {
  background: color-mix(in srgb, var(--paper) 82%, transparent);
}
.invoiceTemplate-dark .invoiceTable {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  box-shadow: 0 10px 24px rgba(0, 0, 0, .16);
}
.invoiceTemplate-dark .tableHead {
  min-height: 28px;
  padding: 4.2% 4.6%;
  background: var(--accent);
  color: #080808;
  font-weight: 900;
}
.invoiceTemplate-dark .tableRow {
  padding: 3.8% 4.6%;
  color: color-mix(in srgb, var(--text) 92%, white);
  background: color-mix(in srgb, var(--paper) 88%, transparent);
}
.invoiceTemplate-dark .tableRow:nth-child(odd) {
  background: color-mix(in srgb, var(--accent) 6%, var(--paper));
}
.invoiceTemplate-dark .invoiceLower {
  grid-template-columns: 1fr;
  gap: 4.5%;
  margin-top: 5.5%;
}
.invoiceTemplate-dark .verifyBox {
  padding: 4%;
  border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--paper) 78%, transparent);
}
.invoiceTemplate-dark .qrBox {
  width: 26%;
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
}
.invoiceTemplate-dark .totalCard {
  padding: 5.3%;
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent),
    var(--totalBg);
}
.invoiceTemplate-dark .totalCard strong,
.invoiceTemplate-dark .totalCard b,
.invoiceTemplate-dark .verifyBox strong {
  color: var(--text);
}
.invoiceTemplate-dark .invoiceFooter {
  left: 7.4%;
  right: 7.4%;
  bottom: 5.8%;
  padding-top: 4.6%;
  border-top: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
}
.invoiceTemplate-dark .signatureLine {
  border-color: color-mix(in srgb, var(--accent) 72%, transparent);
  color: var(--muted);
}
.decor-graffiti.invoiceTemplate-dark,
.decor-mono.invoiceTemplate-dark {
  background:
    radial-gradient(circle at 82% 10%, color-mix(in srgb, var(--accent2) 32%, transparent), transparent 24%),
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, var(--paper)) 0 25%, var(--paper) 25% 100%);
}
.decor-graffiti.invoiceTemplate-dark .invoiceTitle span,
.decor-mono.invoiceTemplate-dark .invoiceTitle span {
  color: #fff;
}
.decor-graffiti.invoiceTemplate-dark .tableHead,
.decor-mono.invoiceTemplate-dark .tableHead {
  color: #fff;
}
.invoiceTemplate-playful {
  border-radius: 14px;
}
.invoiceTemplate-playful::after {
  border-radius: 48% 52% 44% 56%;
}
.invoiceTemplate-minimal::after {
  opacity: .22;
}
.emptyState {
  padding: 42px;
  border: 1px dashed #cfc6b6;
  border-radius: 18px;
  color: #776d5e;
  text-align: center;
  background: #fffdfa;
}
@media (max-width: 760px) {
  .catalogPanel { width: 100vw; }
  .catalogToolbar { grid-template-columns: 1fr; }
  .groupTabs { justify-content: flex-start; }
  .catalogGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 761px) and (max-width: 1180px) {
  .catalogGrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
`;
