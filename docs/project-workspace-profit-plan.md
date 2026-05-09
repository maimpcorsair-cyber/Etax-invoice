# Billboy Project Workspace + Profit Plan

Last updated: 2026-05-10 00:55 Asia/Bangkok

This document is the working plan for turning Billboy from an OCR/e-Tax tool into a project-aware operating system for SME accounting, field teams, and project owners.

## Product Thesis

Billboy should not compete as "another OCR reader." The stronger position is:

> Billboy connects LINE, files, project budgets, expenses, tax documents, payments, invoices, Google Drive, and exports into one project workspace so teams know what happened, what is missing, and what is safe for tax.

The main customer pain is not only reading PDFs/JPGs. The real pain is:

- nobody knows which project a file belongs to
- files are scattered in LINE groups
- slips are not matched to bills
- small expenses without tax invoices disappear from project cost
- owners ask accounting for status repeatedly
- accounting spends time chasing missing documents
- VAT is risky because some documents are not tax-claimable

## Core Principle

`projectId` must become the relationship backbone across the system.

Every relevant record should be able to connect to a project:

- LINE group links
- LINE user uploads
- `DocumentIntake`
- project files and Google Drive folders
- purchase invoices / Input VAT
- payment slips
- payment vouchers / expense vouchers
- petty cash
- sales invoices
- PO / quotation / delivery note documents
- audit logs
- exports

Project is not just a budget page. It is the workspace where the team sees the documents, action items, tax safety, and money flow for one job.

## Recommended Build Order

Build in rounds so production keeps working and each round has a clear business value.

1. Project Workspace backbone
   - project pages, budget, members, file library, LINE group binding, Input VAT, expenses, invoices
   - goal: every uploaded file and money record can belong to one project
2. Action Needed + Tax Safety
   - missing tax ID/date/amount, OCR failed, not VAT-claimable, unmatched slip, approval pending
   - goal: accountants review risk instead of searching every document
3. Smart Matching
   - match slips/supporting files to purchase invoices by amount, date, supplier/receiver, and project
   - goal: reduce manual chasing in LINE
4. Export / Close-out Pack
   - Excel, Google Sheets, ZIP attachments, Drive folder structure
   - goal: one-click project handoff for owner/accountant/auditor
5. LINE Guest Portal
   - read-only project dashboard for LINE group members with limited upload/comment
   - goal: let non-seat field users help fix missing documents without seeing company accounting
6. DBD Integration
   - lookup juristic profile by 13-digit JuristicID
   - search by juristic name
   - autofill customer/vendor legal name, status, registered capital, and address when available
   - goal: reduce wrong tax ID/legal name and make customer/vendor onboarding smarter
7. DBD-Backed Risk Checks
   - warn when juristic status is inactive
   - warn when invoice legal name does not match DBD profile
   - keep a cached verified profile with source/timestamp
   - goal: prevent tax-document errors before RD/export time

Current DBD foundation:

- Backend route: `GET /api/dbd/status`
- Backend route: `GET /api/dbd/juristic/:juristicId`
- Backend route: `GET /api/dbd/juristic-search?name=...`
- Required env: `DGA_CONSUMER_KEY`, `DGA_CONSUMER_SECRET`, `DGA_AGENT_ID`
- Optional env overrides: `DGA_BASE_URL`, `DGA_VALIDATE_PATH`, `DBD_PROFILE_PATH`, `DBD_SEARCH_BY_NAME_PATH`, `DBD_REQUEST_TIMEOUT_MS`

Do not block Project Workspace launch on DBD credentials. DBD should enhance autofill and verification after Government API access is approved.

## Target Workflow

1. Admin creates a project with budget, owner, approver, accountant, and team members.
2. Admin links one or more LINE groups to that project.
3. Field staff send PDF/JPG/slip/photo/text into LINE.
4. Billboy saves the file with `projectId`.
5. AI classifies the document:
   - Input VAT document
   - payment slip
   - PO / quotation
   - payment voucher / non-VAT expense
   - supporting site photo
   - unknown / needs review
6. Billboy shows the document in Project Workspace.
7. Accounting reviews only action-needed items, not every file manually.
8. Owner/approver sees budget, missing documents, unpaid bills, unmatched slips, and tax risk.
9. Export creates a project pack for accounting or management.

## Project Workspace UX

### Required Tabs

- Overview
  - budget
  - committed cost
  - paid cost
  - revenue from sales invoices
  - estimated margin
  - missing document count
  - tax risk count
  - over-budget warning
- Action Needed
  - OCR failed
  - missing tax ID
  - missing invoice number/date/amount
  - slip not matched
  - PO not matched
  - expense without evidence
  - approval pending
- Files
  - all PDF/JPG/PNG/WebP
  - filters by document kind/status/source
  - preview file
  - open original
  - upload new file directly into this project
- Purchases / Input VAT
  - purchase invoices linked to project
  - tax safety status
  - claimable VAT amount
  - not-claimable expense amount
- Payments
  - bank slips
  - PromptPay slips
  - unmatched slips
  - paid/unpaid status
