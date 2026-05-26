---
name: "source-command-logs"
description: "Tail backend logs, optionally filtered by a pattern."
---

# source-command-logs

Use this skill when the user asks to run the migrated source command `logs`.

## Command Template

Show recent backend activity:

```bash
tail -50 "/Users/domdom/Documents/GitHub/Etax-invoice/backend.out"
```

If the user provides a filter pattern:

```bash
tail -200 "/Users/domdom/Documents/GitHub/Etax-invoice/backend.out" | grep -i "$ARGUMENTS" | tail -30
```

Also check the Winston log file if it exists:

```bash
ls "/Users/domdom/Documents/GitHub/Etax-invoice/backend/logs/" 2>/dev/null
tail -30 "/Users/domdom/Documents/GitHub/Etax-invoice/backend/logs/combined.log" 2>/dev/null
```

Summarize standout errors, warnings, RD submission activity, signing activity, and recent startup failures.
