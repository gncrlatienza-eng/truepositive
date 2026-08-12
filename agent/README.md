# TruePositive Agent (scripted stub)

`tp_agent.py` is a real, runnable stand-in for the agent process — per `docs/SPRINT_PLAN.md`, Sprint 3 allows "a scripted stub" instead of a fully packaged, per-platform installer. It genuinely registers with the backend and sends real heartbeats over HTTP.

**What it does:** registers with a one-time enrollment key (generated from the dashboard's onboarding step 2 or Settings → Sources → "Deploy agent"), then heartbeats every 30 seconds until stopped.

**What it does not do:** read or ship any log data. That's real collector work for a later sprint — this only proves the register/heartbeat lifecycle.

## Two ways to run it

**1. Double-click (Windows, no terminal, nothing to type, nothing else to download).** The dashboard's "Download agent for Windows" button downloads a single `tp_agent.exe`, already configured for that specific agent — its connection details are embedded directly in the file server-side (see `CONFIG_MARKER` in `tp_agent.py`), not a separate file you have to keep track of. Double-click it and it opens a small status window. No Python install needed; the interpreter is bundled into the `.exe`.

A standalone `agent_config.json` placed next to the `.exe` also works (checked as a fallback if no config is embedded) — useful if you're assembling a deployment by hand rather than through the dashboard.

**2. From a terminal, with explicit arguments** (Linux/macOS, or for scripting):
```bash
python tp_agent.py --url http://localhost:8000 --id <agent_id> --key <enrollment_key>
```
Requires Python 3.9+, stdlib only — no `pip install` needed to run the `.py` directly this way.

## Building the Windows `.exe`

The built binary (`agent/dist/tp_agent.exe`) is a local build artifact — gitignored, not committed. The backend reads it from a read-only bind mount (`agent/dist/` → `/app/agent_dist` in `docker-compose.yml`) at two endpoints:
- `GET /agents/download/windows` — the raw, unconfigured binary (no auth).
- `POST /agents/download/windows` (user JWT; body `{url, id, key}`) — the same binary with that agent's config appended, which is what the dashboard's download button actually calls.

Both 404 with a helpful message if the binary hasn't been built yet.

```bash
pip install pyinstaller
pyinstaller --onefile --noconsole --name tp_agent tp_agent.py
```

Produces `agent/dist/tp_agent.exe`. `tp_agent.spec` (tracked) records the exact build config for reproducibility. `pyinstaller` itself doesn't need to stay installed afterward — it's a one-time build tool, not a runtime dependency.

Only a Windows build exists today. Native installers for Linux/Docker/Kubernetes are a future release — those platforms use the terminal-args path above in the meantime.

## Roadmap

Real log collection, and packaged installers for other platforms, are future work beyond this sprint.
