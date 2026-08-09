# Docker Configs

| File | Purpose |
|---|---|
| `Dockerfile.backend` | Builds the FastAPI service (`../backend`) |
| `Dockerfile.frontend` | Builds the React app and serves it via nginx (`../frontend`) |
| `nginx.conf` | nginx config used by the frontend image — serves the static build and proxies `/api` to the backend service |

These are wired together by the root `../docker-compose.yml`, which also adds the Postgres service. Nothing in this folder is meant to be run standalone — use `docker-compose up` from the repo root.
