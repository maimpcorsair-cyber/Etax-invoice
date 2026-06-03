# Handoff — Dashboard redesign ("The Ledger Banner")

Pick-up doc for the next agent (Codex). Goal: redesign `frontend/src/pages/Dashboard.tsx`
so it stops feeling "amateur / AI-made". Direction is locked; just build it.

## Read first
- `PRODUCT.md` (users, brand, anti-references) + `DESIGN.md` (tokens) — non-negotiable.
- `frontend/src/pages/Dashboard.tsx` (the screen, ~1180 lines) and its building blocks:
  `components/ui/AppChrome` (`MetricCard`, `PageHeader`, `MascotHelperCard`),
  `components/dashboard/DashboardCharts.tsx` (Recharts, already brand-themed).
- `PROJECT_STATE.md` for latest deploy state.

## Root cause of "amateur / AI" (already diagnosed — don't re-audit)
NOT token-level slop (detector clean except 3 minor gray-on-amber). It's **composition**:
card-soup (everything equal rounded gray cards), THREE overlapping metric-card rows
(~15 stat cards), flat Sarabun hierarchy (all headings same size/weight), brand color
present but not driving hierarchy, no single focal point. Nielsen ~28/40.

## Locked direction: "The Ledger Banner"
Treat the dashboard as **a bank statement + an accountant's worklist**, wrapped in
Billboy's warmth (mascot + soft wallpaper STAY — austere redesign was rejected).

1. **Hero Money Banner** (top, full-width navy `premium-hero` band): ONE dominant figure
   in 32–40px Sarabun `tabular-nums` = ยอดต้องตามเก็บ (overdue + outstanding AR). Two small
   subordinate inline stats below (รายได้เดือนนี้, ภาษีสุทธิ). Mascot + greeting + the two
   primary buttons (AI Inbox / สร้างเอกสารขาย) on the right. Thin gold rule under the number.
2. **Consolidate the 3 metric rows → ONE worklist strip (4–5 items).** Neutral white tiles,
   NO tinted card backgrounds. Each: small navy icon chip + count (tabular-nums) + one-line
   label + a single status dot/pill (red overdue / amber needs-review / green clear). Delete
   the 6-card row + 4-card "Stats" row; fold their numbers into the banner / table header.
3. **Two-column body (12-col grid):** left 8 = work column (Recent invoices table promoted
   to top + AR aging chart strip above it, dense, tabular-nums); right 4 = context rail
   (Autopilot lanes vertical, MascotHelperCard isolated as THE helper, VAT readiness, then
   Drive workspace + RD panel as collapsed `<details>` at the bottom).
4. **Color, working:** navy LEADS (banner, buttons, primary numbers, table header tint);
   teal = automation accent only (autopilot eyebrow/lanes); gold = hero orb + the one rule;
   status red/amber/green = the ONLY saturated color in the data area, on dots/pills/numbers,
   never as card fills.
5. **Type scale:** hero `clamp(2rem,4vw,2.5rem)/700/tabular-nums`; section titles firm
   `1.125–1.25rem/700`; dense table `0.8125–0.875rem/500 tabular-nums`; eyebrows 12px/700.
   The size JUMP between hero and rest is what reads as "designed".
6. **Mascot stays** but concentrated: hero banner + the one helper card + empty states only.

## Priority
- **P0:** hero Money Banner (one big tabular-nums figure) · delete the 2 lower metric rows
  (fold into banner/table) · remove tinted card backgrounds → neutral tiles + status dots.
- **P1:** 8-col work column (table promoted + AR strip) / 4-col context rail · move autopilot
  + mascot helper + VAT into rail, demote Drive + RD to collapsed accordions · widen Sarabun
  scale + `tabular-nums` everywhere.
- **P2:** gold rule + teal automation discipline · fix gray-on-amber / `text-gray-500` vs the
  `muted-ink` contrast floor · optional table density toggle · `prefers-reduced-motion` for
  banner orb/mascot drift.

## Data already available on the page (no new API needed)
`stats` has: `receivables.{totalOutstanding,overdueOutstanding,currentOutstanding,aging.*}`,
`monthlyRevenue[]`, `rdPendingCount`, etc. Marketplace donut data via
`/api/marketplace/settlements/summary` (already fetched into `mpChannels`). Charts component
exists and works.

## Already done this session (don't redo)
- Recharts installed; `DashboardCharts.tsx` (revenue area / AR aging bar / marketplace donut).
- Decluttered: removed e-Tax banner, duplicate AR aging buckets, Connection-status panel,
  redundant RD alert; RD compliance panel collapsed to `<details>`; added Finance Overview +
  Marketplace links to Quick Actions. Last commit on main: `163cef8`.

## Verify locally (stack is Docker-based; daemon may be off)
```
open -a Docker            # if daemon down; wait ~10s
docker compose up -d postgres redis
cd backend && npx prisma db push --skip-generate   # if local schema stale
npm run db:seed           # seeds admin@siamtech.co.th/Admin@123456 (super_admin→ops)
                          #   + accountant@siamtech.co.th/Account@123456 (tenant→/app)
npm run dev               # backend :4000
cd ../frontend && npm run dev   # :3000  → login at http://app.localhost:3000/login as accountant
```
Then: `cd frontend && npx tsc --noEmit && npx vite build`. Screenshot `/app/dashboard` and
review against this memo. Seed tenant (company-demo-001) has real data (revenue 2024-25, AR,
shopee/lazada settlements) for representative charts.

## Deploy
Frontend = Vercel auto-deploy on push to main. Backend (Render) only if backend changes;
this is frontend-only. After push, `gh workflow run render-deploy.yml --ref main` is the
backend migrate+deploy path (not needed here). CI: typecheck / unit / prod-smoke.

## Design constraints (hard)
Keep mascot + soft wallpaper (no austere). Bilingual TH/EN first-class (Sarabun). Money state
first, next-action visible. No tinted-card-fill rainbows. Build to production quality; verify
in browser, not just build.
