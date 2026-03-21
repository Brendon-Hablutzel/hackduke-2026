"""Extract likely action-item emails from the most recent N indexed emails."""

import logging
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import List

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

from app.email_parser import parse_email
from app.todo_cache import get_cached, put_cached
from app.vectordb import get_collection

logger = logging.getLogger(__name__)

# Keywords that suggest an email needs action
_ACTION_PATTERNS = [
    # Requests / asks
    r"\bplease\b", r"\bcan you\b", r"\bcould you\b", r"\bwould you\b",
    r"\baction required\b", r"\baction needed\b", r"\bfollowup\b", r"\bfollow.up\b",
    r"\brespond\b", r"\breply\b", r"\breview\b", r"\bapprove\b", r"\bapproval\b",
    r"\bconfirm\b", r"\bconfirmation\b", r"\bsubmit\b", r"\bcomplete\b", r"\bfill out\b",
    r"\bsign\b", r"\bschedule\b", r"\bbook\b", r"\brsvp\b",
    # Urgency
    r"\burgent\b", r"\basap\b", r"\bdeadline\b", r"\bdue\b", r"\breminder\b",
    r"\bimportant\b", r"\bpriority\b", r"\btime.sensitive\b", r"\bexpires?\b",
    # Invitations / meetings
    r"\binvitation\b", r"\binvited\b", r"\bmeeting\b", r"\bcall\b", r"\binterview\b",
    r"\bwebinar\b", r"\bevent\b",
]
_COMPILED = [re.compile(p, re.IGNORECASE) for p in _ACTION_PATTERNS]


def _parse_date(date_str: str):
    """Return a sortable datetime or None."""
    if not date_str:
        return None
    # Strip timezone names that parsedate_to_datetime can't handle
    cleaned = re.sub(r"\s+\([^)]+\)$", "", date_str.strip())
    try:
        return parsedate_to_datetime(cleaned)
    except Exception:
        return None


def _action_score(subject: str, snippet: str) -> float:
    """Return a 0–1 score for how likely this email needs action."""
    text = f"{subject} {snippet}".lower()
    hits = sum(1 for pat in _COMPILED if pat.search(text))
    return min(hits / 4.0, 1.0)  # saturate at 4 keyword hits → score 1.0


def get_todos(user_sub: str, n: int = 20) -> List[dict]:
    """
    Fetch the most recent `n` emails from the user's collection and return
    those with the highest action-item scores, sorted by score desc.
    """
    try:
        col = get_collection(user_sub)
        total = col.count()
        if total == 0:
            return []

        result = col.get(
            limit=min(total, max(n * 5, 200)),  # over-fetch so we can sort by date
            include=["metadatas"],
        )
    except Exception as e:
        logger.error("Could not fetch todos: %s", e)
        raise

    metadatas = result.get("metadatas", [])

    # Sort by parsed date descending, fall back to index order
    def sort_key(m):
        dt = _parse_date(m.get("date", ""))
        return dt.timestamp() if dt else 0.0

    metadatas.sort(key=sort_key, reverse=True)
    recent = metadatas[:n]

    todos = []
    for m in recent:
        score = _action_score(m.get("subject", ""), m.get("snippet", ""))
        todos.append({
            "thread_id": m.get("thread_id", ""),
            "subject": m.get("subject", "(no subject)"),
            "sender": m.get("sender", ""),
            "date": m.get("date", ""),
            "snippet": m.get("snippet", ""),
            "score": round(score, 2),
        })

    todos.sort(key=lambda x: x["score"], reverse=True)
    return todos


def get_parsed_todos(user_sub: str, n: int = 20) -> List[dict]:
    """
    Fetch the most recent `n` emails, filter to action-needed ones (score >= 0.25),
    and parse each with Gemini structured outputs.
    """
    try:
        col = get_collection(user_sub)
        total = col.count()
        if total == 0:
            return []

        result = col.get(
            limit=min(total, max(n * 5, 200)),
            include=["metadatas", "documents"],
        )
    except Exception as e:
        logger.error("Could not fetch todos: %s", e)
        raise

    metadatas = result.get("metadatas", [])
    documents = result.get("documents", [])

    # Sort by date descending
    items = list(zip(metadatas, documents))
    items.sort(key=lambda x: (_parse_date(x[0].get("date", "")) or _EPOCH).timestamp(), reverse=True)
    recent = items[:n]

    # Keep only action-needed emails, sorted by score, capped to avoid rate limits
    scored = [
        (m, doc, _action_score(m.get("subject", ""), m.get("snippet", "")))
        for m, doc in recent
    ]
    action_items = [
        (m, doc) for m, doc, score in sorted(scored, key=lambda x: x[2], reverse=True)
        if score >= 0.25
    ][:5]

    if not action_items:
        return []

    parsed = []
    last_error: Exception | None = None
    gemini_calls = 0
    for m, doc in action_items:
        gmail_id = m.get("gmail_message_id", "")

        if gmail_id:
            cached = get_cached(user_sub, gmail_id)
            if cached:
                logger.debug("Cache hit for email %s", gmail_id)
                parsed.append({k: cached[k] for k in ("title", "details", "due_date", "location", "priority", "sender", "date", "gmail_url")})
                continue

        if gemini_calls > 0:
            time.sleep(1)  # stay under Gemini RPM limit
        gemini_calls += 1

        try:
            p = parse_email(
                subject=m.get("subject", ""),
                body=doc,
                sender=m.get("sender", ""),
                date=m.get("date", ""),
            )
        except Exception as e:
            logger.warning("Gemini parse failed for email '%s': %s", m.get("subject", ""), e)
            last_error = e
            continue

        item = {
            "title": p.title,
            "details": p.details,
            "due_date": p.due_date,
            "location": p.location,
            "priority": p.priority.value,
            "sender": m.get("sender", ""),
            "date": m.get("date", ""),
            "gmail_url": f"https://mail.google.com/mail/u/0/#inbox/{gmail_id}" if gmail_id else None,
        }

        if gmail_id:
            put_cached(user_sub, gmail_id, item)

        parsed.append(item)

    if not parsed and last_error is not None:
        raise RuntimeError(f"Gemini parsing failed for all emails: {last_error}") from last_error

    return parsed
