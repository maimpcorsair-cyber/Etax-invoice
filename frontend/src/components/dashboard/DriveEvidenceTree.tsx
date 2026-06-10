import { useMemo, useState, type ComponentType } from 'react';
import { clsx } from 'clsx';
import {
  ChevronRight,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderTree,
  HardDrive,
  Inbox,
  Table2,
} from 'lucide-react';

export interface DriveEvidenceProject {
  id: string;
  code: string;
  name: string;
  status: string;
  driveFolderUrl: string | null;
  googleSheetUrl: string | null;
  fileCount: number;
}

export interface DriveEvidenceFile {
  id: string;
  fileName: string;
  driveUrl: string | null;
  driveFolderUrl: string | null;
  projectName: string | null;
  projectCode: string | null;
  source: string;
  driveSyncedAt: string | null;
}

export interface DriveEvidenceSummary {
  companyName: string | null;
  driveMode: 'company_owner' | 'current_user' | 'service_account' | 'oauth_ready' | 'not_configured';
  workspaceSheetUrl: string | null;
  workspaceSheetSyncedAt: string | null;
  projects: DriveEvidenceProject[];
  recentFiles: DriveEvidenceFile[];
}

interface DriveEvidenceTreeProps {
  summary: DriveEvidenceSummary | null;
  isThai: boolean;
  driveModeLabel: string;
  openingVault?: boolean;
  onOpenVault: () => void | Promise<void>;
  disabled?: boolean;
  formatDate: (value: string) => string;
}

type DriveTreeView = 'map' | 'projects' | 'recent';
type NodeKind = 'root' | 'folder' | 'sheet' | 'file' | 'register';

interface DriveTreeNode {
  id: string;
  name: string;
  kind: NodeKind;
  href?: string | null;
  description?: string;
  meta?: string;
  tone?: 'navy' | 'emerald' | 'amber' | 'slate';
  children?: DriveTreeNode[];
}

const TAX_SPINE_FOLDERS = [
  { key: 'sales', th: '1_ภาษีขาย (Output VAT)', en: '1_Output VAT', hintTh: 'PDF/XML เอกสารขายที่ออกแล้ว', hintEn: 'Issued sales PDFs/XML files' },
  { key: 'purchase', th: '2_ภาษีซื้อ (Input VAT)', en: '2_Input VAT', hintTh: 'ใบกำกับซื้อและเอกสารรับเข้า', hintEn: 'Purchase tax invoices and intake evidence' },
  { key: 'expense', th: '3_ค่าใช้จ่าย', en: '3_Expenses', hintTh: 'บิล/ใบเสร็จค่าใช้จ่าย', hintEn: 'Expense bills and receipts' },
  { key: 'wht', th: '4_หัก ณ ที่จ่าย', en: '4_Withholding Tax', hintTh: 'หนังสือรับรองหัก ณ ที่จ่าย', hintEn: 'WHT certificates' },
  { key: 'payroll', th: '5_เงินเดือน (ภ.ง.ด.1 / สปส.)', en: '5_Payroll', hintTh: 'สลิปเงินเดือนและไฟล์ยื่นที่เกี่ยวข้อง', hintEn: 'Payslips and payroll filing evidence' },
  { key: 'slips', th: '6_สลิป-หลักฐานจ่าย', en: '6_Payment Evidence', hintTh: 'สลิปโอน/หลักฐานชำระเงิน', hintEn: 'Transfer slips and payment proof' },
  { key: 'filed', th: '9_แบบที่ยื่นแล้ว', en: '9_Filed Returns', hintTh: 'ภ.พ.30 และแบบที่บันทึกว่ายื่นแล้ว', hintEn: 'Filed PP.30 and submitted returns' },
];

const VIEW_TABS: Array<{ key: DriveTreeView; icon: ComponentType<{ className?: string }>; th: string; en: string }> = [
  { key: 'map', icon: FolderTree, th: 'แผนผัง', en: 'Map' },
  { key: 'projects', icon: FolderOpen, th: 'โปรเจค', en: 'Projects' },
  { key: 'recent', icon: Inbox, th: 'ไฟล์ล่าสุด', en: 'Recent' },
];

const iconForKind: Record<NodeKind, ComponentType<{ className?: string }>> = {
  root: HardDrive,
  folder: FolderOpen,
  sheet: FileSpreadsheet,
  file: FileText,
  register: Table2,
};

const toneClass = {
  navy: 'bg-primary-50 text-primary-800 ring-primary-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  slate: 'bg-slate-50 text-slate-600 ring-slate-200',
};