- Expenses / Payment Vouchers
  - non-VAT costs such as motorcycle taxi, parking, petty cash, food, messenger, small supplies
  - evidence status
  - approval status
- Sales Invoices
  - invoices issued for this project
  - paid/unpaid status
  - revenue summary
- Export
  - Excel
  - Google Sheet
  - Drive folder link
  - attachment pack

### Upload Behavior

Uploading from a project page should automatically set `projectId`.

Upload destinations:

- Project Workspace upload
- Input VAT upload with selected project
- LINE group linked to project
- Payment Voucher upload with selected project
- Sales invoice created from project

## Dynamic Roles

Billboy must support real SME behavior where one person wears many hats.

Use three layers:

- Company role: admin, accountant, staff, viewer
- Project role: owner, approver, accountant, uploader, viewer
- Permission: upload, view budget, approve, edit tax data, export, invite

Examples:

- Company owner can also be project accountant.
- Accountant can own one project and only review another.
- Field staff can upload files but cannot edit VAT.
- Approver can approve spend but cannot change tax classification.

## LINE + Guest Portal

LINE should become a low-friction project entry point.

Recommended model:

- Full user: logged in, paid seat or included team seat, full audit.
- LINE guest: signed/token link from LINE group, limited project portal access.

LINE guest portal v1 should be read-only or nearly read-only:

- view project status
- view files submitted by the group
- view missing/action-needed items
- upload additional evidence
- comment

LINE guest should not be able to:

- edit tax data
- export tax reports
- manage RD/certificate settings
- see other projects
- see company-wide accounting

Future command examples:

- `สถานะงาน`
- `งบเหลือ`
- `เอกสารขาด`
- `สรุปวันนี้`
- `ค่ารถ 120`

## Payment Voucher / Non-VAT Expense Value

Payment Voucher is important because real project costs often do not have tax invoices.

Examples:

- motorcycle taxi
- parking
- site messenger
- small cash purchase
- food for crew
- fuel/transport
- daily labor evidence

These should not go to Input VAT by default. They should go to expense voucher / payment voucher with tax classification:

- counts as project cost
- may support accounting expense if evidence is enough
- does not claim input VAT unless valid tax invoice exists
- may need owner/accountant review

This is a key loyalty feature because it shows true project cost, not only tax-document cost.

## Tax Safety Layer

Every document should have a tax safety status:

- `vat_claimable`
- `expense_only_no_vat`
- `needs_tax_invoice`
- `missing_required_fields`
- `unmatched_payment`
- `supporting_only`
- `do_not_claim`

This prevents AI from making tax mistakes and gives accountants a review queue.

## Commercial Packaging

Use company workspace subscription + included seats + document quota.

Internal plan names can remain `starter` and `business` for compatibility, but customer-facing names should be:

| Customer Plan | Internal Plan | Price Target | Included |
| --- | --- | ---: | --- |
| Free | free | 0 THB/mo | 20 docs, 1 user, 1 project, 1 LINE group |
| Solo | starter | 299 THB/mo | 150 docs, 3 users, 10 projects, 3 LINE groups |
| Team | business | 990 THB/mo | 800 docs, 8 users, 50 projects, 20 LINE groups, Drive/Sheets |
| Enterprise | enterprise | custom | custom volume, SLA, onboarding |

Recommended add-ons:

- Extra team seat: 99-149 THB/user/month
- Viewer/approver guest: free or low-cost, limited permission
- Extra OCR/doc over quota: 0.75-2 THB/doc
- High-volume OCR pack: prepaid bundles

Important Stripe note:

- Current env names remain `STRIPE_PRICE_STARTER_MONTHLY` and `STRIPE_PRICE_BUSINESS_MONTHLY`.
- Stripe dashboard prices must be updated to match 299/990 before charging real customers.

## Cost Model

The exact margin depends on document mix. Use conservative assumptions until production telemetry exists.

### Main Costs

- AI/OCR model usage
- Render backend/API
- database
- Redis/queue
- Vercel frontend
- email/SMS/LINE messaging, if applicable
- Stripe/payment fees
- support/onboarding time
- Google Drive storage, if stored in customer admin Drive, mostly shifts storage cost away from Billboy

### OCR Cost Strategy

Always use the cheapest successful path first:

1. Digital PDF text extraction.
2. QR/slip decode where possible.
3. Rule-based classification.
4. Vision OCR only when needed.
5. Stronger model only for low-confidence or high-value documents.
6. Cache OCR result and never re-read the same file repeatedly without user intent.

Planning estimate per document:

| Document Type | Expected Billboy Cost |
| --- | ---: |
| Digital PDF / QR slip decoded locally | near 0 THB |
| Simple image OCR with small model | about 0.05-0.50 THB |
| Normal scanned receipt/tax invoice | about 0.50-2.00 THB |
| Hard multi-page PDF / retry / strong model | about 2.00-8.00 THB |

Use these as internal planning ranges, not invoice-grade cost accounting.

OpenAI pricing reference as of this update:

