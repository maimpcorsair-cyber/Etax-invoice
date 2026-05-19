# Billboy Product Strategy

Last updated: 2026-05-20

This doc captures the **positioning + roadmap decision** made on
2026-05-20 after a competitive review of FlowAccount and PEAK (Paypers).
Treat it as the load-bearing reference for prioritisation decisions —
when in doubt about whether to build feature X, check Section 4 first.

## 1. Reality check on Thai e-Tax

The product's original framing led with "ETDA-compliant e-Tax Invoice
with RD submission." That framing **overweights a feature most SMEs
don't need**.

Thai compliance thresholds (current law):

| Threshold | What it means |
|---|---|
| Annual revenue > **1.8M baht** | Must register for VAT (ภพ.20). About **all** real SMEs cross this. |
| e-Tax Invoice via email | **Optional**. Issuing as PDF + emailing the customer is fully compliant. |
| e-Tax Invoice via RD direct (ETDA XAdES-BES) | **Optional**. Required only for businesses that explicitly opt in. |
| Mandatory e-invoicing | **Does not exist** in Thailand yet. RD is studying it. No date. |

There is **no 30M baht trigger** that forces e-Tax submission — that
number sometimes circulates but is not in current Revenue Code.

**Implication:** roughly 95% of our target SMEs can use Billboy
without ever sending a single document to RD. e-Tax becomes a
premium add-on, not the headline.

## 2. Competition snapshot

| Capability | FlowAccount | PEAK (Paypers) | Billboy today |
|---|---|---|---|
| Invoice issuance | ✅ | ✅ | ✅ |
| Auto P&L / Balance Sheet | ✅ core | ✅ core | ❌ missing |
| Receipt OCR | ✅ basic | ✅ strong | ✅ LINE-Bot intake |
| Payroll (เงินเดือน / ภงด.1 / สปส.) | ✅ | ✅ | ❌ missing |
| Bank reconciliation | ✅ | ✅ | ❌ missing |
| Accountant collaboration (multi-user) | ✅ | ✅ | ⚠️ admin-only |
| e-Tax XAdES-BES + RD submission | add-on | add-on | ✅ core |
| LINE bot intake | ❌ | ❌ | ✅ **unique** |
| PDPA Section 30/33 self-serve UI | ❌ | ❌ | ✅ **unique** |
| Pricing | 500–2,500 ฿/mo | 500–3,000 ฿/mo | TBD |

The three rows where we sit at "missing" are the **table-stakes** an
SME ops manager looks at first. Without them we're not in the same
shortlist as FlowAccount.

## 3. Positioning shift

**Old headline:** "ระบบ e-Tax Invoice ครบครัน — ส่ง RD อัตโนมัติ"

**New headline:** "บัญชี SME ผ่าน LINE — ถ่ายรูปสลิป AI ทำใบเสร็จให้
(+ e-Tax สำหรับธุรกิจที่ต้องการ)"

The e-Tax capability stays — it's a premium upsell. The LINE bot, the
PDPA story, and (soon) auto-bookkeeping become the lead.

## 4. Roadmap

### Phase 1 — Launch with early adopters (now)

Target: founders, freelancers, e-Tax-curious SMEs (~5–50 employees)
that want the LINE bot intake + e-Tax built in.

Already shipped:
- ✅ PDPA-compliant Privacy/ToS/DPA (TH+EN+ZH) + DSR endpoints + UI
- ✅ Multi-tenant cert storage (BYTEA + AES-256-GCM)
- ✅ S3 storage primacy (Drive optional)
- ✅ Master Sheet rebuild (audit-ready tabs + project rollup)
- ✅ LINE bot OCR pipeline
- ✅ Sentry + PII scrubber

### Phase 2 — Catch up to feature parity (3–6 months)

The three things that close the gap to FlowAccount/PEAK:

1. **Auto P&L + Balance Sheet**
   - Aggregate invoices (revenue) + purchase invoices (COGS) +
     expense vouchers (opex) per period
   - Render: monthly P&L, YTD P&L, quarter P&L
   - Balance sheet from AR (unpaid invoices) + AP (unpaid purchase
     invoices) + Bank cash (manual entry for v1)
   - **Highest-impact missing feature.** This is the one SMEs ask
     "where do I see my profit?" — every accountant tool answers it.

2. **Multi-user roles (accountant + viewer)**
   - Schema already has `User.role` with admin/accountant/viewer enum
   - Build: invite-by-email flow + permission gates (most routes
     currently treat admin as the only edit role; relax to accountant
     where appropriate)
   - UI: Workspace Settings → "Team" tab with invite + role change
   - **Why this matters:** the customer's external accountant needs
     access. Without it customers screenshot reports and email them.

3. **Bank reconciliation MVP**
   - Upload bank statement CSV (most Thai banks export)
   - Auto-match to unpaid Invoice + PurchaseInvoice + ExpenseVoucher
     by amount + date + party name
   - UI for manual link / unlink / "no match"
   - **Why MVP:** full reconciliation is a 6-month feature; the 80/20
     here is "show me which invoices are paid based on bank data."

### Phase 3 — Differentiate (6–12 months)

- Payroll module (ภงด.1 / สปส. / payslip PDF)
- Mobile app (when there's actual demand signal, not before)
- Public e-Tax verification widget (`/invoices/verify/:id` already
  exists — promote it for trust-building)
- API + Webhooks for ERP integrations (when first enterprise asks)

## 5. What NOT to do

- Don't lead marketing with "RD submission" — niche audience, gives
  the wrong first impression
- Don't ship features chasing every FlowAccount/PEAK feature — only
  the three in Phase 2 are table stakes
- Don't rebuild mobile app via Capacitor — wait for real demand
  (current MobileBottomNav handles responsive WEB just fine)
- Don't pursue Google verification before paying-customer count
  justifies the 2–6 week review wait (current Test User mode is fine
  for closed beta)

## 6. Open strategic questions

| Question | When to resolve |
|---|---|
| Pricing tiers (Free / Starter / Pro / Premium with e-Tax) | Before first paying customer |
| Should Phase 3 happen on Billboy or as separate "Billboy Payroll"? | After Phase 2 ships |
| Mobile app: native vs PWA? | When 10+ customers ask |
