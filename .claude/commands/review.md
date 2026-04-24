---
description: Send recent changes to the code-reviewer agent for an independent second-pass review.
allowed-tools: Bash, Agent
argument-hint: "[optional: file path to focus review on, else reviews all uncommitted changes]"
---

Request a code review.

First, gather the diff context:
```bash
cd "/Users/chuvit/Documents/E-tax invoice"
git status
git diff --stat HEAD 2>/dev/null || echo "(no git or no changes)"
git diff HEAD 2>/dev/null | head -300
```

Then invoke the `code-reviewer` subagent with a prompt like:

> Review the uncommitted changes in the repo at `/Users/chuvit/Documents/E-tax invoice`.
> Context: this is a Thai e-Tax Invoice system (ETDA ขมธอ.3-2560 compliant). Recent work added XAdES-BES signing + RFC 3161 TSA + RD API submission + payment tracking.
> Focus areas: security of cert/key handling, tenant scoping by companyId, XML signing correctness, TypeScript safety.
> Give findings with file:line and severity (🔴/🟠/🟡/🟢), ending with APPROVE / APPROVE WITH CHANGES / REQUEST CHANGES / BLOCK.

If `$ARGUMENTS` specified a file, restrict the review to that file and its direct dependencies.

Report the agent's findings back to the user with any blockers highlighted.
