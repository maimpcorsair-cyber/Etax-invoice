---
name: "source-command-restart-frontend"
description: "Kill and restart the frontend Vite dev server (port 3000)."
---

# source-command-restart-frontend

Use this skill when the user asks to run the migrated source command `restart-frontend`.

## Command Template

Restart the frontend in background mode.

```bash
pkill -f "vite" 2>/dev/null
sleep 1
cd "/Users/domdom/Documents/GitHub/Etax-invoice/frontend" && npm run dev > ../frontend.out 2>&1 &
echo "Frontend started, PID $!"
```

Run with `run_in_background: true`.

Then verify:
```bash
sleep 3 && curl -sI http://localhost:3000/ | head -1
```

Expected: `HTTP/1.1 200 OK`. If not, show last 30 lines of `frontend.out`.
