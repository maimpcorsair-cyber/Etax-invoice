import {
  ChevronRight,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  FolderOpen,
  Link2,
  Send,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export type DocumentArtifactState = 'ready' | 'pending' | 'blocked';
export type DocumentArtifactKind = 'folder' | 'file' | 'pdf' | 'xml' | 'rd' | 'drive' | 'sheet' | 'link';

export interface DocumentArtifactNode {
  id: string;
  label: string;
  description?: string;
  meta?: string;
  href?: string | null;
  kind?: DocumentArtifactKind;
  state?: DocumentArtifactState;
  children?: DocumentArtifactNode[];
}

interface DocumentArtifactTreeProps {
  title?: string;
  description?: string;
  nodes: DocumentArtifactNode[];
  isThai: boolean;
  className?: string;
}

const STATE_COPY: Record<DocumentArtifactState, { th: string; en: string; className: string; dot: string }> = {
  ready: {
    th: 'พร้อม',
    en: 'Ready',
    className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]',
  },
  pending: {
    th: 'รอ',
    en: 'Pending',
    className: 'border-amber-100 bg-amber-50 text-amber-700',
    dot: 'bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.12)]',
  },
  blocked: {
    th: 'ติดขัด',
    en: 'Blocked',
    className: 'border-rose-100 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.12)]',
  },
};

function iconForKind(kind: DocumentArtifactKind | undefined) {
  switch (kind) {
    case 'folder':
      return FolderOpen;
    case 'pdf':
      return Download;
    case 'xml':
      return FileCode2;
    case 'rd':
      return Send;
    case 'drive':
      return ShieldCheck;
    case 'sheet':
      return Table2;
    case 'link':
      return Link2;
    case 'file':
    default:
      return FileText;
  }
}

function collectOpenIds(nodes: DocumentArtifactNode[]) {
  const openIds = new Set<string>();
  const visit = (items: DocumentArtifactNode[]) => {
    for (const item of items) {
      if (item.children?.length) {
        openIds.add(item.id);
        visit(item.children);
      }
    }
  };
  visit(nodes);
  return openIds;
}

function artifactSummary(nodes: DocumentArtifactNode[]) {
  const totals = { ready: 0, pending: 0, blocked: 0 };
  const visit = (items: DocumentArtifactNode[]) => {
    for (const item of items) {
      const state = item.state ?? (item.href ? 'ready' : 'pending');
      totals[state] += 1;
      if (item.children?.length) visit(item.children);
    }
  };
  visit(nodes);
  return totals;
}

export default function DocumentArtifactTree({
  title,
  description,
  nodes,
  isThai,
  className = '',
}: DocumentArtifactTreeProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => collectOpenIds(nodes));
  const summary = useMemo(() => artifactSummary(nodes), [nodes]);

  useEffect(() => {
    setOpenIds(collectOpenIds(nodes));
  }, [nodes]);

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: DocumentArtifactNode, depth = 0) => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const isOpen = openIds.has(node.id);
    const state = node.state ?? (node.href ? 'ready' : 'pending');
    const stateCopy = STATE_COPY[state];
    const Icon = iconForKind(node.kind);
    const rowLabel = `${node.label}${node.meta ? ` ${node.meta}` : ''}`;

    return (
      <li key={node.id} className="relative">
        {depth > 0 && (
          <span
            className="pointer-events-none absolute left-[15px] top-0 h-full w-px bg-slate-200"
            aria-hidden="true"
          />
        )}
        <div
          className="group relative flex items-start gap-2 rounded-2xl px-2 py-2 transition duration-200 hover:bg-slate-50 motion-reduce:transition-none"
          style={{ paddingLeft: depth ? `${depth * 18 + 8}px` : undefined }}
        >
          <button
            type="button"
            className="mt-0.5 flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
            onClick={() => {
              if (hasChildren) toggle(node.id);
              else if (node.href) window.open(node.href, '_blank', 'noopener,noreferrer');
            }}
            aria-label={rowLabel}
            aria-expanded={hasChildren ? isOpen : undefined}
          >
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm">
              {hasChildren && (
                <ChevronRight
                  className={`absolute -left-2 h-3.5 w-3.5 text-slate-400 transition duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`}
                />
              )}
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-xs font-bold text-slate-800">{node.label}</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${stateCopy.className}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${stateCopy.dot}`} aria-hidden="true" />
                  {isThai ? stateCopy.th : stateCopy.en}
                </span>
              </span>
              {node.description && (
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{node.description}</span>
              )}
              {node.meta && (
                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{node.meta}</span>
              )}
            </span>
          </button>
          {node.href && (
            <a
              href={node.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 opacity-70 transition hover:bg-primary-50 hover:text-primary-700 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 motion-reduce:transition-none"
              aria-label={isThai ? `เปิด ${node.label}` : `Open ${node.label}`}
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        {hasChildren && isOpen && (
          <ul className="ml-3 space-y-0.5 pb-1">
            {children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  if (!nodes.length) return null;

  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-3 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">
            {title ?? (isThai ? 'ไฟล์และหลักฐาน' : 'Files and evidence')}
          </h3>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            {description ?? (isThai ? 'สิ่งที่ workflow สร้าง เก็บ หรือรอสร้างต่อ' : 'Artifacts generated, stored, or queued by this workflow.')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">
          <span className="text-emerald-600">{summary.ready}</span>
          <span>/</span>
          <span>{summary.ready + summary.pending + summary.blocked}</span>
        </div>
      </div>
      <ul className="mt-3 space-y-0.5">{nodes.map((node) => renderNode(node))}</ul>
    </section>
  );
}
