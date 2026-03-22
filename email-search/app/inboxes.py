"""Per-user inbox (connected Gmail account) management."""

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

from app.config import config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------

def _inbox_file(user_sub: str) -> str:
    path = os.path.join(config.DATA_DIR, "inboxes")
    os.makedirs(path, exist_ok=True)
    return os.path.join(path, f"{user_sub}.json")


def load_inboxes(user_sub: str) -> list:
    path = _inbox_file(user_sub)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return []


def _save(user_sub: str, inboxes: list) -> None:
    with open(_inbox_file(user_sub), "w") as f:
        json.dump(inboxes, f)


def _safe_id(email: str) -> str:
    return re.sub(r"[^a-z0-9]", "_", email.lower())[:48]


# ---------------------------------------------------------------------------
# Scope key (what's used to key ChromaDB collections, SQLite DBs, stats files)
# ---------------------------------------------------------------------------

def inbox_scope(user_sub: str, inbox_id: str) -> str:
    """Return the storage scope key for (user, inbox).

    The primary inbox uses bare user_sub for backward compatibility with
    existing collections and DB files.
    """
    if inbox_id == user_sub:
        return user_sub
    return f"{user_sub}__{inbox_id}"


# ---------------------------------------------------------------------------
# Inbox CRUD
# ---------------------------------------------------------------------------

def ensure_primary(user_sub: str, email: str, name: str, picture: str) -> None:
    """Create the primary inbox entry on first login (idempotent)."""
    inboxes = load_inboxes(user_sub)
    if any(i["id"] == user_sub for i in inboxes):
        return
    inboxes.insert(0, {
        "id": user_sub,
        "email": email,
        "name": name,
        "picture": picture,
        "is_primary": True,
        "added_at": datetime.now(timezone.utc).isoformat(),
    })
    _save(user_sub, inboxes)


def add_inbox(user_sub: str, email: str, name: str, picture: str) -> dict:
    """Add a non-primary inbox. Returns the inbox dict (existing if duplicate)."""
    inboxes = load_inboxes(user_sub)
    existing = next((i for i in inboxes if i["email"] == email), None)
    if existing:
        return existing
    inbox = {
        "id": _safe_id(email),
        "email": email,
        "name": name,
        "picture": picture,
        "is_primary": False,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    inboxes.append(inbox)
    _save(user_sub, inboxes)
    return inbox


def remove_inbox(user_sub: str, inbox_id: str) -> None:
    inboxes = [i for i in load_inboxes(user_sub) if i["id"] != inbox_id]
    _save(user_sub, inboxes)


def set_primary(user_sub: str, inbox_id: str) -> None:
    inboxes = load_inboxes(user_sub)
    for i in inboxes:
        i["is_primary"] = (i["id"] == inbox_id)
    _save(user_sub, inboxes)


def get_inbox(user_sub: str, inbox_id: str) -> Optional[dict]:
    return next((i for i in load_inboxes(user_sub) if i["id"] == inbox_id), None)
