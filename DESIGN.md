---
name: Billboy
description: Thai e-Tax invoicing and accounting for SMEs — a trusted companion that turns documents into tax-ready records.
colors:
  navy: "#1e3a8a"          # brand primary (primary-700) — authority, primary actions
  navy-deep: "#172f70"     # primary-800 — hover / pressed primary
  navy-mid: "#244aa8"      # primary-600
  navy-bright: "#335fd4"   # primary-500
  navy-wash: "#eef4ff"     # primary-50 — tinted surfaces, badge bg
  teal: "#2dd4bf"          # brand warmth, used in wallpaper glow + accents
  gold: "#c9a84c"          # brand warmth accent (thai.gold), hero orb
  emerald: "#059669"       # accent — positive / paid / success actions
  green: "#22c55e"         # secondary
  ink: "#212a3a"           # body text (oklch 0.22 0.035 255)
  muted-ink: "#5b6678"     # secondary text (oklch 0.48 0.035 255)
  surface-page: "#f1f4f8"  # app body base (oklch 0.974 0.01 252)
  surface-card: "#fdfdfe"  # card surface (oklch 0.995 0.004 252)
  thai-red: "#a51c30"
  thai-blue: "#003087"
  status-success: "#10b981"
  status-warning: "#f59e0b"
  status-danger: "#ef4444"
  status-info: "#3b82f6"
typography:
  display:
    fontFamily: "Sarabun, Inter, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"   # h1: text-3xl → text-4xl
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Sarabun, Inter, system-ui, sans-serif"
    fontSize: "1.5rem"        # h2: text-2xl → text-3xl
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Sarabun, Inter, system-ui, sans-serif"
    fontSize: "1.125rem"      # h3 / card titles
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Sarabun, Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"     # 15px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Sarabun, Inter, system-ui, sans-serif"
    fontSize: "0.75rem"       # 12px — uppercase eyebrows, badges
    fontWeight: 700
    letterSpacing: "0.12em"
rounded:
  md: "12px"        # inputs, buttons (rounded-xl)
  lg: "16px"
  card: "18px"      # --radius-card, the default card/panel radius
  hero: "24px"      # premium-hero, command-center surfaces
  pill: "9999px"    # badges, mascot doodle rings, icon chips
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.navy-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  input-field:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  badge-primary:
    backgroundColor: "{colors.navy-wash}"
    textColor: "{colors.navy-deep}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-success:
    backgroundColor: "#d1fae5"
    textColor: "#065f46"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-warning:
    backgroundColor: "#fef3c7"
    textColor: "#92400e"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Billboy — DESIGN.md

> Creative North Star: **The Trusted Companion (ผู้ช่วยคู่ใจ)** — Billboy is the reassuring sidekick for a Thai SME owner who finds tax and accounting stressful. The mascot and the soft, lived-in workspace exist to make a high-stakes task (documents that go to กรมสรรพากร) feel calm and handled, not clinical.

## Overview

Billboy serves three users on one system: SME owners (occasional, often mobile, want confidence), accountants (daily power users, want density and speed), and LINE-first operators (capture slips/bills from their phone). The interface must stay trustworthy under time pressure while feeling warm, not corporate-cold.

The system pairs **navy authority** with **teal + gold warmth** on a light, softly-decorated surface. Color is OKLCH at the source; brand tokens live in `frontend/src/index.css` (`--brand-navy: oklch(0.34 0.12 261)`, `--brand-teal: oklch(0.63 0.12 183)`, `--brand-gold: oklch(0.78 0.12 82)`) with the Tailwind ramp in `frontend/tailwind.config.mjs`. Hex in the frontmatter above is the sRGB-rounded reference for Stitch compatibility; treat OKLCH as canonical.

**The signature feel is decorative, and that is intentional.** The app shell carries a soft wallpaper (teal + navy radial glows, a faint masked navy grid, and low-opacity floating **mascot doodles** + glassy icon chips). The hero/command surfaces use a brighter gradient with a blurred gold orb and a mascot panel. This personality is the brand — see Do's and Don'ts.

- Theme: **light** (daytime office use, formal submissions).
- Bilingual TH/EN is first-class. Primary type is **Sarabun** (Thai), with Inter for Latin and Noto Sans SC for Chinese.
- Layout is structural-responsive (collapsing nav, responsive tables), not fluid-typographic. Mobile keeps the same primary action as desktop with less chrome.
- Motion is gentle and ambient: `float` / `doodleFloat` / `doodleDrift` for background life, `fadeIn` / `slideUp` for entrances. Honor `prefers-reduced-motion`.

Anti-references: not a navy-and-gold fintech that reads as a bank; not an austere Linear/Notion mono-surface (a redesign in that direction was rejected for stripping the mascot and wallpaper); not a purple/gradient SaaS startup.

## Colors

Strategy: **Restrained-plus** — tinted near-white surfaces, navy as the single primary accent for actions and selection, with teal and gold reserved for brand warmth (wallpaper glows, hero orbs, eyebrows), not for functional UI state.

