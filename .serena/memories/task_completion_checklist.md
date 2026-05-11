# Task Completion Checklist

For code changes:
- Run relevant typechecks/builds. Common baseline: backend `npm run build` and frontend `npm run build` when both sides changed.
- Run `git diff --check`.
- If schema changed, include migration and ensure Prisma client generation/build passes.
- For production-facing fixes, push to `main`, watch GitHub Actions Typecheck/Deploy to Render, and verify production endpoints/UI chunks as appropriate.
- Update `PROJECT_STATE.md` when deploy status, schema/database state, LINE/OCR behavior, Google Drive/Sheets behavior, or important risks changed.
- Do not stage unrelated local files, especially `.claude/settings.local.json`.
- Final response should summarize what changed, what was verified, and any remaining blocker/risk in concise Thai for this user.