"""Local-dev-only seed data for the Sprint 4 dashboard.

`logs`/`alerts` are empty in any real deployment right now (real ingestion
is Sprint 5 scope) — this script inserts realistic sample rows tied to an
*existing* org so the dashboard can be reviewed with real-looking numbers
instead of an all-zero empty state.

Usage (from backend/, with the venv/deps used by the app):
    python scripts/seed_dashboard_data.py <org-slug>

Deliberately manual-only: never invoked by docker-compose.yml or CI. Fails
loudly if the org doesn't exist rather than creating one, so it can't be run
by accident against a real tenant. Re-running is safe — it clears rows it
previously seeded (identified by a "Seed:" name prefix) before inserting
fresh ones, rather than piling up duplicates.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database.session import SessionLocal  # noqa: E402
from app.models.org import Org  # noqa: E402
from app.services.sample_data import seed_sample_data  # noqa: E402


def seed(org_slug: str) -> None:
    db = SessionLocal()
    try:
        org = db.query(Org).filter(Org.slug == org_slug).one_or_none()
        if org is None:
            print(f"No org found with slug {org_slug!r} — sign up first, then re-run with that workspace slug.")
            sys.exit(1)
        counts = seed_sample_data(db, org.id)
        db.commit()
        print(
            f"Seeded org {org_slug!r}: {counts['agents']} agents, {counts['sources']} sources, "
            f"{counts['rules']} rules, {counts['logs']} logs, {counts['alerts']} alerts."
        )
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/seed_dashboard_data.py <org-slug>")
        sys.exit(1)
    seed(sys.argv[1])
