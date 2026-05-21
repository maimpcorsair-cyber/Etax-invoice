# Domain Docs

Use this repo as a single-context product codebase.

## Read Order

1. `AI_HANDOFF.md` — agent entrypoint and update rules.
2. `PROJECT_STATE.md` — current deploy/runtime/product state.
3. `AGENTS.md` and `CLAUDE.md` — durable conventions, commands, tools, and gotchas.
4. Topic docs under `docs/`, especially `docs/state/PROJECT_HISTORY_2026-05.md` only when older history is needed.

## Domain Vocabulary

Use the project terms already present in `AGENTS.md` and `CLAUDE.md`: Thai e-Tax Invoice, ETDA ขมธอ. 3-2560, XAdES-BES, RFC 3161 TSA, Revenue Department submission, LINE/OCR intake, Google Drive/Sheets workspace, PDPA, and per-company certificate storage.

## ADRs

This repo does not currently maintain a formal `docs/adr/` directory. If a decision becomes durable enough to preserve, write a compact note under `docs/state/` or add a focused ADR directory later.