- **Navy** (`navy` #1e3a8a and ramp): primary buttons, links, active nav, focus rings, key figures. `navy-deep` is hover/pressed. `navy-wash` tints info surfaces and primary badges.
- **Teal** (#2dd4bf) and **Gold** (#c9a84c): brand warmth only — radial wallpaper glows, the hero gold orb, premium accents. Do not use them as primary action or status colors.
- **Emerald / Green** (#059669 / #22c55e): positive/paid/success affordances.
- **Neutrals**: `surface-page` (app body) sits slightly cooler-tinted; `surface-card` is near-white; `ink` (#212a3a) is body text; `muted-ink` (#5b6678) is secondary text. Both ink values clear 4.5:1 on the light surfaces — keep secondary text at `muted-ink`, never lighter.
- **Status**: success #10b981, warning #f59e0b, danger #ef4444, info #3b82f6. Thai-red / thai-blue are reserved for official/government contexts.

## Typography

One workhorse family (**Sarabun**) carries headings, body, labels, and data; Inter is the Latin fallback inside the same stack. No display face — product clarity over flourish. Hierarchy comes from weight (400 body, 600 headings, 700 labels) and a modest scale.

- `display` (h1): clamp(1.875rem → 2.25rem), 600, tight tracking, `text-wrap: balance` on headings.
- `headline` (h2) 1.5rem / `title` (h3) 1.125rem — both 600.
- `body`: 15px, 400, line-height 1.6; cap prose at 65–75ch.
- `label`: 12px, 700, uppercase, 0.12em tracking — reserved for short eyebrows and badges, never body copy.

## Elevation

Soft, layered, lived-in — not flat, not heavy. Shadows are ambient (depth and warmth) more than structural.

- `card`: `0 1px 3px rgba(0,0,0,0.05)` resting → `shadow-soft` (`0 16px 48px rgba(15,23,42,0.09)`) on hover. `card-hover` lifts with a -4px translate.
- Buttons carry a tinted navy shadow (`0 4px 12px rgba(30,58,138,0.22)`) and lift -2px on hover.
- Hero/command surfaces (`premium-hero`, radius 24px) layer radial gradients + a blurred gold orb behind content.
- Focus ring: `0 0 0 3px rgba(30,58,138,0.1)` (the `glow` token).
- The wallpaper is its own ambient layer behind everything (`.app-shell` + `.product-doodle-field`), below content z-index, `pointer-events: none`.

## Components

All interactive components share one vocabulary; ship every state (default, hover, focus, active, disabled, loading). Skeletons for loading, teaching empty states (not "nothing here").

- **Buttons**: `btn-primary` (navy fill, white, radius 12px, lifts on hover), `btn-secondary` (white, slate border, navy text on hover), `btn-ghost`, `btn-danger`, `btn-success`. Labels are verb + object ("สร้างเอกสารขาย", "Save changes").
- **Cards** (`.card`): near-white gradient surface, 18px radius, soft shadow, hover lift. Never nest cards in cards.
- **Inputs** (`.input-field`): white, slate border, 12px radius, navy focus border + glow ring; disabled is muted at 60% opacity.
- **Badges** (`.badge-*`): pill, full border + tinted bg, used for document/status states (draft, paid, overdue, rejected). Status color carries meaning.
- **Tables**: `.table-header` (uppercase, tracked, tinted bg) + `.table-cell` (hairline bottom border, hover row tint). Density is welcome for accountant surfaces.
- **Alerts** (`.alert-*`): full border + tinted bg + icon. Never a side-stripe border.
- **PageHeader / Command Center**: page intro with eyebrow, title, description, actions, and an optional `mascot="hero"` panel.
- **MascotHelperCard**: a friendly helper surface featuring the Billboy mascot for tips/guidance.

## Do's and Don'ts

**Do**
- **Keep the personality. The mascot (`public/brand/billoy-hero-mascot.jpg`, `MascotHelperCard`, `PageHeader mascot="hero"`, the floating `.product-doodle-mascot-*`) and the soft wallpaper (`.app-shell` glows + masked grid, `.product-doodle-field`) are core brand identity, not decoration to optimize away.** A redesign that strips them to a flat navy/white "law-firm" surface was explicitly rejected. Polish and elevate; never strip.
- Pair navy authority with teal/gold warmth. Carry warmth in accents, wallpaper, and the mascot — not by washing the whole surface one color.
- Treat Thai and English as equally deliberate; Sarabun first.
- Make the next action obvious; show money state (paid / unpaid / overdue / tax-safe) before detail.
- Keep customer-facing surfaces (public invoice links, portal) simpler than seller surfaces.

**Don't**
- Don't strip the mascot or wallpaper for a "cleaner" minimal look. Warmth is the brand.
- Don't use teal or gold as functional status/action colors; navy is the action color, status colors carry state.
- Don't leak infra or tax-infra jargon (tenant, XAdES, BullMQ, webhook, worker, magic link) into owner/customer UI.
- Don't use purple/gradient SaaS styling, gradient text, or side-stripe borders.
- Don't drop secondary text below `muted-ink`; "light gray for elegance" fails contrast.
- Don't nest cards, or reinvent standard form controls for flavor.
