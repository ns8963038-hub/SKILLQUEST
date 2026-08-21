"""Environment configuration, validated once at import via pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Shared secret for backend -> AI service calls. Empty until configured.
    internal_api_key: str = ""
    # Supabase Postgres connection string. Not used yet at M0.
    database_url: str = ""


settings = Settings()
