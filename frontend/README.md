# TruePositive Frontend

React + Vite web dashboard.

## Run locally

**Via Docker:** handled by the root `docker-compose.yml`.

**Standalone:**

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production bundle to dist/
```

Set `VITE_API_URL` in a `.env` file (see the root [README's Environment Variables section](../README.md#environment-variables)) to point at the backend. No `.env.example` is committed — create `.env` yourself.

## Code Quality

Enforced in CI (see root [README's Code Quality Standards](../README.md#code-quality-standards)). Config: `eslint.config.js` (flat config — `eslint-plugin-react` + `eslint-plugin-react-hooks`) and `.prettierrc.json`.

```bash
npm run lint            # eslint .
npm run format:check    # prettier --check .
npm run format           # prettier --write . (auto-fix)
```

No test runner is set up on the frontend yet — that's open follow-up work, not currently in CI.

## Folder Layout

```
src/
├── components/
│   ├── layout/          Navbar, Sidebar, Layout, Footer
│   ├── screens/          The 9+ full-page screens (Landing, Login, Dashboard, ...)
│   ├── common/             Reusable primitives (Button, Card, Badge, Input, Table, Modal, Toast)
│   ├── charts/              Bar, Line, Gauge, Pie, Timeline
│   └── investigative/         LogViewer, Timeline, EventRelations
├── hooks/                       useAuth, useLogs, useAlerts, etc.
├── utils/                        API client, formatters, validators, constants
├── styles/                        theme.js (design tokens), global styles, responsive helpers
├── context/                        Auth + settings context providers
├── pages/                           Route-level page components
└── App.jsx, main.jsx
```

## Design System

`src/styles/theme.js` is the single source of truth for colors, typography, and spacing — values were extracted from the reference UI mockup in `../reference/` (gitignored, not part of this repo). When building a new screen, match that mockup's inline styles rather than inventing new values; ask the project owner for a copy if you need to check a screen not yet reflected in `theme.js`.

Key tokens: background `#0F1219`, surface `#1A1E2E`, border `#2D3748`, accent `#0891b2`, text `#E8EAED`, muted text `#9CA3AF`.
