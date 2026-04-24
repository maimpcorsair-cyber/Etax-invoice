---
description: Run TypeScript compiler check (no emit) on backend and frontend in parallel, summarize errors.
allowed-tools: Bash
---

Run the following two commands in **parallel** (single message with two Bash tool calls):

1. `cd "/Users/chuvit/Documents/E-tax invoice/backend" && npx tsc --noEmit 2>&1 | head -50`
2. `cd "/Users/chuvit/Documents/E-tax invoice/frontend" && npx tsc --noEmit 2>&1 | head -50`

Then report:
- ✅ Clean / ❌ errors per side
- If errors exist, show count + first 5 file:line with summary
- Do NOT start fixing — that's for the `ts-fixer` agent

Invoke the `ts-fixer` agent ONLY if the user asks to fix.
