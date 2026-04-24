---
description: Tail the backend log file with optional grep filter.
allowed-tools: Bash
argument-hint: "[optional grep pattern, e.g. 'error' or 'rd-submit']"
---

Show recent backend activity.

If no argument:
```bash
tail -50 "/Users/chuvit/Documents/E-tax invoice/backend.out"
```

If argument provided, filter:
```bash
tail -200 "/Users/chuvit/Documents/E-tax invoice/backend.out" | grep -i "$ARGUMENTS" | tail -30
```

Also check the Winston log file if it exists:
```bash
ls "/Users/chuvit/Documents/E-tax invoice/backend/logs/" 2>/dev/null && \
  tail -30 "/Users/chuvit/Documents/E-tax invoice/backend/logs/combined.log" 2>/dev/null
```

Summarize: any errors/warnings stand out? Any recent RD/signing activity?
