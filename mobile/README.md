# TruePositive Mobile

React Native + Expo app — **placeholder scaffold only**.

## Status

Mobile is explicitly **not scheduled** in the current 8-week sprint plan ([`../docs/SPRINT_PLAN.md`](../docs/SPRINT_PLAN.md) — see "Out of Scope"). It's referenced in the project manifest as a future phase, and this folder holds a minimal Expo scaffold so the structure exists, but no screens are implemented yet.

## Run locally (once real screens exist)

```bash
npm install
npx expo start
```

## Planned Folder Layout

```
src/
├── screens/       Home, Alerts, AlertDetails, Settings
├── components/     Reusable native components
├── hooks/           Same contracts as web where practical
├── utils/             API, formatting, validators
├── context/             Auth, app state
└── navigation/             Bottom tab navigator
```
