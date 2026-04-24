---
description: Kill and restart the backend dev server (tsx watch on port 4000).
allowed-tools: Bash
---

Restart the backend in background mode.

```bash
# Kill any existing backend processes
pkill -f "tsx watch src/index.ts" 2>/dev/null
pkill -f "node dist/index.js" 2>/dev/null
sleep 1

# Start fresh
cd "/Users/chuvit/Documents/E-tax invoice/backend" && npm run dev > backend.out 2>&1 &
echo "Backend started, PID $!"
```

Start it with `run_in_background: true`.

Then wait ~4 seconds and probe health:
```bash
sleep 4 && curl -s http://localhost:4000/health
```

If `{"status":"ok"}` → ✅ restart succeeded.
If not → tail `backend.out` to show the startup error.
