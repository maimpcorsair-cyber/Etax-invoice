import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import type { DocumentTemplateOption, InvoiceType } from '../../types';

type CatalogGroup = 'all' | 'minimal' | 'cute';
type DecorKind =
  | 'minimal' | 'gray' | 'line' | 'sans' | 'space' | 'mint' | 'beige' | 'darkAccent'
  | 'bunny' | 'cloudBear' | 'sunflower' | 'leafMascot' | 'cat' | 'cactus' | 'rainbow';

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
  { id: 'builtin:minimal-white', no: '01', name: 'Minimal White', group: 'minimal', tags: ['Minimal', 'White'], decor: 'minimal', variables: { bg: '#f7f8fa', paper: '#ffffff', accent: '#111827', accent2: '#e6e8ed', text: '#111827', muted: '#5d6878', border: '#d6dbe4', tableHead: '#eef1f5', totalBg: '#f4f6f9' } },
  { id: 'builtin:minimal-gray', no: '02', name: 'Minimal Gray', group: 'minimal', tags: ['Minimal', 'Gray'], decor: 'gray', variables: { bg: '#eef0f4', paper: '#fafafa', accent: '#5f6875', accent2: '#d7dbe1', text: '#172033', muted: '#687385', border: '#cfd5dd', tableHead: '#eceff3', totalBg: '#e7ebf0' } },
  { id: 'builtin:minimal-line', no: '03', name: 'Minimal Line', group: 'minimal', tags: ['Line', 'Classic'], decor: 'line', variables: { bg: '#ffffff', paper: '#ffffff', accent: '#111827', accent2: '#f1f3f5', text: '#111827', muted: '#667085', border: '#bfc6d1', tableHead: '#111827', totalBg: '#111827' } },
  { id: 'builtin:minimal-sans', no: '04', name: 'Minimal Sans', group: 'minimal', tags: ['Bold', 'Sans'], decor: 'sans', variables: { bg: '#f8fafc', paper: '#ffffff', accent: '#1f2937', accent2: '#eef1f5', text: '#111827', muted: '#667085', border: '#d7dde6', tableHead: '#1f2937', totalBg: '#f3f4f6' } },
  { id: 'builtin:minimal-space', no: '05', name: 'Minimal Space', group: 'minimal', tags: ['Airy', 'Clean'], decor: 'space', variables: { bg: '#fafafa', paper: '#ffffff', accent: '#475569', accent2: '#f1f5f9', text: '#1e293b', muted: '#728095', border: '#e2e8f0', tableHead: '#f8fafc', totalBg: '#f1f5f9' } },
  { id: 'builtin:cute-pink', no: '06', name: 'Cute Pink', group: 'cute', tags: ['Bunny', 'Pastel'], decor: 'bunny', variables: { bg: '#fff1f6', paper: '#fff9fc', accent: '#ec6b9d', accent2: '#ffd8e8', text: '#5a2440', muted: '#9d6b83', border: '#f5c6dc', tableHead: '#ee7eaa', totalBg: '#ffe2ef' } },
  { id: 'builtin:cute-blue', no: '07', name: 'Cute Blue', group: 'cute', tags: ['Cloud', 'Bear'], decor: 'cloudBear', variables: { bg: '#eff8ff', paper: '#fbfdff', accent: '#64aee9', accent2: '#d8efff', text: '#213f62', muted: '#6a829d', border: '#c8e2f7', tableHead: '#6fb8eb', totalBg: '#e3f3ff' } },
  { id: 'builtin:cute-yellow', no: '08', name: 'Cute Yellow', group: 'cute', tags: ['Sun', 'Flower'], decor: 'sunflower', variables: { bg: '#fff9db', paper: '#fffdf4', accent: '#f6b51d', accent2: '#fff0a8', text: '#5b3b0b', muted: '#8a754b', border: '#f3dda1', tableHead: '#f3bd2f', totalBg: '#fff1a8' } },
  { id: 'builtin:cute-green', no: '09', name: 'Cute Green', group: 'cute', tags: ['Leaf', 'Fresh'], decor: 'leafMascot', variables: { bg: '#f0fbeb', paper: '#fbfff8', accent: '#6bbd5d', accent2: '#dff3d3', text: '#24451f', muted: '#71836d', border: '#cde7c6', tableHead: '#72bf65', totalBg: '#e5f6d9' } },
  { id: 'builtin:cute-kawaii', no: '10', name: 'Cute Kawaii', group: 'cute', tags: ['Cat', 'Purple'], decor: 'cat', variables: { bg: '#f8f2ff', paper: '#fffaff', accent: '#9a72de', accent2: '#eadcff', text: '#45226c', muted: '#7b6b92', border: '#ddcdf4', tableHead: '#9a72de', totalBg: '#eee2ff' } },
  { id: 'builtin:minimal-light-gray', no: '11', name: 'Minimal Light Gray', group: 'minimal', tags: ['Light', 'Gray'], decor: 'gray', variables: { bg: '#f1f3f6', paper: '#ffffff', accent: '#6b7280', accent2: '#eef1f5', text: '#111827', muted: '#6b7280', border: '#d9dee7', tableHead: '#f1f3f6', totalBg: '#f4f6f9' } },
  { id: 'builtin:minimal-fine-line', no: '12', name: 'Minimal Fine Line', group: 'minimal', tags: ['Thin', 'Line'], decor: 'line', variables: { bg: '#ffffff', paper: '#ffffff', accent: '#1f2937', accent2: '#f8fafc', text: '#111827', muted: '#667085', border: '#c6ccd5', tableHead: '#ffffff', totalBg: '#f5f6f8' } },
  { id: 'builtin:minimal-mint', no: '13', name: 'Minimal Mint', group: 'minimal', tags: ['Mint', 'Soft'], decor: 'mint', variables: { bg: '#effdf8', paper: '#ffffff', accent: '#66c7ad', accent2: '#d9f4eb', text: '#164b42', muted: '#6c817b', border: '#c9eadf', tableHead: '#e8f7f1', totalBg: '#dff4ec' } },
  { id: 'builtin:minimal-beige', no: '14', name: 'Minimal Beige', group: 'minimal', tags: ['Beige', 'Warm'], decor: 'beige', variables: { bg: '#fff8ea', paper: '#fffdf8', accent: '#c09a4a', accent2: '#f3e5c3', text: '#3f2b16', muted: '#826e52', border: '#ead8b6', tableHead: '#f7ecd1', totalBg: '#f1e0b7' } },
  { id: 'builtin:minimal-dark-accent', no: '15', name: 'Minimal Dark Accent', group: 'minimal', tags: ['Dark', 'Accent'], decor: 'darkAccent', variables: { bg: '#f7f8fa', paper: '#ffffff', accent: '#111827', accent2: '#e8eaef', text: '#111827', muted: '#6b7280', border: '#d5dae3', tableHead: '#111827', totalBg: '#111827' } },
  { id: 'builtin:cute-pastel-pink', no: '16', name: 'Cute Pastel Pink', group: 'cute', tags: ['Heart', 'Pink'], decor: 'bunny', variables: { bg: '#fff4f8', paper: '#fffafd', accent: '#ee8ab1', accent2: '#ffe1ec', text: '#642945', muted: '#9a7085', border: '#f4c9db', tableHead: '#ef91b9', totalBg: '#ffe4ef' } },
  { id: 'builtin:cute-baby-blue', no: '17', name: 'Cute Baby Blue', group: 'cute', tags: ['Baby Blue', 'Bear'], decor: 'cloudBear', variables: { bg: '#f0f9ff', paper: '#fbfdff', accent: '#86c9ef', accent2: '#ddf4ff', text: '#264863', muted: '#718aa0', border: '#cfe8f6', tableHead: '#8bcaf0', totalBg: '#e5f6ff' } },
  { id: 'builtin:cute-soft-green', no: '18', name: 'Cute Soft Green', group: 'cute', tags: ['Cactus', 'Soft'], decor: 'cactus', variables: { bg: '#f2fae9', paper: '#fdfff9', accent: '#9ac660', accent2: '#e8f3d2', text: '#41521f', muted: '#77845c', border: '#dcecc4', tableHead: '#98c660', totalBg: '#ebf5d7' } },
  { id: 'builtin:cute-yellow-sunshine', no: '19', name: 'Cute Yellow Sunshine', group: 'cute', tags: ['Sunshine', 'Rainbow'], decor: 'rainbow', variables: { bg: '#fff8dc', paper: '#fffdf5', accent: '#f5bd22', accent2: '#ffeaa0', text: '#664810', muted: '#8b784f', border: '#f0daa1', tableHead: '#f2bd29', totalBg: '#fff0a0' } },
  { id: 'builtin:cute-lovely-purple', no: '20', name: 'Cute Lovely Purple', group: 'cute', tags: ['Lovely', 'Cat'], decor: 'cat', variables: { bg: '#faf2ff', paper: '#fffaff', accent: '#b48be9', accent2: '#f0e1ff', text: '#543078', muted: '#877298', border: '#e4d0f5', tableHead: '#b48be9', totalBg: '#f1e4ff' } },
];

