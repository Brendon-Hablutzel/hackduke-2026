"""PostgreSQL cache for Gemini-parsed email todo items."""

import logging
from contextlib import contextmanager
from typing import Optional

import psycopg
from psycopg.rows import dict_row

from app.config import config

logger = logging.getLogger(__name__)


@contextmanager
def _conn():
    with psycopg.connect(config.DATABASE_URL, row_factory=dict_row) as con:
        yield con


def init_db() -> None:
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS parsed_todos (
                user_sub         TEXT NOT NULL,
                gmail_message_id TEXT NOT NULL,
                title            TEXT NOT NULL,
                details          TEXT NOT NULL,
                due_date         TEXT,
                location         TEXT,
                priority         TEXT NOT NULL,
                sender           TEXT,
                date             TEXT,
                gmail_url        TEXT,
                done             BOOLEAN NOT NULL DEFAULT FALSE,
                PRIMARY KEY (user_sub, gmail_message_id)
            )
        """)
        con.execute("""
            ALTER TABLE parsed_todos ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT FALSE
        """)


def get_cached(user_sub: str, gmail_message_id: str) -> Optional[dict]:
    with _conn() as con:
        row = con.execute(
            "SELECT * FROM parsed_todos WHERE user_sub = %s AND gmail_message_id = %s",
            (user_sub, gmail_message_id),
        ).fetchone()
    return row  # already a dict or None via dict_row


def put_cached(user_sub: str, gmail_message_id: str, item: dict) -> None:
    with _conn() as con:
        con.execute("""
            INSERT INTO parsed_todos
                (user_sub, gmail_message_id, title, details, due_date, location,
                 priority, sender, date, gmail_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_sub, gmail_message_id) DO UPDATE SET
                title    = EXCLUDED.title,
                details  = EXCLUDED.details,
                due_date = EXCLUDED.due_date,
                location = EXCLUDED.location,
                priority = EXCLUDED.priority,
                sender   = EXCLUDED.sender,
                date     = EXCLUDED.date,
                gmail_url = EXCLUDED.gmail_url
        """, (
            user_sub,
            gmail_message_id,
            item["title"],
            item["details"],
            item.get("due_date"),
            item.get("location"),
            item["priority"],
            item.get("sender"),
            item.get("date"),
            item.get("gmail_url"),
        ))


def mark_done(user_sub: str, gmail_message_id: str) -> bool:
    """Mark a todo as done. Returns True if a row was updated."""
    with _conn() as con:
        cur = con.execute(
            "UPDATE parsed_todos SET done = TRUE WHERE user_sub = %s AND gmail_message_id = %s",
            (user_sub, gmail_message_id),
        )
        return cur.rowcount > 0


def delete_user_cache(user_sub: str) -> int:
    """Remove all cached todos for a user. Returns number of rows deleted."""
    with _conn() as con:
        cur = con.execute("DELETE FROM parsed_todos WHERE user_sub = %s", (user_sub,))
        return cur.rowcount