function sourceLabel(source: string, isThai: boolean) {
  const lower = source.toLowerCase();
  if (lower.includes('line')) return 'LINE';
  if (lower.includes('upload')) return isThai ? 'อัปโหลดเว็บ' : 'Web upload';
  if (lower.includes('email')) return 'Email';
  return source || (isThai ? 'ไม่ระบุที่มา' : 'Unknown source');
}

function groupFilesByProject(files: DriveEvidenceFile[]) {
  const grouped = new Map<string, DriveEvidenceFile[]>();
  files.forEach((file) => {
    const key = file.projectCode || file.projectName || '__company__';
    grouped.set(key, [...(grouped.get(key) ?? []), file]);
  });
  return grouped;
}

function fileNode(file: DriveEvidenceFile, isThai: boolean, formatDate: (value: string) => string): DriveTreeNode {
  const source = sourceLabel(file.source, isThai);
  const date = file.driveSyncedAt ? formatDate(file.driveSyncedAt) : (isThai ? 'ยังไม่ทราบวันที่ sync' : 'Sync date unknown');
  return {
    id: `file-${file.id}`,
    name: file.fileName,
    kind: 'file',
    href: file.driveUrl,
    description: file.projectName
      ? `${file.projectCode ? `${file.projectCode} · ` : ''}${file.projectName}`
      : (isThai ? 'หลักฐานระดับบริษัท' : 'Company-level evidence'),
    meta: `${source} · ${date}`,
    tone: file.driveUrl ? 'emerald' : 'amber',
    children: file.driveFolderUrl
      ? [{
          id: `folder-${file.id}`,
          name: isThai ? 'เปิดโฟลเดอร์ที่เก็บไฟล์นี้' : 'Open containing folder',
          kind: 'folder',
          href: file.driveFolderUrl,
          meta: isThai ? 'Google Drive folder' : 'Google Drive folder',
          tone: 'navy',
        }]
      : undefined,
  };
}

