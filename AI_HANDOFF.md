# AI Handoff

Use this file as the first stop for Codex, Claude, and other AI agents working in this repo.

## Read Order

1. Read `PROJECT_STATE.md` for the latest deploy/runtime/work-in-progress snapshot.
2. Read `AGENTS.md` for durable repo rules, stack, conventions, and task hygiene.
3. Read only the topic-specific docs you need for the current task.
4. Open `docs/state/PROJECT_HISTORY_2026-05.md` only when you need older deploy history or a detailed prior decision trail.

## Token-Saving Rule

- `PROJECT_STATE.md` is the current snapshot, not a full project diary.
- Keep current status short enough to read every session.
- Put verbose history, long deploy notes, old run IDs, and detailed investigations in `docs/state/` or topic docs.
- Link to archives instead of copying long content into current handoff files.

## What Must Stay Current

- Production URLs and latest verified deploy status.
- Latest meaningful frontend/backend/worker commit or run ID.
- Known dirty local state that should not be committed.
- Active risks and next best actions.
- Fast verification commands.

## Update Rule For Agents

Before the final reply, update `PROJECT_STATE.md` when work changes:

- production or deploy status
- schema/database/migration state
- CLI/tooling state
- LINE/OCR/Google Drive behavior
- important risks, blockers, or next verification steps

If the update is long, add the detail to `docs/state/PROJECT_HISTORY_2026-05.md` or a topic-specific doc and keep `PROJECT_STATE.md` as a compact summary.

## Current Important Archive

- May 2026 historical state: `docs/state/PROJECT_HISTORY_2026-05.md`
