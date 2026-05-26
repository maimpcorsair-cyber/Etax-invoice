---
name: "source-command-review"
description: "Review recent local changes with a code-review stance or code-reviewer agent."
---

# source-command-review

Use this skill when the user asks to run the migrated source command `review`.

## Command Template

First gather the local diff context:

```bash
cd "/Users/domdom/Documents/GitHub/Etax-invoice"
git status --short
git diff --stat HEAD 2>/dev/null || echo "(no git or no changes)"
git diff HEAD 2>/dev/null | head -300
```

Then review with this focus:

- Thai e-Tax correctness: ETDA XML, XAdES-BES, RFC 3161 TSA, RD submission
- tenant scoping: always derive `companyId` from auth context
- certificate and private key handling
- TypeScript safety and Prisma migration risk
- frontend user-flow regressions for billing, invoice, LINE/OCR, and admin pages

If subagents are available and the user explicitly asked for agent/delegated review, invoke `code-reviewer`. Otherwise, perform the review directly in the current agent and lead with findings ordered by severity.

If `$ARGUMENTS` names a file, restrict the review to that file and direct dependencies.