function buildTree(summary: DriveEvidenceSummary | null, isThai: boolean, formatDate: (value: string) => string): {
  root: DriveTreeNode;
  projectsNode: DriveTreeNode;
  recentNode: DriveTreeNode;
} {
  const projects = summary?.projects ?? [];
  const recentFiles = summary?.recentFiles ?? [];
  const filesByProject = groupFilesByProject(recentFiles);

  const projectChildren: DriveTreeNode[] = projects.map((project) => {
    const projectFiles = filesByProject.get(project.code) ?? filesByProject.get(project.name) ?? [];
    const children: DriveTreeNode[] = [
      {
        id: `project-folder-${project.id}`,
        name: isThai ? 'โฟลเดอร์หลักฐานโปรเจค' : 'Project evidence folder',
        kind: 'folder',
        href: project.driveFolderUrl,
        meta: project.driveFolderUrl ? 'Google Drive' : (isThai ? 'จะสร้างเมื่อมีไฟล์แรก' : 'Created after first file'),
        tone: project.driveFolderUrl ? 'navy' : 'slate',
      },
    ];

    if (project.googleSheetUrl) {
      children.push({
        id: `project-sheet-${project.id}`,
        name: isThai ? 'Google Sheet ของโปรเจค' : 'Project Google Sheet',
        kind: 'sheet',
        href: project.googleSheetUrl,
        meta: isThai ? 'สมุดงานโปรเจค' : 'Project workbook',
        tone: 'emerald',
      });
    }

    children.push(...projectFiles.slice(0, 5).map((file) => fileNode(file, isThai, formatDate)));
    if (project.fileCount > projectFiles.length) {
      children.push({
        id: `project-more-${project.id}`,
        name: isThai ? `อีก ${project.fileCount - projectFiles.length} ไฟล์อยู่ใน Drive` : `${project.fileCount - projectFiles.length} more files in Drive`,
        kind: 'folder',
        href: project.driveFolderUrl,
        meta: isThai ? 'เปิดโฟลเดอร์เพื่อดูทั้งหมด' : 'Open folder to see all',
        tone: 'slate',
      });
    }

    return {
      id: `project-${project.id}`,
      name: `${project.code} · ${project.name}`,
      kind: 'folder',
      href: project.driveFolderUrl,
      description: isThai ? `${project.fileCount} ไฟล์หลักฐาน · ${project.status}` : `${project.fileCount} evidence files · ${project.status}`,
      tone: project.driveFolderUrl ? 'navy' : 'slate',
      children,
    };
  });

  const companyFiles = recentFiles.filter((file) => !file.projectCode && !file.projectName);
  const recentChildren = (companyFiles.length ? companyFiles : recentFiles)
    .slice(0, 10)
    .map((file) => fileNode(file, isThai, formatDate));

  const projectsNode: DriveTreeNode = {
    id: 'projects',
    name: isThai ? 'Projects' : 'Projects',
    kind: 'folder',
    description: isThai ? 'แฟ้มงานที่แยกหลักฐานตามโปรเจค' : 'Evidence folders grouped by project',
    meta: `${projects.length}`,
    tone: 'navy',
    children: projectChildren.length ? projectChildren : [{
      id: 'projects-empty',
      name: isThai ? 'ยังไม่มีโปรเจคที่ sync เข้า Drive' : 'No project folders synced yet',
      kind: 'folder',
      meta: isThai ? 'อัปโหลดไฟล์ในโปรเจคเพื่อสร้างแฟ้ม' : 'Upload a project file to create one',
      tone: 'slate',
    }],
  };

  const recentNode: DriveTreeNode = {
    id: 'recent',
    name: isThai ? 'AI Inbox / ไฟล์ล่าสุด' : 'AI Inbox / Recent files',
    kind: 'folder',
    description: isThai ? 'ไฟล์ที่ระบบเก็บใน Google Drive ล่าสุด' : 'Latest files stored in Google Drive',
    meta: `${recentFiles.length}`,
    tone: 'emerald',
    children: recentChildren.length ? recentChildren : [{
      id: 'recent-empty',
      name: isThai ? 'ยังไม่มีไฟล์ที่ sync เข้า Drive' : 'No files synced to Drive yet',
      kind: 'file',
      meta: isThai ? 'ส่งไฟล์จาก LINE หรืออัปโหลดเว็บก่อน' : 'Send a file from LINE or upload from the web',
      tone: 'slate',
    }],
  };

  const taxNode: DriveTreeNode = {
    id: 'tax-spine',
    name: isThai ? 'โครงแฟ้มภาษีรายเดือน' : 'Monthly tax folder spine',
    kind: 'folder',
    description: isThai ? 'โครงหลักที่ Billboy ใช้จัดเอกสารให้ auditor ไล่ตรวจ' : 'Canonical folders Billboy uses for audit review',
    tone: 'amber',
    children: TAX_SPINE_FOLDERS.map((folder) => ({
      id: `tax-${folder.key}`,
      name: isThai ? folder.th : folder.en,
      kind: 'folder',
      description: isThai ? folder.hintTh : folder.hintEn,
      meta: isThai ? 'สร้างตามปี/เดือนเมื่อมีเอกสาร' : 'Created by year/month when evidence exists',
      tone: 'slate',
    })),
  };

  const root: DriveTreeNode = {
    id: 'root',
    name: summary?.companyName ?? (isThai ? 'บริษัทของคุณ' : 'Your company'),
    kind: 'root',
    description: isThai ? 'แผนผังหลักฐานที่ Billboy รู้จักใน Google Drive' : 'Evidence map Billboy knows in Google Drive',
    meta: summary?.driveMode ?? 'not_configured',
    tone: summary?.driveMode === 'not_configured' ? 'amber' : 'navy',
    children: [
      {
        id: 'master-sheet',
        name: isThai ? 'สมุดทะเบียนภาษี Google Sheet' : 'Master tax register sheet',
        kind: 'register',
        href: summary?.workspaceSheetUrl,
        description: summary?.workspaceSheetSyncedAt
          ? `${isThai ? 'sync ล่าสุด' : 'Last synced'} ${formatDate(summary.workspaceSheetSyncedAt)}`
          : (isThai ? 'สร้างจากปุ่มสมุดทะเบียนด้านบน' : 'Create it from the register button above'),
        meta: summary?.workspaceSheetUrl ? 'Google Sheets' : (isThai ? 'ยังไม่สร้าง' : 'Not created'),
        tone: summary?.workspaceSheetUrl ? 'emerald' : 'amber',
      },
      taxNode,
      projectsNode,
      recentNode,
    ],
  };

  return { root, projectsNode, recentNode };
}

