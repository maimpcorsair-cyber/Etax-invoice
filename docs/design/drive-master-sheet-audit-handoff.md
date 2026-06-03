# Handoff — Drive folder architecture + Master Sheet (audit-ready)

Pick-up doc for the next agent (Codex). Goal: make each company's **own Google Drive**
folder tree + the per-company **master Google Sheet** audit-ready for สรรพากร (Revenue
Dept). Based on a senior Thai accountant/auditor review of the live code. Direction locked.

## Read first (ground in current code)
- `backend/src/services/googleDriveService.ts` — Drive OAuth (per-user refresh token,
  encrypted), folder helpers (`ensureChildFolder` list-before-create, `getTransactionMonthBucket()`),
  `drive.file` scope, `prompt=consent`+`access_type=offline`.
- `backend/src/services/projectDriveSyncService.ts` — `driveFolderForIntake` (flat folders today).
- `backend/src/queues/workers/masterSheetWorker.ts` — builds the master sheet (full clear-and-
  rewrite, BullMQ `jobId: master-sheet-${companyId}`, 60s debounce). Tabs today: ขาย/ซื้อ/
  ค่าใช้จ่าย/ลูกค้า/คู่ค้า/สินค้า/AI Inbox/สรุปโปรเจค.
- `backend/src/services/googleSheetsService.ts` — sheet defs + `linkCell` HYPERLINK, `exportPp30ToSheets` (orphan one-off).
- `backend/prisma/schema.prisma` — `googleWorkspaceSheetId`, `driveFolderId`, `googleDriveOwnerUserId`,
  `Invoice`(driveUrl/driveXmlUrl), `PurchaseInvoice`, `ExpenseVoucher`/`ExpenseAttachment`,
  `WhtCertificate`, `Payslip`/`PayrollRun`.

## Already good — DO NOT rebuild
Per-tenant refresh tokens encrypted at rest (`enc:v1:` via `companyConfigService`), decrypted
only at API boundary. Master sheet is a full DB→sheet rewrite (idempotent, no double rows) with
jobId dedup + debounce. Invoice path uploads PDF **and** signed XML. `linkCell` 📎 audit links.
Folder list-before-create. Service-account fallback. Transaction-date bucket helper already written.

## Core problem
Folder tree + master sheet are organized **operations-first** (by project/customer), not
**audit-first** (by tax period → document class). An auditor can't pull "ภาษีซื้อ มีนาคม 2567"
in one click; there's no input/output VAT register, no ภ.พ.30 reconciliation, no WHT/payroll tabs.

## Target Drive tree (tax-period spine; Thai folder names)
```
Billboy / <ชื่อบริษัท> (เลขภาษี 13 หลัก)/
├── 00_เอกสารบริษัท/            ← permanent: ภ.พ.20, หนังสือรับรอง, บอจ.5, bank statements
├── 2567/                        ← ปีภาษี (พ.ศ.)
│   ├── 01_มกราคม/
│   │   ├── 1_ภาษีขาย (Output VAT)/    ← T01–T05 PDF + XML คู่กันเสมอ (XML = legal doc)
│   │   ├── 2_ภาษีซื้อ (Input VAT)/
│   │   ├── 3_ค่าใช้จ่าย (ไม่มี VAT)/
│   │   ├── 4_หัก ณ ที่จ่าย (ภ.ง.ด.3-53)/
│   │   ├── 5_เงินเดือน (ภ.ง.ด.1 / สปส.)/
│   │   ├── 6_สลิป-หลักฐานจ่าย/
│   │   └── 9_แบบที่ยื่นแล้ว (ภ.พ.30)/
│   ├── 02_กุมภาพันธ์/ …
│   └── _สรุปปี 2567/            ← ภ.ง.ด.50, งบการเงิน
└── _โปรเจค/                     ← secondary VIEW: Drive shortcuts to the period files
```
Bucket by **transaction date, not upload date** (helper exists). Retention 5 yr (มาตรา 87/3),
filing is monthly → the month is the folder unit. Keep project/customer tree as a secondary view.

## Master sheet — registers to build (every row ends in 📎 to the Drive file)
- **ภาษีขาย (Output VAT):** งวด(YYYY-MM) · วันที่ · เลขที่ · ประเภท(T01–T05) · ผู้ซื้อ ·
  **เลขผู้เสียภาษีผู้ซื้อ** · มูลค่า 7%/0%/ยกเว้น (3 cols) · VAT · รวม · สถานะ RD · 📎PDF · 📎XML