- GPT-5 mini text: $0.25 input / $2.00 output per 1M tokens.
- GPT-5 nano text: $0.05 input / $0.40 output per 1M tokens.
- GPT-4.1 mini text: $0.40 input / $1.60 output per 1M tokens.

Sources:

- OpenAI pricing: https://platform.openai.com/docs/pricing/
- OpenAI GPT-4.1 mini model page: https://platform.openai.com/docs/models/gpt-4.1-mini
- Render pricing: https://render.com/pricing/
- Google Workspace storage limits: https://support.google.com/a/answer/172541

## Unit Economics

Use 35 THB/USD as a simple planning assumption. Update this when doing investor/pricing material.

### Solo 299 THB

Target user:

- one owner/admin
- maybe accountant/helper as team member
- low to medium document volume

If average variable cost per doc is 0.50 THB and included docs are 150:

- OCR variable cost: 75 THB
- gross after OCR: 224 THB
- payment fee/support/cloud overhead still needs to fit here

If average variable cost rises to 2 THB/doc:

- OCR variable cost: 300 THB
- Solo loses money at full quota

Conclusion:

- Solo is profitable only if most documents are cheap-path OCR.
- Solo must cap heavy OCR/retries and charge extra OCR over quota.
- Solo is acquisition/land plan, not the main profit engine.

### Team 990 THB

Target user:

- multi-person team
- many LINE group/project workflows
- more willing to pay because it saves coordination labor

If average variable cost per doc is 0.50 THB and included docs are 800:

- OCR variable cost: 400 THB
- gross after OCR: 590 THB

If average variable cost is 1 THB/doc:

- OCR variable cost: 800 THB
- gross after OCR: 190 THB

Conclusion:

- Team needs good OCR routing and overage pricing.
- Team margin improves with Drive storage shifted to customer account and with strong project workflow retention.
- Team is the best core plan for loyalty and upsell.

## Break-Even Logic

The app is worth building if it becomes the team's operating workflow, not merely a per-document OCR tool.

Strong retention drivers:

- LINE group project routing
- project dashboard for owners
- action-needed queue for accountants
- VAT safety layer
- Drive folder per project
- export/report pack
- guest portal for field teams

Weak retention drivers:

- OCR-only upload page
- budget-only project page
- isolated Drive backup

## Product Roadmap

### Phase 1: Project Workspace MVP

- `/app/projects/:id`
- tabs: Overview, Action Needed, Files, Purchases, Expenses, Sales Invoices
- upload into project
- project filters in Input VAT and invoices
- project-linked file preview

### Phase 2: LINE Project Workflow

- project picker in LINE Admin group UI
- LINE group dashboard link
- LINE commands: status, missing docs, budget left
- guest project portal read-only

### Phase 3: Accounting Automation

- smart matching:
  - PO to purchase invoice
  - purchase invoice to payment slip
  - slip to receiver/vendor
  - non-VAT expense to payment voucher
- tax safety queue
- approval workflow

### Phase 4: Exports + Drive

- project Excel export
- project Google Sheet sync
- Drive project folder upload wiring
- ZIP attachment pack

### Phase 5: Monetization Hardening

- usage telemetry by OCR path
- per-company document margin report
- overage billing
- add-on seats
- plan downgrade/upgrade rules

## Success Metrics

- documents per active project
- percent automatically assigned to project
- percent classified correctly
- unmatched slips count
- missing tax-field count
- time from LINE upload to accounting-ready record
- exports per project per month
- active LINE groups per paid company
- paid conversion from Free/Solo to Team
- gross margin after OCR by plan

## Current Implementation State

Already implemented:

- Project and ProjectMember models.
- `projectId` on invoices, purchase invoices, document intakes, expense vouchers, and LINE group links.
- `/api/projects` CRUD and assignment endpoint.
- `/app/projects` list page.
- `/app/projects/:id` Project Workspace with overview, action-needed, files, purchases, sales, expenses, LINE groups, upload, and Excel export.
- Input VAT upload and manual purchase invoice can carry `projectId`.
- Input VAT, sales invoices, and expenses support project filtering.
- Invoice Builder and Expenses can be opened with `?projectId=...` and keep project context.
- Admin LINE group UI can assign linked LINE groups to a project.
- LINE live-status debug includes recent document project/source/file context.
- LINE intake can inherit `projectId` from linked group.
- Solo/Team customer-facing packaging.
- Access policy exposes project and LINE group limits.
- Google Drive service can create project/category folder paths.
- Project Excel export pack.
- Project Google Sheet sync.
- Project ZIP attachment pack.
- Project Drive upload wiring for direct uploads and project document intake mirrors.
- Approval workflow by project owner/approver.
- Project tax safety summary/status chips.
- Smart Matching v1 in Project Workspace:
  - unmatched slips/supporting documents
  - likely purchase candidates
  - attach document intake to purchase invoice from the project workspace
- LINE/OCR live-status usage telemetry and estimated OCR cost.

Still needed:

- Guest project portal.
- Smarter tax safety queue and matching beyond v1:
  - PO to purchase invoice
  - slip to receiver/vendor
  - non-VAT expense to payment voucher
- Billing automation for overage/add-on seats.
