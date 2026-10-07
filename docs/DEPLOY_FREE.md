# Free deployment: Supabase + Render + Vercel

| Piece | Host | What it runs |
|---|---|---|
| Database | Supabase (free) | Postgres |
| Backend API | Render (free web service) | `docker/Dockerfile.backend` |
| Dashboard | Vercel (Hobby) | `frontend/` (Vite build) |
| Agent downloads | GitHub Releases | built by `.github/workflows/agent-release.yml` |

The browser and the agents talk to Render directly (`VITE_API_URL`), so agent
traffic never counts against Vercel's free limits.

Capacity: about 5 PCs total (`MAX_AGENTS=5`), raw logs kept 2 days
(`LOG_RETENTION_DAYS=2`). Alerts and incidents are kept indefinitely.

---

## 1. Supabase — get the connection string

1. Project → **Connect** (top bar) → **Session pooler** → copy the URI.
   Use the *session pooler*, not "Direct connection": the direct host is
   IPv6-only and Render can't reach it.
2. Replace `[YOUR-PASSWORD]` with the database password you set when creating
   the project. It looks like:
   `postgresql://postgres.abcd1234:PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres`
3. If the password has symbols like `@ : / # %`, URL-encode them (or reset the
   password to letters and digits only under Project Settings → Database).

## 2. Generate secrets (on your PC)

```
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

The first is `JWT_SECRET`, the second `CREDENTIAL_ENCRYPTION_KEY`. Keep the
second one safe: losing it makes stored integration credentials unreadable.
Also pick an invite code for family (e.g. a short phrase).

## 3. Render — backend

1. **New → Web Service** → connect GitHub → pick `truepositive`.
2. Settings:
   - Branch: `main`
   - Language / Runtime: **Docker**
   - Dockerfile Path: `docker/Dockerfile.backend`
   - Docker Build Context Directory: `.` (repo root)
   - Instance Type: **Free**
   - Health Check Path: `/health`
3. Environment variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Supabase session-pooler URI from step 1 |
   | `JWT_SECRET` | from step 2 |
   | `CREDENTIAL_ENCRYPTION_KEY` | from step 2 |
   | `SIGNUP_INVITE_CODE` | your family invite code |
   | `MAX_AGENTS` | `5` |
   | `LOG_RETENTION_DAYS` | `2` |
   | `FORWARDED_ALLOW_IPS` | `*` (real client IPs for rate limiting behind Render's proxy) |
   | `AGENT_RELEASE_URL` | `https://github.com/gncrlatienza-eng/truepositive/releases/latest/download` |
   | `CORS_ORIGINS` | your Vercel URL from step 4, e.g. `https://truepositive.vercel.app` (fill in after step 4) |

4. Deploy. In the logs you should see `[agent fetch] saved ...` twice and
   `Uvicorn running`. Open `https://<your-service>.onrender.com/health` →
   `{"status":"ok"}`. Copy that `https://<your-service>.onrender.com` URL.

Migrations run automatically on every start.

## 4. Vercel — dashboard

1. **Add New → Project** → import `truepositive` from GitHub.
2. Settings:
   - Root Directory: `frontend`
   - Framework Preset: **Vite** (auto-detected)
3. Environment variable: `VITE_API_URL` = your Render URL from step 3
   (no trailing slash, no `/api`).
4. Deploy, then copy the Vercel URL (e.g. `https://truepositive.vercel.app`).
5. Back in Render, set `CORS_ORIGINS` to that Vercel URL and save (Render
   redeploys).

`VITE_API_URL` is baked in at build time: if the Render URL ever changes,
update it in Vercel and redeploy.

## 5. Test end to end

1. Open the Vercel URL → sign up with the invite code.
2. Onboarding → download the agent → install → it should show **Connected**.
3. Within a minute or two, logs appear on the dashboard.

## Things to know

- **Cold starts:** Render's free tier sleeps after 15 minutes with no
  requests. Connected agents heartbeat every 30s, which keeps it awake. With
  no agents online, the first page load takes about a minute.
- **Server full:** at 5 devices, new devices and new signups see "This server
  is full". Free a slot by deleting a device under Settings → Sources.
- **New agent version:** push a tag like `agent-v1.0.2`. Render picks up the
  new files on its next restart (or click **Manual Deploy → Restart**).
- **Free-tier limits can change:** check Supabase/Render/Vercel pricing pages
  if something stops working.
