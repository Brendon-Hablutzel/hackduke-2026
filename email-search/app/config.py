import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # App
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-to-a-long-random-string")
    APP_BASE_URL: str = os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Gmail
    MAX_EMAILS: int = int(os.getenv("MAX_EMAILS", "500"))
    CREDENTIALS_PATH: str = os.getenv("CREDENTIALS_PATH", "./credentials/credentials.json")

    # Embeddings
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

    # ChromaDB
    CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
    CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", "8000"))
    CHROMA_COLLECTION_PREFIX: str = os.getenv("CHROMA_COLLECTION_PREFIX", "emails")

    # Storage
    DATA_DIR: str = os.getenv("DATA_DIR", "./data")

    @property
    def redirect_uri(self) -> str:
        return f"{self.APP_BASE_URL}/auth/callback"

    def stats_file(self, user_sub: str) -> str:
        return os.path.join(self.DATA_DIR, "stats", f"{user_sub}.json")


config = Config()
