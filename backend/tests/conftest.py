import os

# app.config.Settings requires JWT_SECRET with no default (fails fast on a real
# missing secret) — tests need a placeholder before app.main is ever imported.
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-real-use")