- **ภาษีซื้อ (Input VAT):** งวด · วันที่ · เลขที่ · ผู้ขาย · เลขภาษีผู้ขาย(`supplierTaxId`) · มูลค่า ·
  VAT · หมวด · สถานะ(ขอคืนได้/ต้องห้าม ม.82/5) · 📎(Drive, not S3)
- **ค่าใช้จ่าย:** งวด · PV · ผู้รับเงิน · หมวด · ยอด · WHT? · 📎
- **WHT (ภ.ง.ด.3/53):** งวด · เลข 50ทวิ · วันจ่าย · ผู้ถูกหัก+เลขภาษี · ประเภทเงินได้ · ฐาน · อัตรา · ภาษีหัก · 3/53 flag · 📎  *(new)*
- **เงินเดือน (ภ.ง.ด.1):** งวด · พนักงาน · gross · WHT · สปส. · net  *(new)*
- **ภ.พ.30 reconciliation:** 1 row/งวด, **formulas**: ภาษีขาย `=SUMIF` · ภาษีซื้อ `=SUMIF` ·
  ต้องชำระ/ขอคืน · ยอดยื่นจริง(manual) · **ผลต่าง** (must be 0)  *(new; fold in exportPp30 logic)*
- **AR/AP aging:** outstanding · ยอด · ครบกำหนด · `=TODAY()-dueDate` bucket  *(formulas)*
- **สรุปรายเดือน:** 12 rows, all SUMIF by งวด.
Billboy pushes raw register rows; ภ.พ.30 / aging / สรุป / totals are SUMIF/QUERY formulas so a
re-sync never clobbers them. Keep column order stable + a hidden `docId` col for FlowAccount/PEAK
re-import dedupe.

## Push events (idempotency already handled by full-rewrite)
issue/approve invoice → ภาษีขาย + PDF/XML to `YYYY/MM/1_ภาษีขาย`; confirm purchase → ภาษีซื้อ +
`2_ภาษีซื้อ`; approve expense → ค่าใช้จ่าย + `3_`; issue WHT → WHT + `4_`; finalize payroll →
เงินเดือน + `5_`; payment → slip to `6_` + flip isPaid (drives aging). Cancelled invoice: **keep
the row with a cancelled flag** (don't drop — gaps in invoice-number sequence are an audit flag).

## Build plan
**P0**
1. Implement the `YYYY/MM/<tax-class>` Drive tree; actually call `getTransactionMonthBucket()` in
   the sync paths (`googleDriveService.ts` ~165 helper; `projectDriveSyncService.ts:36` flat today).
2. Add `syncPurchaseInvoiceToDrive` (mirror `syncInvoiceToDrive`); link `driveUrl` in the ภาษีซื้อ
   register, not the expiring S3 signed URL (`masterSheetWorker.ts:182`).
3. Wire expense evidence link (`masterSheetWorker.ts:209` `attachmentLink:''` TODO →
   `ExpenseAttachment.driveUrl`/`s3Key`).
4. Add WHT + Payroll tabs (data exists in `WhtCertificate`, `Payslip`).
**P1**
5. ภาษีขาย: add buyer `taxId`, `งวด` column, split VAT 7%/0%/exempt (`masterSheetWorker.ts:185`).
6. Add live ภ.พ.30 reconciliation tab (fold `exportPp30ToSheets` logic into a SUMIF tab).
7. Keep cancelled invoices visible with a flag (worker filter at `masterSheetWorker.ts:100`
   currently drops them).
**P2**
8. Serialize folder creation per company (TOCTOU race in `ensureChildFolder` ~94 can dup month folders).
9. **Strongly recommend Shared Drive (Team Drive) owned by the org instead of one employee's
   personal Drive** (`googleDriveOwnerUserId` = single point of failure for a 5-yr obligation).
10. Document that `drive.file` scope means Billboy only sees files it created (can't file
    manually-added files) — acceptable, but note for support.

## Verify / deploy
Drive + Sheets need Google OAuth configured to test end-to-end (local won't have it unless env set;
prod does — service-account fallback + a connected owner). Backend changes → after push run
`gh workflow run render-deploy.yml --ref main` (migrate + deploy). Local: `cd backend && npx tsc
--noEmit`. Keep token encryption + idempotent rewrite intact. Don't store secret cert bytes in Drive.
```
```
