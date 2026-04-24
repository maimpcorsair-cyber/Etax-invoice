# Claude Code Tools — e-Tax Invoice Project

ภาพรวมของ agents, skills, commands, และ MCP servers ทั้งหมดที่ติดตั้งไว้ในโปรเจกต์นี้

---

## 🤖 Team Agents (`.claude/agents/`)

| Agent | เรียกเมื่อ | Model |
|-------|-----------|-------|
| `etax-specialist` | Thai e-Tax domain — ETDA schema, XAdES, RD API, T01-T05 | sonnet |
| `cert-manager` | X.509 / PKCS#12 / signing errors | sonnet |
| `prisma-db` | Prisma schema, migrations, raw SQL | sonnet |
| `backend-dev` | Express routes, BullMQ workers, services | sonnet |
| `frontend-dev` | React + Tailwind + Zustand frontend | sonnet |
| `ts-fixer` | TypeScript error resolution | sonnet |
| `api-tester` | curl HTTP integration testing | sonnet |
| `code-reviewer` | Security + compliance review | sonnet |
| `refactor-assistant` | Untangle spaghetti code — no behavior change | sonnet |

---

## ⌘ Slash Commands (`.claude/commands/`)

| Command | Purpose |
|---------|---------|
| `/typecheck` | tsc --noEmit on backend + frontend in parallel |
| `/gen-cert` | Regenerate dev .p12 certificate |
| `/sign-test` | Full XAdES-BES + TSA signing pipeline test |
| `/restart-backend` | Kill + restart tsx watch (port 4000) |
| `/restart-frontend` | Kill + restart Vite (port 3000) |
| `/health` | Probe backend + frontend + postgres + redis |
| `/db-shell "SQL"` | psql against `etax_invoice` db |
| `/logs [pattern]` | Tail backend logs |
| `/rd-submit <invId>` | Queue invoice for RD submission |
| `/migrate [name]` | Prisma migrate + generate + sync backend client |
| `/review [file]` | Invoke code-reviewer on uncommitted changes |

---

## 🧩 Skills (`.claude/skills/`)

Official Anthropic skills auto-discovered by Claude Code:

| Skill | When Claude uses it |
|-------|--------------------|
| `pdf/` | Read/write/split/merge/extract PDFs — **useful for reading RD regulation PDFs, filling invoice form templates, extracting text from scanned receipts** |
| `xlsx/` | Create/edit Excel spreadsheets — **critical for Thai accountants who bulk-import invoices via .xlsx, or export monthly VAT reports** |
| `docx/` | Create/edit Word documents — for contracts, letters to customers, formal reports |
| `skill-creator/` | Meta-skill: create new skills tailored to this project |
| `brand-guidelines/` | Apply consistent brand identity to UI artifacts |

### Impeccable design system (from [impeccable.style](https://impeccable.style))

18 design-focused skills that teach Claude good taste for frontend code — detects and fixes the "AI monoculture" style (purple gradients, nested cards, poor contrast, overused fonts, etc.):

| Skill | When Claude uses it |
|-------|--------------------|
| `impeccable/` | Master command — apply all design principles to current UI |
| `critique/` | Evaluate a page/component for UX quality with scoring |
| `polish/` | Final-pass refinements to a finished UI |
| `harden/` | Accessibility + contrast + keyboard nav improvements |
| `clarify/` | Simplify confusing UX, improve information hierarchy |
| `distill/` | Reduce visual noise, strip decoration |
| `layout/` | Fix spacing, alignment, grid structure |
| `typeset/` | Typography — sizes, weights, line-heights, font pairing |
| `colorize/` | Color system — theme, contrast, semantic color usage |
| `shape/` | Border-radius, card shapes, container structure |
| `bolder/` | Add visual weight and confidence |
| `quieter/` | Tone down aggressive styling |
| `delight/` | Add tasteful micro-interactions |
| `animate/` | Motion design — transitions and animations |
| `adapt/` | Responsive design across viewports |
| `optimize/` | Performance — render speed, CLS, paint |
| `overdrive/` | Push a design toward its bolder, more intentional version |
| `audit/` | Comprehensive design audit with anti-pattern detection |

**Usage**: Just ask — "polish the Login page" or "critique the InvoiceBuilder UX" or "run audit on AdminPanel". Claude picks the matching skill.

**Location convention**: Each skill is `.claude/skills/<name>/SKILL.md` with optional `scripts/`, `templates/`, `examples/` subdirs. Claude auto-discovers — no registration needed.

