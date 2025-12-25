"""
Configuration management for the agent system.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "shopping-agents"
    app_env: str = Field(default="development", alias="APP_ENV")
    debug: bool = Field(default=True, alias="DEBUG")

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://agent:agent_dev_password@localhost:5432/agent_db",
        alias="DATABASE_URL",
    )

    # Tool Gateway
    tool_gateway_url: str = Field(
        default="http://localhost:3000",
        alias="TOOL_GATEWAY_URL",
    )

    # LLM Configuration
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model_planner: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL_PLANNER")
    openai_model_verifier: str = Field(default="gpt-4o", alias="OPENAI_MODEL_VERIFIER")

    # Token Budget
    token_budget_total: int = Field(default=50000, alias="TOKEN_BUDGET_TOTAL")

    # Observability
    otel_exporter_otlp_endpoint: str = Field(
        default="http://localhost:4317",
        alias="OTEL_EXPORTER_OTLP_ENDPOINT",
    )
    otel_service_name: str = Field(default="shopping-agents", alias="OTEL_SERVICE_NAME")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

