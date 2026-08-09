# TruePositive — 8-Week Agile Sprint Plan

**Team:** Solo developer + Claude (code generation), user reviews and commits.
**Cadence:** 8 sprints, 1 week each (Monday–Sunday).
**Window:** 2026-08-10 → 2026-10-04.
**Scope:** The full feature set defined by an interactive UI mockup and a project manifest, both kept in `reference/` (gitignored, not committed to this repo), minus the mobile app (explicitly deferred — see [Out of Scope](#out-of-scope)).

This plan is deliberately concrete: every sprint maps to specific screens/sections in the mockup (`isDashboard`, `isLogs`, `isAlerts`, `isIncidents`, `isReports`, `isIntel`, `isSettings`, and their modals) rather than generic milestones. The `is*`/state-field names referenced throughout come from that mockup — ask the project owner for a copy if you need to see the screen behind a name that isn't self-explanatory.

---

## Product Goal

Ship a working SIEM MVP: an analyst can sign up, deploy an agent, select log sources, watch logs flow into a dashboard, get tuned alerts instead of noise, investigate and resolve incidents, pull reports, and look up threat intel — end to end, running locally via `docker-compose up` and deployable to Vercel/Railway/Render.

## Sprint Rules

- **Sprint length:** 1 week. Monday: review sprint goal, pull tasks. Friday/weekend: demo to self (run the feature), retro (what slipped, why), update `docs/SPRINT_PLAN.md` checkboxes.
- **Definition of Ready:** a task can be pulled into a sprint only if the screen/field it implements is traceable to the mockup or manifest — no undefined scope.
- **Definition of Done (per task):** code runs locally, matches the mockup's layout/interaction for that screen, has no unhandled error states on the happy path, and is committed by the user after review.
- **Daily overhead:** none formally tracked (solo project) — but each sprint's Acceptance Criteria section doubles as the sprint's task board.

---

## Sprint 1 — Foundation & Design System
**Dates:** Aug 10–16
**Goal:** A wired, empty skeleton boots end-to-end: `docker-compose up` brings up Postgres + FastAPI + React, all talking to each other.

**Backend**
- [ ] Full Postgres schema migration: `users`, `orgs`, `agents`, `log_sources`, `logs`, `alerts`, `alert_rules`, `incidents`, `reports`, `whitelist_entries`, `audit_log` (matches manifest's 18-table reference, start with the 11 core tables).
- [ ] FastAPI app skeleton with health check, CORS, router registration.
- [ ] `app/config.py` reading `DATABASE_URL`, `JWT_SECRET`, etc. from env.

**Frontend**
- [ ] Vite + React scaffold boots, single placeholder route.
- [ ] Design tokens extracted from the mockup into `src/styles/theme.js`: background `#0F1219`, surface `#1A1E2E`, border `#2D3748`, accent `#0891b2`, text `#E8EAED`, muted `#9CA3AF`, severity colors (critical `#dc2626`-family, warn `#a16207`, ok `#047857`), font stack (`-apple-system, 'SF Pro Display'/'SF Pro Text', 'Segoe UI'`), monospace stack (`'SF Mono', ui-monospace, 'Menlo', 'Consolas'`).

**Acceptance Criteria**
- `docker-compose up` starts all 3 services with no manual steps beyond `.env` copy.
- `GET /health` returns 200 from the frontend's configured API base URL.
- Schema migrations apply cleanly to a fresh Postgres instance.

**Dependencies:** none (this is Sprint 0 scaffold work).
**Risk:** Low — mechanical setup. If it slips, everything downstream slips, so this sprint is not compressible.

---

## Sprint 2 — Auth & Onboarding
**Dates:** Aug 17–23
**Goal:** A new user can sign up, create a workspace, and land in the app shell.

**Backend**
- [ ] `POST /auth/signup`, `POST /auth/login` — JWT issuance, bcrypt password hashing.
- [ ] Org/workspace creation tied to signup (workspace slug validation: lowercase/numbers/hyphens).
- [ ] RBAC roles on the user model: Admin, Lead, Analyst, Read-Only.

**Frontend**
- [ ] Landing page (`isLanding`): hero, 4-step value prop list, "Create account" / "Log in" CTAs, social-proof strip.
- [ ] Login page (`isLogin`): email/password, "keep me signed in," SSO button (non-functional placeholder), forgot-password link.
- [ ] Onboarding Step 1 (`ob1`): account + org form (name, email, password w/ strength meter, org name, team size, workspace slug), terms checkbox.
- [ ] Onboarding Step 2 (`ob2`): agent platform picker (Windows/Linux/Docker/Kubernetes), enrollment credentials display (Agent ID + reveal-able key), install command block, "waiting for heartbeat" / "agent connected" states.
- [ ] Onboarding Step 3 (`ob3`): local vs. remote collection mode toggle, remote connection form (protocol/host/port/user/auth), log source checklist with volume + tag badges.

**Acceptance Criteria**
- Full signup → onboarding step 1–3 → app shell flow works with real backend calls (agent connection can be simulated/stubbed since Sprint 3 builds the real heartbeat).
- JWT persists across refresh; logged-out users are redirected to Login.

**Dependencies:** Sprint 1 schema + API skeleton.
**Risk:** Medium — the 3-step wizard has the most form state of any screen. If behind by Friday, ship steps 1–2 solid and stub step 3's remote-connection sub-form.

---

## Sprint 3 — Agents & Log Collection
**Dates:** Aug 24–30
**Goal:** A real agent can register, heartbeat, and its configured log sources are persisted and manageable.

**Backend**
- [ ] Agent registration endpoint consuming the enrollment credentials from Sprint 2's onboarding.
- [ ] Heartbeat endpoint + last-seen tracking.
- [ ] Encrypted credential storage for remote source auth (SSH key / password / Kerberos placeholder).
- [ ] Log source CRUD (local + remote SSH/WinRM/Syslog).

**Frontend**
- [ ] Settings → Sources tab (`isSourcesTab`): list configured sources, pause/resume, edit, delete, "connect source" modal (`connectSourceOpen`).
- [ ] Settings → Whitelist tab (`isWhitelistTab`): allow/block list view, "add entry" modal (`addEntryOpen`) with type/value/reason/expiry.

**Acceptance Criteria**
- An agent process (can be a scripted stub for this sprint) can register with real credentials and appear as "connected" in onboarding step 2 and in Settings → Sources.
- Whitelist entries persist and are enforced at the query layer (excluded from later log/alert views).

**Dependencies:** Sprint 2 onboarding UI + auth.
**Risk:** Medium — remote protocol handling (SSH/WinRM) is genuinely complex; for this sprint it's acceptable to implement SSH only and stub WinRM/Syslog as "coming soon" in the UI.

---

## Sprint 4 — Dashboard & Component Library
**Dates:** Aug 31–Sep 6
**Goal:** The main app shell and Detection Posture dashboard are fully navigable, backed by the shared component library.

**Backend**
- [ ] Aggregation queries for dashboard metrics (critical count, ingestion rate, pattern/anomaly summary, recent events, active alerts).

**Frontend**
- [ ] App shell: collapsible sidebar with 7 sections (Overview/Logs/Alerts/Incidents/Reports/Intel/Config), search bar (`showSearch`).
- [ ] Dashboard (`isDashboard`): headline metrics row, drill-in panels — Critical (`isCriticalPanel`), Ingestion (`isIngestionPanel`), Pattern (`isPatternPanel`), Events (`isEventsPanel`), Alerts (`isAlertsPanel`), Triage (`isTriagePanel`), Risk (`isRiskPanel`), Severity (`isSevPanel`), Type (`isTypePanel`).
- [ ] Shared component library: Button (primary/secondary/sizes/states), Card, Badge (severity-colored), Input (text/password/select/checkbox), Table (sortable, paginated), Modal/Dialog, Toast.

**Acceptance Criteria**
- Every sidebar item routes correctly and highlights active state.
- Dashboard panels render real aggregated data (not hardcoded) and each metric panel opens with correct content for its type.
- Component library is what Sprints 5–7 consume — no one-off styled elements from here on.

**Dependencies:** Sprint 1 schema (needs seed/real log & alert data to aggregate over — seed script may be needed if Sprint 3's real ingestion isn't producing volume yet).
**Risk:** Low-medium — largest UI surface so far, but mechanical once the component library exists.

---

## Sprint 5 — Logs & Alerts
**Dates:** Sep 7–13
**Goal:** Analysts can search raw logs and manage the alert pipeline end to end.

**Backend**
- [ ] Log query endpoint: search, filter (by source/severity/hour), sort, pagination, CSV export.
- [ ] Alert rules engine: rule storage + evaluation against incoming logs.
- [ ] Alert CRUD + ack/escalate state transitions.

**Frontend**
- [ ] Logs page (`isLogs`): table with quick filters, hour filter, search, log detail modal (`logOpen`) with intel enrichment toggle (`row.showIntel`).
- [ ] Alerts page (`isAlerts`): severity/assignee/rule filters, ack/escalate inline actions, alert detail modal (`alertOpen`).
- [ ] Rule builder modal (`ruleOpen`) — visual, no-code rule creation/edit; rule delete confirmation (`ruleDeleteOpen`).
- [ ] Settings → Rules tab (`isRulesTab`): rule list, search/filter, bulk selection.

**Acceptance Criteria**
- A log matching a configured rule produces an alert visible on the Alerts page within the ingestion pipeline's normal latency.
- CSV export produces a valid file for the current filtered view.
- Rule builder can create a rule that is immediately evaluated against new logs.

**Dependencies:** Sprint 3 (real log ingestion), Sprint 4 (component library).
**Risk:** Medium-high — the rules engine is the product's core differentiator per the manifest's competitive positioning. If time-constrained, prioritize this over polish elsewhere in the sprint.

---

## Sprint 6 — Incidents & Automation
**Dates:** Sep 14–20
**Goal:** Alerts can be escalated into trackable incidents, and repetitive response actions can be automated.

**Backend**
- [ ] Incident CRUD, status machine (open/investigating/resolved), risk scoring.
- [ ] Incident notes + assignment history persistence.
- [ ] Playbook model: trigger rule → actions (block IP, disable account, Slack notify, auto-create incident).

**Frontend**
- [ ] Incidents page (`isIncidents`): sortable/filterable list, SLA breach indicator (`hasIncBreach`), row selection bulk actions (`hasIncSelection`).
- [ ] Incident detail modal (`incidentOpen`): collapsible sections — linked alerts (`incSecAlertsOpen`), timeline (`incSecTimelineOpen`), notes (`incSecNotesOpen`, `incAddingNote`), assignment history (`incSecHistoryOpen`).
- [ ] Resolve (`isResolveModal`), Escalate (`isEscalateModal`), Reassign (`isReassignModal`) modals.
- [ ] Settings → Automation tab (`isAutomationTab`): playbook list, playbook builder modal (`playbookOpen`), playbook delete confirmation (`playbookDeleteOpen`).

**Acceptance Criteria**
- An alert can be linked into a new or existing incident (mirrors the mockup's `isLinkModal` flow from Threat Intel/Alerts).
- A playbook with "block IP" enabled actually calls the block action when its trigger rule fires (can target a stub/no-op firewall integration for this sprint).
- Incident timeline reflects every status/assignment change automatically.

**Dependencies:** Sprint 5 (alerts to escalate from).
**Risk:** Medium — incident detail has the most nested UI state in the whole mockup (4 collapsible sections + 3 modals). Budget extra time here; automation actions can be stubbed (log the action instead of executing it) if behind.

---

## Sprint 7 — Reports & Threat Intel
**Dates:** Sep 21–27
**Goal:** Analysts and stakeholders can pull reports and pivot on indicators of compromise.

**Backend**
- [ ] Report generation queries: daily, weekly, monthly, compliance (SOC 2/HIPAA/PCI-DSS evidence rollup).
- [ ] Report scheduling (delivery config storage — actual email delivery can be stubbed).
- [ ] Threat intel lookup: IOC (IP/domain/hash) search against a static or free-tier feed; MITRE ATT&CK tagging on rules.

**Frontend**
- [ ] Reports page (`isReports`) — tabs: Daily (`repIsDaily`, with timeframe picker `repTimeframeOpen`), Weekly (`repIsWeekly`), Monthly (`repIsMonthly`), Compliance (`repIsCompliance`), Builder (`repIsBuilder`), Library (`repIsLibrary`).
- [ ] Schedule report modal (`scheduleOpen`), export-to-PDF modal (`exportPdfOpen`), custom date-range modal (`customRangeOpen`), report-panel detail (`repPanelOpen`).
- [ ] Threat Intel page (`isIntel`): IOC search, MITRE grouping (`mitreGroupBy`, `mitreExpandedRow`), recent lookups, feed status (`intelFeedsOpen`).
- [ ] Block IOC (`isBlockModal`), Allow IOC (`isAllowModal`), rule-from-intel (`isRuleModalIntel`), link-to-incident (`isLinkModal`) modals.

**Acceptance Criteria**
- Daily report reflects real data for "today" (hour-by-hour breakdown, top events, alerts created, agent status).
- An IOC search against a known-bad test value returns a result and can be blocked, creating a whitelist/blocklist entry.
- At least Daily + one other report type render with real (not mocked) data; Compliance/Builder/Library can ship with representative sample data if time-constrained (see cut list).

**Dependencies:** Sprint 5 (alerts/logs to report on), Sprint 6 (incidents to reference in reports).
**Risk:** High — this sprint has the widest feature surface (6 report sub-views + full intel page + 4 modals) in the smallest time budget. This is the first sprint to draw from the cut list below if Sprint 4's checkpoint showed slippage.

---

## Sprint 8 — Hardening & Launch Prep
**Dates:** Sep 28–Oct 4
**Goal:** Everything built in Sprints 1–7 works together without breaking; the stack is deployable.

**Backend / Frontend**
- [ ] Settings → Audit tab (`isAuditTab`): action log with search/filter — the last unbuilt screen.
- [ ] Cross-screen QA pass: walk every sidebar section, every modal, every empty/error/loading state (`noIncidentsRows`, `agentWaiting` vs `agentConnected`, etc.).
- [ ] Bug fixing against the QA pass findings.
- [ ] Deployment: frontend → Vercel, backend → Railway/Render, database → managed Postgres (Supabase per manifest's recommendation).
- [ ] Retro: what shipped vs. plan, what got cut, what Phase 2 should prioritize first.

**Acceptance Criteria — Release Definition of Done**
- All 7 sidebar sections are reachable and functional.
- Signup → onboarding → real agent → real logs → dashboard reflects them, end to end.
- At least one alert rule fires from real log data and can be triaged into an incident.
- `docker-compose up` runs the full stack locally with one `.env` copy step.
- Deployed instance is reachable at a public URL.

**Dependencies:** all prior sprints.
**Risk:** This sprint is a protected buffer — **no new screens are scheduled here**. If Sprint 7 overflows, its remaining work (not new Sprint 8 scope) consumes this buffer first, and Audit-tab/deploy work slips to a Phase 2 kickoff instead.

---

## Sprint 4 Velocity Checkpoint

At the end of Sprint 4 (halfway point), compare actual vs. planned completion. If behind schedule, cut in this order — each cut preserves a working product, just a narrower one:

1. **Threat Intel page** — drop entirely; keep IOC data model for Phase 2.
2. **Automation/Playbooks** — keep manual incident response, drop automated actions.
3. **Reports beyond Daily** — ship Daily only; Weekly/Monthly/Compliance/Builder/Library become Phase 2.
4. **Incident richness** — keep the incident list + basic resolve/escalate; drop the notes/history sections and reassign modal.

## Out of Scope

- **Mobile app (React Native + Expo)** — present in the project manifest but not in the UI mockup. Not scheduled anywhere in this 8-week plan. A minimal Expo scaffold exists in `mobile/` for future Phase 2 work only.
- **Advanced ML/behavioral analytics** — manifest's Advanced Feature #6; needs real production log volume to be meaningful, explicitly deferred.
- **Third-party integrations (Slack/Jira/AWS/Azure/Splunk)** beyond the stubbed Slack-notify playbook action.

## Release-Level Definition of Done

See Sprint 8's Acceptance Criteria — that list is the release gate for calling this 8-week plan complete.
