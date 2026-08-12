from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://truepositive:truepositive@localhost:5432/truepositive"
    jwt_secret: str
    jwt_expire_minutes: int = 60 * 24 * 30
    cors_origins: str = "http://localhost:3000"
    credential_encryption_key: str

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
