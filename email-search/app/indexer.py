"""Indexing pipeline: fetch → preprocess → embed → store."""

import json
import logging
import os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Callable, Optional

from google.oauth2.credentials import Credentials

from app.config import config
from app.embeddings import embed_texts
from app.gmail import fetch_emails
from app.preprocessor import preprocess, summarize_if_long
from app.vectordb import get_indexed_ids, upsert_emails

logger = logging.getLogger(__name__)

_BATCH_SIZE = 32


def _save_stats(user_sub: str, indexed_count: int, last_sync: str) -> None:
    path = config.stats_file(user_sub)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump({"indexed_count": indexed_count, "last_sync": last_sync}, f)


def load_stats(user_sub: str) -> dict:
    path = config.stats_file(user_sub)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {"indexed_count": 0, "last_sync": None}


def _parse_date(date_str: str) -> datetime:
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def _build_thread_context(email: dict, thread_emails: list[dict]) -> str:
    """Build full_text with up to 2 preceding thread messages prepended as context."""
    current_id = email["id"]
    position = next((i for i, e in enumerate(thread_emails) if e["id"] == current_id), 0)
    predecessors = thread_emails[max(0, position - 2):position]

    current_body = summarize_if_long(preprocess(email["body"]))
    current_block = f"[This message]\nSubject: {email['subject']}\n\n{current_body}".strip()

    if not predecessors:
        return f"Subject: {email['subject']}\n\n{current_body}".strip()

    context_blocks = []
    for prev in predecessors:
        prev_body = summarize_if_long(preprocess(prev["body"]))
        context_blocks.append(f"From: {prev['sender']}\n{prev_body}")

    context_section = "\n\n---\n".join(context_blocks)
    return f"[Thread context]\n{context_section}\n\n---\n{current_block}"


def run_indexing(
    creds: Credentials,
    user_sub: str,
    max_emails: int = 500,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> dict:
    logger.info("Starting indexing for user %s (max=%d)", user_sub, max_emails)
    already_indexed = get_indexed_ids(user_sub)
    logger.info("%d emails already indexed", len(already_indexed))

    # First pass: collect all emails and build thread map
    logger.info("First pass: fetching all emails to build thread map…")
    all_emails: list[dict] = list(fetch_emails(creds, max_emails=max_emails))

    thread_map: dict[str, list[dict]] = {}
    for email in all_emails:
        thread_map.setdefault(email["thread_id"], []).append(email)
    for tid in thread_map:
        thread_map[tid].sort(key=lambda e: _parse_date(e["date"]))
    logger.info("Built thread map: %d threads from %d emails", len(thread_map), len(all_emails))

    batch_ids, batch_docs, batch_meta, batch_texts = [], [], [], []
    new_count = skipped_count = 0

    def flush_batch():
        nonlocal new_count
        if not batch_texts:
            return
        embeddings = embed_texts(batch_texts)
        upsert_emails(user_sub, batch_ids, embeddings, batch_docs, batch_meta)
        new_count += len(batch_texts)
        logger.info("Indexed batch of %d (total new: %d)", len(batch_texts), new_count)
        batch_ids.clear(); batch_docs.clear(); batch_meta.clear(); batch_texts.clear()

    for email in all_emails:
        if email["id"] in already_indexed:
            skipped_count += 1
            if progress_callback:
                progress_callback(new_count, skipped_count)
            continue

        thread_emails = thread_map.get(email["thread_id"], [email])
        full_text = _build_thread_context(email, thread_emails)

        batch_ids.append(email["id"])
        batch_docs.append(full_text)
        batch_texts.append(full_text)
        batch_meta.append({
            "gmail_message_id": email["id"],
            "thread_id": email["thread_id"],
            "subject": email["subject"][:500],
            "sender": email["sender"][:200],
            "date": email["date"][:100],
            "snippet": email["snippet"][:500],
            "labels": json.dumps(email["labels"]),
            "has_attachment": 1 if email.get("has_attachment") else 0,
            "has_ses_outgoing": 1 if email.get("has_ses_outgoing") else 0,
        })

        if len(batch_texts) >= _BATCH_SIZE:
            flush_batch()
            if progress_callback:
                progress_callback(new_count, skipped_count)

    flush_batch()

    last_sync = datetime.now(timezone.utc).isoformat()
    _save_stats(user_sub, new_count + len(already_indexed), last_sync)

    result = {
        "new": new_count,
        "skipped": skipped_count,
        "total_indexed": new_count + len(already_indexed),
        "last_sync": last_sync,
    }
    logger.info("Indexing complete: %s", result)
    return result
