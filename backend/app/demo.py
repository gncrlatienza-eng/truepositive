"""Identity of the public read-only demo account (see services/demo_service.py).

The .invalid domain is reserved, so email validation rejects it at signup and
password login: nobody can register or log in as this user except through
POST /auth/demo.
"""

DEMO_EMAIL = "demo@truepositive.invalid"
DEMO_ORG_SLUG = "demo"
DEMO_ORG_NAME = "TruePositive Demo"
# Sample data spans less than LOG_RETENTION_DAYS so the hourly purge leaves
# most of it in place between nightly refreshes.
DEMO_DATA_DAYS = 2