### Adding more skills

Use `skill-creator` or just:
```bash
mkdir .claude/skills/my-new-skill
# Write SKILL.md with YAML frontmatter (name, description)
```

Then Claude picks it up on next turn.

---

## 🔌 MCP Servers (`.mcp.json`)

Project-scoped MCP servers — shared with the team via git. Two work out-of-the-box, two require API keys.

### ✅ No-auth (active immediately)

**Context7** (`@upstash/context7-mcp`)
- Up-to-date library documentation for any framework
- Example: "look up the Prisma raw query syntax using Context7" → returns current docs, not stale training data
- Critical for: Prisma, node-forge, Express, BullMQ, xmldsig libs

**Playwright MCP** (`@playwright/mcp`)
- Browser automation for E2E testing of the React UI
- Example: "use Playwright to fill out the Invoice Builder and click Save; screenshot the result"
- Critical for: regression testing the Invoice Builder / Login / AdminPanel flows

### 🔑 Opt-in (needs API key — skip if not needed)

**Tavily** (`tavily-mcp`) — AI-optimized web search
- Best for: researching Thai RD announcements, ETDA updates, TDID cert providers
- Get free API key: <https://tavily.com> (1000 searches/month free)
- Set `TAVILY_API_KEY` in environment:
  ```bash
  echo 'export TAVILY_API_KEY="tvly-..."' >> ~/.zshrc
  ```

**Firecrawl** (`firecrawl-mcp`) — web scraping + markdown conversion
- Best for: scraping RD sandbox docs, ETDA PDFs, Thai accounting blogs for reference
- Get free API key: <https://firecrawl.dev> (500 pages/month free)
- Set `FIRECRAWL_API_KEY` in environment

### Disabling a server

If you don't want Tavily/Firecrawl loaded at all, remove its entry from `.mcp.json`. Claude Code won't try to start a server that isn't listed.

### Verifying MCP servers loaded

In any Claude Code session, type `/mcp` to see live status of all configured servers.

---

## 🛠 Recommended companion tools (not installed, but worth knowing)

These are from the tools survey — useful but not strictly required:

| Tool | Why you might want it |
|------|----------------------|
| **Superpowers** (obra/superpowers) | General-purpose Claude Code productivity agents — install if you find the ones here insufficient |
| **claude-squad** | Orchestrate multiple agents in parallel — useful when you want e.g. backend-dev + frontend-dev working on the same feature simultaneously |
| **promptfoo** | Test and evaluate LLM prompts — useful when tuning the `etax-specialist` system prompt |
| **n8n** | Visual workflow automation — useful for scheduling monthly VAT report generation, cron-triggered RD status polling |
| **Remotion** | Programmatic video creation — useful for generating tutorial videos for end users |
| **container-use** (dagger) | Isolated dev environments per agent session — useful for safe migrations / risky refactors |

Not installed to keep the stack lean. Install on demand.

---

## Skill coverage vs. e-Tax tasks

| Task | Best-fit tool |
|------|--------------|
| "Import 500 customers from an Excel file" | `xlsx` skill + `backend-dev` agent |
| "Read the ETDA spec PDF and tell me what T03 requires" | `pdf` skill + `etax-specialist` agent |
| "Test the Invoice Builder UI end-to-end" | `playwright` MCP + `frontend-dev` agent |
| "Generate a contract DOCX template for a customer" | `docx` skill |
| "What's the latest RD announcement for 2026?" | `tavily` MCP + `etax-specialist` agent |
| "Look up how to properly c14n XML in Node" | `context7` MCP + `etax-specialist` agent |
| "Fix this TypeScript error" | `ts-fixer` agent |
| "Review this PR before I commit" | `/review` command → `code-reviewer` agent |
| "Apply brand colors to the Login page" | `brand-guidelines` skill + `frontend-dev` agent |
| "Create a new skill for monthly VAT reporting" | `skill-creator` skill |
| "This component is spaghetti — clean it up" | `refactor-assistant` agent |
| "Polish the Invoice Builder UI" | `polish` skill (Impeccable) + `frontend-dev` |
| "Is our AdminPanel UX any good?" | `critique` skill (Impeccable) |
| "Audit whole frontend for design anti-patterns" | `audit` skill (Impeccable) |
| "Make the Login page more accessible" | `harden` skill (Impeccable) |
| "Our UI feels noisy" | `distill` or `quieter` skill (Impeccable) |
