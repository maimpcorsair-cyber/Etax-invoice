# Product

## Register

product

## Users

Three groups share one system, in a formal Thai business context where documents are submitted to the Revenue Department (กรมสรรพากร) and mistakes cost real money and time:

- **SME owners** — occasional users, often on mobile. They check the dashboard, approve documents, and want confidence that everything is in order without learning accounting jargon. Many find tax stressful.
- **Accountants / finance staff** — daily power users on desktop. They process batches, reconcile, and file. They want density, speed, and predictable affordances.
- **LINE-first operators** — owners, admins, and field staff who capture slips, bills, and delivery photos from their phone via LINE. They should not have to learn the web app before a document is captured.

## Product Purpose

Billboy is a multi-tenant SaaS for issuing Thai e-Tax invoices and running SME accounting: capture a document (LINE / web / PDF) → AI extracts and the user confirms → issue a tax-correct sales document → share a customer link with payment details → submit to the Revenue Department → see what is paid, unpaid, missing, and tax-safe. It also covers quotations, delivery notes, purchases/expenses, VAT (ภพ.30) and WHT, and payroll.

Success: the common SME loop (document/photo/chat → paid or tax-ready record) feels fast and safe, ideally under three minutes, with fewer corrections than competitors (FlowAccount, PEAK, Paypers).

## Brand Personality

**The Trusted Companion (ผู้ช่วยคู่ใจ).** A reassuring sidekick for a tax-stressed owner. Three words: **friendly · trustworthy · calm-in-control.** Warm, not corporate-cold; professional, not flashy or entertaining. The mascot and the soft, lived-in workspace exist to make a high-stakes task feel handled. Intelligence is shown through fewer corrections and clearer next steps, not through "AI" styling.

## Anti-references

- An austere Linear/Notion mono-surface. A navy/white "law-firm" redesign that stripped the mascot and wallpaper was explicitly rejected — **the personality is the brand.**
- A navy-and-gold fintech that reads like a bank.
- A purple/gradient SaaS startup; gradient text; glowing hero-metric dashboards.
- Generic SaaS marketing pages standing in for core product work.
- Engineering/tax-infra jargon (tenant, XAdES, BullMQ, webhook, worker, magic link) leaking into owner/customer UI.

## Design Principles

1. **Keep the personality.** Mascot + soft wallpaper + warmth are core identity. Polish and elevate; never strip for a "cleaner" minimal look.
2. **Next action always visible.** Show money state first (paid / unpaid / overdue / tax-safe); answer "what should I do now?" without digging.
3. **Trust under time pressure.** Every label, badge, and status is unambiguous; consistent affordances screen to screen.
4. **Bilingual as first-class.** Thai (Sarabun) and English both look deliberate, never an afterthought.
5. **Mobile-aware, desktop-first.** Owners glance on phones, accountants work on desktops; core flows keep the same primary action on both. Customer-facing surfaces are simpler than seller surfaces.

## Accessibility & Inclusion

- Body text meets WCAG AA contrast (≥4.5:1); secondary text stays at the documented `muted-ink`, never lighter "for elegance".
- Bilingual TH/EN throughout; Thai rendering (Sarabun) is primary and must stay legible at small sizes.
- Honor `prefers-reduced-motion`: the ambient mascot/wallpaper motion and entrance animations need a reduced/instant alternative.
- Touch targets and primary actions remain reachable on mobile; never amputate functionality, adapt it.
