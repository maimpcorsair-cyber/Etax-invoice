# Codex / Claude Tool Parity

Last verified: 2026-05-27

This repo is designed so Codex and Claude can hand work back and forth in VS Code without losing context.

## Shared Starting Point

Every agent should start with:

1. `AI_HANDOFF.md`
2. `PROJECT_STATE.md`
3. `AGENTS.md` / `CLAUDE.md`
4. This file when the question is about tools, skills, MCP, or handoff quality

## Skills

Current parity:

- `.agents/skills/` — 59 skills
- `.claude/skills/` — 59 skills
- Missing on either side: none at last verification

Skill groups now available to both workflows:

- Impeccable design skills: `critique`, `polish`, `harden`, `clarify`, `distill`, `layout`, `typeset`, `colorize`, `shape`, `bolder`, `quieter`, `delight`, `animate`, `adapt`, `optimize`, `overdrive`, `audit`, `impeccable`
- Karpathy: `karpathy-guidelines`
- Matt Pocock engineering/productivity: `diagnose`, `tdd`, `to-prd`, `to-issues`, `triage`, `zoom-out`, `prototype`, `improve-codebase-architecture`, `grill-me`, `handoff`, `review`, `setup-pre-commit`
- Project source-command skills: `source-command-typecheck`, `source-command-health`, `source-command-migrate`, `source-command-logs`, `source-command-sign-test`, `source-command-rd-submit`, restart helpers

When adding a new project skill, add it to `.agents/skills/` and mirror it to `.claude/skills/`.

## Commands

Current parity:

- `.claude/commands/` — 11 slash command docs
- `.codex/commands/` — 11 mirrored command docs

Commands:

- `/typecheck`
- `/gen-cert`
- `/sign-test`
- `/restart-backend`
- `/restart-frontend`
- `/health`
- `/db-shell "SQL"`
- `/logs [pattern]`
- `/rd-submit <invoiceId>`
- `/migrate [name]`
- `/review [file]`

## Agents

Claude agents live in `.claude/agents/*.md`.

Codex agent definitions live in `.codex/agents/*.toml`.

Keep the agent roster aligned:

- `etax-specialist`
- `cert-manager`
- `prisma-db`
- `backend-dev`
- `frontend-dev`
- `ts-fixer`
- `api-tester`
- `code-reviewer`
- `refactor-assistant`

## MCP

Project-scoped MCP config lives in `.mcp.json`.

Configured servers:

- `context7`
- `playwright`
- `tavily`
- `firecrawl`
- `sequential-thinking`
- `memory`
- `sentry`

Runtime note:

- Claude should use `/mcp` to see what actually started.
- Codex tool availability is session-dependent. In the 2026-05-27 check, Codex had `context7`, `playwright`, `sequential-thinking`, `memory`, `sentry`, `tavily`, and user-level Serena tools. `firecrawl` was configured but not exposed as a callable Codex tool in that session.
- `tavily` needs `TAVILY_API_KEY`.
- `firecrawl` needs `FIRECRAWL_API_KEY`.
- Serena is configured at the user level for Codex, not in `.mcp.json`.
- Do not assume a Postgres MCP is available unless the current session exposes one. Use `source-command-db-shell` or `psql`-based project commands when Postgres MCP is absent.

## CLI

Local CLI commands verified on 2026-05-27:

- `codex`
- `claude`
- `gh`
- `vercel`
- `render`
- `serena`
- `node`
- `npm`
- `rg`

Render CLI was installed but not logged in from the shell during the check. GitHub Actions deployment still works through repo secrets.

## Verification Commands

```bash
find .agents/skills -maxdepth 2 -name SKILL.md | wc -l
find .claude/skills -maxdepth 2 -name SKILL.md | wc -l
find .claude/commands -maxdepth 1 -type f | wc -l
find .codex/commands -maxdepth 1 -type f | wc -l
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('.mcp.json','utf8')); console.log(Object.keys(j.mcpServers || {}))"
git status --short
```
