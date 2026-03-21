"""Google OAuth 2.0 web flow and session helpers."""

import json
import logging
import os
from pathlib import Path
from typing import Optional

import httpx
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from starlette.requests import Request as StarletteRequest

from app.config import config

logger = logging.getLogger(__name__)

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]


# ---------------------------------------------------------------------------
# Token storage (server-side, keyed by Google user sub)
# ---------------------------------------------------------------------------

def _token_path(user_sub: str) -> Path:
    path = Path(config.DATA_DIR) / "tokens" / f"{user_sub}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def save_token(user_sub: str, creds: Credentials) -> None:
    _token_path(user_sub).write_text(creds.to_json())


def load_token(user_sub: str) -> Optional[Credentials]:
    path = _token_path(user_sub)
    if not path.exists():
        return None
    creds = Credentials.from_authorized_user_file(str(path), SCOPES)
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            save_token(user_sub, creds)
        except Exception as e:
            logger.warning("Token refresh failed for %s: %s", user_sub, e)
            return None
    return creds


# ---------------------------------------------------------------------------
# OAuth flow helpers
# ---------------------------------------------------------------------------

def make_flow() -> Flow:
    if not os.path.exists(config.CREDENTIALS_PATH):
        raise FileNotFoundError(
            f"credentials.json not found at {config.CREDENTIALS_PATH}. "
            "Place your Google OAuth client secret file there."
        )
    return Flow.from_client_secrets_file(
        config.CREDENTIALS_PATH,
        scopes=SCOPES,
        redirect_uri=config.redirect_uri,
    )


async def fetch_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

def get_current_user(request: StarletteRequest) -> Optional[dict]:
    """Return the user dict stored in the session, or None."""
    return request.session.get("user")


def set_session_user(request: StarletteRequest, user: dict) -> None:
    request.session["user"] = user


def clear_session(request: StarletteRequest) -> None:
    request.session.clear()
