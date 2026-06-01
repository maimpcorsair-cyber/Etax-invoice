# Dashboard redesign — visual explorations

Static mockups of the Billboy Dashboard in 3 distinct directions, built to the
design direction in [`.impeccable.md`](../../.impeccable.md) (Light · Navy
authoritative · density over decoration · no AI-slop). Real Billboy content and
numbers — not generic filler.

**Purpose:** pick ONE direction → it becomes the design system (tokens +
component primitives) → roll out page by page. Do **not** big-bang the whole app.

| File | Direction | Character | Fonts |
|------|-----------|-----------|-------|
| `A-statement.html` | **Statement / งบการเงิน** | Editorial-formal. Hairline ledger rules, serif tabular figures, no cards. Feels like a bank statement / law-firm letterhead. | Anuphan + Spectral |
| `B-console.html` | **Console** | Operational density for the accountant. Navy rail, compact KPI strip, worklist-as-table with status chips. Linear/Notion energy. | Anuphan + Archivo |
| `C-quiet.html` | **Quiet / owner glance** | Calm and spacious for the SME owner on mobile. One focal action, few big figures, soft to-do list. | Anuphan only |

PNG previews alongside each file.

## View locally
```bash
cd design/dashboard-explorations && python3 -m http.server 8899
# open http://localhost:8899/A-statement.html (B, C)
```
(Google Fonts load over network — needs internet for the intended typefaces.)
