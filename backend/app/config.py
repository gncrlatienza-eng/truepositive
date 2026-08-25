from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://truepositive:truepositive@localhost:5432/truepositive"
    jwt_secret: str
    jwt_expire_minutes: int = 60 * 24 * 30
    cors_origins: str = "http://localhost:3000"
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
