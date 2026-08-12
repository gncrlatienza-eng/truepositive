# Security

TruePositive is a security product — its own codebase should hold up to the same scrutiny it will eventually apply to customers' compliance evidence (see `docs/SPRINT_PLAN.md`'s Sprint 7 reports: SOC 2 / HIPAA / PCI-DSS). This document states what standard we're building against and gives an honest account of where the code currently stands.

## Standard we align to: OWASP ASVS

We use the [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/) as the practical, code-level baseline — it's a checklist for exactly what this project is (a web app + API), rather than an organizational certification.

**ISO/IEC 27001 and SOC 2 are explicitly out of scope for now.** Both are management-system certifications — risk registers, access-control policies, incident-response plans, third-party audits — pursued by an organization with customers requiring them, not something a pre-launch codebase "implements." If TruePositive reaches the point of selling to customers who require one, that's a business decision to revisit; ASVS is what the code itself can actually be measured against today.

## Current status

Organized by ASVS area. This list will go stale — treat it as a snapshot, not a live audit; verify against the actual code before relying on it.

### Covered
- **Password storage**: bcrypt, never logged or returned in any API response (`backend/app/utils/security.py`).
- **Injection**: all queries go through SQLAlchemy's ORM/query builder — no raw string-interpolated SQL anywhere in the codebase.
- **Authentication tokens**: JWT with an explicit algorithm (`HS256`, no algorithm-confusion surface), signature verified server-side on every request, clean 401s on missing/malformed/expired tokens.
- **Secrets configuration**: `JWT_SECRET` has no default — the app fails to start rather than silently running with a guessable key.
- **Input validation**: every request body is validated server-side via Pydantic schemas (`backend/app/schemas/`), independent of whatever the frontend already checked.
- **CORS**: explicit origin allowlist (`CORS_ORIGINS` env var), not a wildcard, despite `allow_credentials=True`.
- **Session invalidation on bad token**: the frontend's axios interceptor clears session state and redirects to `/login` on any `401` (`frontend/src/utils/api.js`).
- **Security response headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (frontend), `Strict-Transport-Security` — set in `docker/nginx.conf` and `backend/app/main.py`'s `security_headers` middleware. **`Content-Security-Policy` is deliberately excluded** — see note below.
- **JWT library kept current**: `python-jose` pinned to `3.4.0` in `backend/requirements.txt` (was `3.3.0`, which had CVE-2024-33663, an algorithm-confusion signature-verification flaw, CVSS 7.4). Our own `jwt.decode()` call already hardcodes `algorithms=["HS256"]` rather than trusting the token's own header, which mitigates the main attack vector regardless — took the upgrade anyway since it was a safe, non-breaking pin bump.

### Gaps (known, not yet addressed)
- **No rate limiting or account lockout** on `/auth/login` — brute-forceable today. No library for this is installed.
- **No password reset flow** — the "Forgot?" link on the login page is an intentional placeholder (see `docs/SPRINT_PLAN.md`); there's no backend endpoint and no sprint currently scoped to build one.
- **No email verification** on signup.
- **No MFA.**
- **Long-lived JWTs with no revocation** — tokens live up to 30 days (`JWT_EXPIRE_MINUTES`) with no refresh-token rotation and no server-side revocation list, and the lifetime doesn't vary with the "keep me signed in" checkbox — even a not-remembered session's token is valid for the full 30 days if copied out of `sessionStorage` before the tab closes. Logout is client-side only (clears storage).
- **Tokens stored in `localStorage`/`sessionStorage`**, not an `httpOnly` cookie — readable by any script that achieves XSS on the page. Standard tradeoff for a separate SPA + API (no CSRF token needed either way), but worth naming explicitly rather than leaving implicit.
- **No `Content-Security-Policy`** — the frontend relies on inline styles throughout (React's `style={{...}}` prop renders as real inline `style="..."` attributes, which a strict CSP blocks without `'unsafe-inline'`) and loads Google Fonts from an external origin; the API origin CSP would need to allow (`connect-src`) also varies by deployment (`VITE_API_URL`). Getting this right needs env-aware nginx templating and actual browser verification (no CSP-violation console output is visible from a `curl` check) — neither is done yet, so it's left off rather than shipped unverified.
- **`audit_log` table exists but nothing writes to it** — the schema (`backend/app/models/audit_log.py`) was built in Sprint 1; no route or service populates it yet. Real audit logging is unscheduled (Settings → Audit tab is Sprint 8's "last unbuilt screen" per the sprint plan).
- **No automated dependency vulnerability scanning in CI.** Ran manually this session (`npm audit`, `pip-audit`) and found:
  - **Frontend**: `esbuild`/`vite` (dev-server-only path traversal, CVSS 7.5, Windows-specific — only reachable via `npm run dev`, not the Dockerized/production build) and `react-router-dom` (two moderate CVEs) — both fixes require a semver-major bump (Vite 5→8, react-router-dom 6→7). Not applied; needs deliberate testing, not a silent bump.
  - **Backend**: `starlette` (transitively via `fastapi==0.115.0`) has multiple known advisories fixed only in much newer `starlette`/`fastapi` versions — same story, needs a framework-version bump evaluated on its own, not a quick pin change. `pip`/`pytest`/`python-dotenv`/`ecdsa` also flagged but are either dev-tooling-only or transitively unreachable given this app's actual usage (e.g. `ecdsa` is a `python-jose` dependency only exercised for ECDSA algorithms, and this app only ever uses `HS256`).
  - Not wired into CI yet specifically because it would fail immediately on the above known, accepted-for-now findings — needs those triaged (fixed or explicitly waived per-finding) before a hard gate is meaningful rather than just permanently red.

## Reporting a vulnerability

This repo doesn't have a public-facing deployment yet, but if you find an issue: use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) (Security tab → Report a vulnerability) rather than a public issue, once that's enabled on the repo. Don't open a public issue with exploit details.