const groups = [
  { key: 'all', labelTh: 'ทั้งหมด', labelEn: 'All' },
  { key: 'minimal', labelTh: 'Minimal', labelEn: 'Minimal' },
  { key: 'cute', labelTh: 'Cute Pastel', labelEn: 'Cute Pastel' },
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

  const dark = preset.decor === 'darkAccent';

  return (
    <div className={`invoiceTemplate invoiceTemplate-${preset.group} decor-${preset.decor} invoiceTemplate-structured`} style={style}>
      <div className="invoiceGlow" />
      {preset.group === 'cute' && (
        <div className="templateAssets" aria-hidden="true">
          <span className="templateAsset assetReceipt" />
          <span className="templateAsset assetCloud" />
          <span className="templateAsset assetRainbow" />
          <span className="templateAsset assetWave" />
        </div>
      )}
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
        ) : preset.group === 'cute' ? (
          <>
            {preset.decor === 'cloudBear' && (
              <>
                <path d="M36 74 C26 74 20 66 24 58 C27 50 36 50 40 56 C47 44 66 48 66 62 C82 62 86 82 70 86 H36 Z" fill="currentColor" opacity=".15" />
                <circle cx="100" cy="82" r="20" fill="currentColor" opacity=".18" />
                <circle cx="86" cy="66" r="9" fill="currentColor" opacity=".18" />
                <circle cx="114" cy="66" r="9" fill="currentColor" opacity=".18" />
                <circle cx="94" cy="82" r="2.5" fill="currentColor" opacity=".72" />
                <circle cx="106" cy="82" r="2.5" fill="currentColor" opacity=".72" />
                <path d="M95 91 Q100 95 105 91" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".7" />
              </>
            )}
            {preset.decor === 'sunflower' && (
              <>
                <circle cx="88" cy="62" r="22" fill="currentColor" opacity=".2" />
                {Array.from({ length: 8 }).map((_, i) => {
                  const angle = (i * Math.PI) / 4;
                  const x1 = 88 + Math.cos(angle) * 31;
                  const y1 = 62 + Math.sin(angle) * 31;
                  return <line key={i} x1={88} y1={62} x2={x1} y2={y1} stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".22" />;
                })}
                <path d="M44 128 C54 106 64 106 72 128 M64 128 C74 104 88 104 98 128 M92 128 C102 104 116 106 124 128" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".22" />
              </>
            )}
            {preset.decor === 'leafMascot' && (
              <>
                <path d="M56 128 C82 82 120 84 138 44 C102 48 72 70 56 128 Z" fill="currentColor" opacity=".17" />
                <path d="M62 118 C86 96 106 78 130 52" stroke="currentColor" strokeWidth="4" opacity=".22" strokeLinecap="round" />
                <circle cx="94" cy="72" r="18" fill="currentColor" opacity=".16" />
                <circle cx="88" cy="70" r="2.5" fill="currentColor" opacity=".75" />
                <circle cx="100" cy="70" r="2.5" fill="currentColor" opacity=".75" />
              </>
            )}
            {preset.decor === 'cat' && (
              <>
                <path d="M64 74 L54 48 L78 65 M116 74 L126 48 L102 65" fill="currentColor" opacity=".16" />
                <circle cx="90" cy="88" r="34" fill="currentColor" opacity=".16" />
                <circle cx="80" cy="84" r="3" fill="currentColor" opacity=".75" />
                <circle cx="100" cy="84" r="3" fill="currentColor" opacity=".75" />
                <path d="M83 96 Q90 101 97 96" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".75" />
                <path d="M52 102 H76 M104 102 H128" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".24" />
              </>
            )}
            {preset.decor === 'cactus' && (
              <>
                <path d="M90 128 V66 C90 54 108 54 108 66 V82 C120 78 128 84 128 96 V112 H116 V98 C116 92 108 92 108 100 V128 Z" fill="currentColor" opacity=".17" />
                <path d="M80 90 C66 82 54 90 54 105 V116 H66 V106 C66 98 74 98 80 104 Z" fill="currentColor" opacity=".14" />
                <circle cx="94" cy="78" r="2.2" fill="currentColor" opacity=".75" />
                <circle cx="104" cy="78" r="2.2" fill="currentColor" opacity=".75" />
              </>
            )}
            {preset.decor === 'rainbow' && (
              <>
                <path d="M42 118 C58 72 122 72 138 118" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" opacity=".2" />
                <path d="M56 118 C68 88 112 88 124 118" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity=".15" />
                <circle cx="118" cy="54" r="18" fill="currentColor" opacity=".2" />
                <path d="M36 138 C22 138 18 124 28 118 C32 104 52 108 52 124 C66 124 68 138 54 138 Z" fill="currentColor" opacity=".13" />
              </>
            )}
            {(preset.decor === 'bunny' || !['cloudBear', 'sunflower', 'leafMascot', 'cat', 'cactus', 'rainbow'].includes(preset.decor)) && (
              <>
                <ellipse cx="88" cy="88" rx="30" ry="26" fill="currentColor" opacity=".15" />
                <ellipse cx="70" cy="50" rx="9" ry="22" fill="currentColor" opacity=".15" />
                <ellipse cx="104" cy="50" rx="9" ry="22" fill="currentColor" opacity=".15" />
                <circle cx="78" cy="84" r="2.8" fill="currentColor" opacity=".75" />
                <circle cx="98" cy="84" r="2.8" fill="currentColor" opacity=".75" />
                <path d="M80 96 Q88 102 96 96" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".75" />
                <path d="M44 124 C34 112 46 100 56 110 C66 100 78 112 68 124 L56 136 Z" fill="currentColor" opacity=".16" />
              </>
            )}
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
  content: "20";
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
.invoiceTemplate-structured {
  background:
    radial-gradient(circle at 91% 10%, color-mix(in srgb, var(--accent2) 58%, transparent) 0 20%, transparent 21%),
    radial-gradient(circle at 12% 92%, color-mix(in srgb, var(--accent2) 54%, transparent) 0 22%, transparent 23%),
    linear-gradient(180deg, var(--paper) 0%, color-mix(in srgb, var(--bg) 38%, var(--paper)) 100%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--border) 76%, transparent) inset,
    0 1px 0 rgba(255, 255, 255, .8) inset;
}
.invoiceTemplate-structured::before {
  inset: 0 0 auto 0;
  height: 22%;
  z-index: -1;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent2) 72%, transparent), transparent 64%),
    radial-gradient(circle at 16% 42%, color-mix(in srgb, var(--accent) 18%, transparent) 0 14%, transparent 15%);
  border-radius: 0 0 54% 38% / 0 0 32% 46%;
  opacity: .78;
}
.invoiceTemplate-structured::after {
  display: block;
  left: -14%;
  right: auto;
  top: auto;
  bottom: -8%;
  width: 128%;
  height: 18%;
  aspect-ratio: auto;
  border-radius: 50% 50% 0 0;
  background:
    radial-gradient(circle at 14% 26%, color-mix(in srgb, var(--accent) 24%, transparent) 0 7px, transparent 8px),
    radial-gradient(circle at 86% 18%, color-mix(in srgb, var(--accent2) 80%, transparent) 0 14px, transparent 15px),
    linear-gradient(135deg, color-mix(in srgb, var(--accent2) 76%, transparent), color-mix(in srgb, var(--accent) 18%, transparent));
  transform: none;
  opacity: .72;
}
.invoiceTemplate-structured .invoiceGlow {
  display: none;
}
.invoiceTemplate-structured .decorSvg {
  right: -12%;
  top: 5%;
  width: 48%;
  opacity: .28;
}
.templateAssets {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}
.templateAsset {
  position: absolute;
  display: block;
  background-image: url('/brand/templates/doodle-asset-pack-v1.png?v=20260506c');
  background-repeat: no-repeat;
  background-size: 430% 720%;
}
.assetReceipt {
  left: 4%;
  top: 5%;
  width: 16%;
  height: 19%;
  background-position: 0% 0%;
  opacity: .18;
}
.assetCloud {
  right: 7%;
  top: 9%;
  width: 20%;
  height: 12%;
  background-position: 100% 16.5%;
  opacity: .34;
}
.assetRainbow {
  left: 28%;
  bottom: 7%;
  width: 24%;
  height: 14%;
  background-position: 33.33% 66.5%;
  opacity: .42;
}
.assetWave {
  left: 4%;
  right: 4%;
  bottom: 2.5%;
  height: 6%;
  background-size: 330% 600%;
  background-position: 50% 84%;
  opacity: .5;
}
.invoiceTemplate-structured .invoiceHeader,
.invoiceTemplate-structured .invoiceMeta,
.invoiceTemplate-structured .invoiceTable,
.invoiceTemplate-structured .invoiceLower,
.invoiceTemplate-structured .invoiceFooter {
  filter: drop-shadow(0 1px 0 rgba(255,255,255,.72));
}
.invoiceTemplate-structured .invoiceMeta > div,
.invoiceTemplate-structured .invoiceTable,
.invoiceTemplate-structured .totalCard {
  background: color-mix(in srgb, var(--paper) 68%, transparent);
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
.invoiceTemplate-minimal .tableHead {
  color: var(--text);
}
.invoiceTemplate-cute .tableHead,
.decor-line .tableHead,
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
.invoiceTemplate-cute {
  border-radius: 14px;
}
.invoiceTemplate-cute::after {
  border-radius: 48% 52% 44% 56%;
}
.invoiceTemplate-minimal::after {
  opacity: .22;
}
.decor-gray::before,
.decor-space::before {
  background:
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--border) 56%, transparent) 0 1px, transparent 1px 26px),
    repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 34%, transparent) 0 1px, transparent 1px 26px);
  opacity: .22;
}
.decor-sans .invoiceTitle b {
  text-transform: uppercase;
  letter-spacing: .03em;
}
.decor-space .invoiceTemplate,
.decor-space {
  background: var(--paper);
}
.decor-mint::after,
.decor-beige::after {
  opacity: .25;
  border-radius: 999px;
}
.decor-bunny::before,
.decor-cloudBear::before,
.decor-sunflower::before,
.decor-leafMascot::before,
.decor-cat::before,
.decor-cactus::before,
.decor-rainbow::before {
  background:
    radial-gradient(circle at 13% 12%, color-mix(in srgb, var(--accent2) 72%, transparent) 0 18px, transparent 19px),
    radial-gradient(circle at 84% 14%, color-mix(in srgb, var(--accent) 22%, transparent) 0 12px, transparent 13px),
    radial-gradient(circle at 18% 92%, color-mix(in srgb, var(--accent) 18%, transparent) 0 18px, transparent 19px),
    radial-gradient(circle at 88% 88%, color-mix(in srgb, var(--accent2) 60%, transparent) 0 22px, transparent 23px);
  opacity: .82;
}
.decor-bunny::after,
.decor-cloudBear::after,
.decor-sunflower::after,
.decor-leafMascot::after,
.decor-cat::after,
.decor-cactus::after,
.decor-rainbow::after {
  right: -12%;
  top: 9%;
  width: 48%;
  opacity: .34;
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
