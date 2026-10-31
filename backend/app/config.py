from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")
    database_url: str = f"sqlite+aiosqlite:///{(BACKEND_DIR / 'data/lattice.db').as_posix()}"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173",
                               "http://localhost:5175", "http://127.0.0.1:5175"]
    bolna_api_key: str = ""
    bolna_agent_id: str = ""
    bolna_callback_secret: str = ""
    public_callback_url: str = ""
    bolna_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    bolna_timeout_seconds: float = 20

    @property
    def voice_configured(self) -> bool:
        return all((self.bolna_api_key, self.bolna_agent_id, self.bolna_callback_secret,
                    self.public_callback_url.startswith("https://")))


settings = Settings()
