import logging

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://truepositive:truepositive@localhost:5432/truepositive"
    jwt_secret: str
    jwt_expire_minutes: int = 60 * 24 * 30
    cors_origins: str = "http://localhost:3100"
    credential_encryption_key: str

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_use_tls: bool = True

    # Unset by default (dev/local signup stays open). Set for a public
    # deployment to require this exact code on signup — see auth_service.signup.
    signup_invite_code: str | None = None

    # Raw logs older than this are purged hourly (app.services.log_retention).
    # Logs an alert points at are always kept. Sized for a free-tier
    # Postgres (~0.5 GB) at ~1 KB/log and tens of thousands of logs/PC/day.
    log_retention_days: int = 2

    # Server-wide cap on devices (agents) across every org. Unset = no cap
    # (dev/local). Set for a small free-tier deployment: once reached, new
    # agents and new signups get a "server full" error (agent_service).
    max_agents: int | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)

    @property
    def signup_invite_required(self) -> bool:
        return bool(self.signup_invite_code)


settings = Settings()

if len(settings.jwt_secret) < 32:
    # HS256 tokens signed with a short secret can be brute-forced offline from
    # any one token. Warn rather than refuse to boot so existing dev .env
    # files keep working; env.example documents generating a real one.
    logging.getLogger(__name__).warning("JWT_SECRET is shorter than 32 characters — generate a stronger one")