function DriveTreeItem({ node, depth = 0 }: { node: DriveTreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = !!node.children?.length;
  const Icon = iconForKind[node.kind];
  const tone = toneClass[node.tone ?? 'slate'];

  function handleRowClick() {
    if (hasChildren) {
      setOpen((value) => !value);
      return;
    }
    if (node.href) {
      window.open(node.href, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className="select-none">
      <div
        className="group relative"
        style={{ paddingLeft: `${depth * 18}px` }}
      >
        {depth > 0 && <span className="absolute bottom-0 left-[8px] top-0 w-px bg-slate-200/80" aria-hidden="true" />}
        <button
          type="button"
          onClick={handleRowClick}
          className="relative flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition duration-200 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          aria-expanded={hasChildren ? open : undefined}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
            {hasChildren ? <ChevronRight className={clsx('h-4 w-4 transition-transform duration-200', open && 'rotate-90')} /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
          </span>
          <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1', tone)}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-bold text-slate-900">{node.name}</span>
              {node.meta && <span className="hidden shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 sm:inline-flex">{node.meta}</span>}
            </span>
            {node.description && <span className="mt-0.5 block truncate text-xs text-slate-500">{node.description}</span>}
          </span>
          {node.href && (
            <a
              href={node.href}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 opacity-80 transition hover:bg-primary-50 hover:text-primary-700 group-hover:opacity-100"
              aria-label={`Open ${node.name}`}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </button>
      </div>
      {hasChildren && open && (
        <div className="ml-2 border-l border-transparent pl-1 animate-fade-in">
          {node.children!.map((child) => (
            <DriveTreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DriveEvidenceTree({
  summary,
  isThai,
  driveModeLabel,
  openingVault,
  onOpenVault,
  disabled,
  formatDate,
}: DriveEvidenceTreeProps) {
  const [view, setView] = useState<DriveTreeView>('map');
  const tree = useMemo(() => buildTree(summary, isThai, formatDate), [formatDate, isThai, summary]);
  const visibleRoot = view === 'projects' ? tree.projectsNode : view === 'recent' ? tree.recentNode : tree.root;
  const totalFiles = summary?.recentFiles.length ?? 0;
  const projectCount = summary?.projects.length ?? 0;
  const linkedProjects = summary?.projects.filter((project) => project.driveFolderUrl).length ?? 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-primary-50/40 shadow-sm">
      <div className="border-b border-slate-200/80 bg-white/75 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              <HardDrive className="h-3.5 w-3.5" />
              {isThai ? 'Drive Evidence Tree' : 'Drive Evidence Tree'}
            </p>
            <h3 className="mt-1 text-base font-bold text-slate-950">
              {isThai ? 'เห็นโครง Drive ก่อนกดเข้าไฟล์จริง' : 'Preview the Drive structure before opening files'}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {isThai
                ? `${driveModeLabel} · ${linkedProjects}/${projectCount} โปรเจคมีโฟลเดอร์ · ${totalFiles} ไฟล์ล่าสุด`
                : `${driveModeLabel} · ${linkedProjects}/${projectCount} projects linked · ${totalFiles} recent files`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onOpenVault()}
            disabled={disabled || openingVault}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-700 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FolderOpen className="h-4 w-4" />
            {openingVault ? (isThai ? 'กำลังเปิด...' : 'Opening...') : (isThai ? 'เปิด root Drive' : 'Open Drive root')}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-1">
          {VIEW_TABS.map((tab) => {
            const active = view === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={clsx(
                  'inline-flex h-9 items-center gap-2 overflow-hidden rounded-xl px-2.5 text-sm font-bold transition duration-200',
                  active ? 'bg-white text-primary-800 shadow-sm ring-1 ring-primary-100' : 'text-slate-500 hover:bg-white hover:text-slate-800',
                )}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={clsx('whitespace-nowrap transition-all duration-200', active ? 'max-w-28 opacity-100' : 'max-w-0 opacity-0 sm:max-w-20 sm:opacity-100')}>
                  {isThai ? tab.th : tab.en}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto p-2 sm:p-3">
        <DriveTreeItem node={visibleRoot} />
      </div>

      <div className="flex items-start gap-2 border-t border-slate-200/80 bg-white/70 px-4 py-3 text-xs leading-5 text-slate-600">
        <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
        <p>
          {isThai
            ? 'Tree นี้แสดงข้อมูลที่ Billboy sync หรือรู้จักแล้วในระบบ ถ้าต้องการเห็นทุกไฟล์ใน Drive แบบสด ๆ ให้เปิด root Drive จากปุ่มด้านบน'
            : 'This tree shows files and folders Billboy has synced or indexed. Open the Drive root to inspect every live file in Google Drive.'}
        </p>
      </div>
    </section>
  );
}
