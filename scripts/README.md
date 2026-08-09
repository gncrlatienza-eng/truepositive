# Scripts

| Script | Purpose |
|---|---|
| `setup.sh` | macOS/Linux: warns if `.env` is missing (see root README's Environment Variables section), installs backend (venv + pip) and frontend (npm) dependencies |
| `setup.ps1` | Windows PowerShell equivalent of `setup.sh` |

Run once after cloning, before your first `docker-compose up` or standalone `npm run dev` / `uvicorn` run. Neither script creates or copies a `.env` file — no `.env.example` is committed to this repo, so you create `.env` yourself.
