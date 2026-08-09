#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "No .env found. Create one yourself — see README.md's Environment Variables section for the required keys."
fi

echo "Installing backend dependencies..."
python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt

echo "Installing frontend dependencies..."
(cd frontend && npm install)

echo "Done. Run 'docker-compose up' or start services individually — see each folder's README."
