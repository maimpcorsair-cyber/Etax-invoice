// Dev-only preview harness: renders the real DashboardView with mock data so
// the redesign can be screenshotted without a backend/login. Not part of the
// app bundle — reached via /dashboard-preview.html in `vite dev`.
import { createRoot } from 'react-dom/client';
import DashboardView, { type DashboardViewProps } from './pages/dashboard/DashboardView';
import './index.css';

const mock: DashboardViewProps = {
  greeting: 'สวัสดี, คุณสมชาย',
  contextLine: 'บริษัท สยามเทค จำกัด · รอบภาษี พฤษภาคม 2569 · เหลือ 8 วัน',
  focus: {
    label: 'ควรทำก่อน',
    amount: '฿186,200',
    detail: 'ลูกหนี้เกินกำหนด 3 ราย ค้างนานสุด 21 วัน — ส่งลิงก์ทวงถาม หรือออกใบเสร็จเมื่อได้รับชำระแล้ว',
    primary: { label: 'ดูใบค้างชำระ', href: '#' },
    secondary: { label: 'ทวงทาง LINE', href: '#' },
  },
  kpis: [
    { label: 'รายได้เดือนนี้', value: '฿1.28M', detail: '142 ใบ · +12% MoM' },
    { label: 'รับชำระแล้ว', value: '฿1.10M', detail: '138 ตรงสลิป', tone: 'good', dot: 'good' },
    { label: 'ลูกหนี้เกินกำหนด', value: '฿186K', detail: '3 ราย · 21 วัน', tone: 'due', dot: 'due' },
    { label: 'ต้องนำส่ง VAT', value: '฿48,655', detail: 'เอกสารครบ 96%' },
  ],
  worklistTitle: 'คิวงานวันนี้',
  worklistHref: '#',
  worklist: [
    { title: 'เอกสารรอ AI ตรวจ', meta: 'สลิป/บิลจาก LINE 4 ไฟล์', href: '#', actionLabel: 'เปิด Inbox', count: 4 },
    { title: 'ใบขายรออนุมัติ', meta: 'ตรวจแล้วกดออกเอกสาร', href: '#', actionLabel: 'ตรวจ', count: 5 },
    { title: 'ยังไม่ส่งกรมสรรพากร', meta: 'รอบ พ.ค. · เหลือ 8 วัน', href: '#', actionLabel: 'คิวส่ง', chip: { label: '7 รอส่ง', tone: 'warn' } },
    { title: 'คู่ค้าข้อมูลไม่พร้อม', meta: 'รอ ภ.พ.20 · 2 ราย', href: '#', actionLabel: 'เปิด', count: 2 },
  ],
  vat: {
    salesVat: '฿89,915',
    purchaseVat: '฿41,260',
    netPayable: '฿48,655',
    readinessPct: 96,
    note: 'เอกสารพร้อม 96% · ขาด ภ.พ.20 คู่ค้า 2 ราย',
    href: '#',
  },
  vatTitle: 'ความพร้อมยื่น VAT · พ.ค.',
  pipelineTitle: 'เส้นทางเอกสารเดือนนี้',
  pipeline: [
    { key: 'รับเข้า', title: 'LINE · เว็บ · PDF', value: '30 ไฟล์ / 30 วัน', on: true },
    { key: 'AI อ่าน', title: 'แยก VAT · ผู้ขาย', value: '4 รอยืนยัน', on: true },
    { key: 'ออกขาย', title: 'สร้าง PDF', value: '5 รออนุมัติ' },
    { key: 'ยื่นภาษี', title: 'ส่ง RD', value: '142 สำเร็จ' },
  ],
};

createRoot(document.getElementById('root')!).render(<DashboardView {...mock} />);
