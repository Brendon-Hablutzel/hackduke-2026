"""Gmail API client — accepts a google.oauth2.credentials.Credentials object."""

import base64
import logging
import time
from typing import Generator

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

_MAX_RETRIES = 5
_BACKOFF_BASE = 2.0


def _retry(fn, *args, **kwargs):
    """Call fn with exponential backoff on rate-limit / server errors."""
    for attempt in range(_MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except HttpError as e:
            if e.resp.status in (429, 500, 503) and attempt < _MAX_RETRIES - 1:
                wait = _BACKOFF_BASE ** attempt
                logger.warning("Gmail API rate limit / server error. Retrying in %.1fs…", wait)
                time.sleep(wait)
            else:
                raise


def get_gmail_service(creds: Credentials):
    return build("gmail", "v1", credentials=creds)


def _decode_body(payload: dict) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    import base64
    mime_type = payload.get("mimeType", "")
    body = payload.get("body", {})
    parts = payload.get("parts", [])

    if mime_type == "text/plain" and body.get("data"):
        return base64.urlsafe_b64decode(body["data"]).decode("utf-8", errors="replace")

    if mime_type == "text/html" and body.get("data") and not parts:
        return base64.urlsafe_b64decode(body["data"]).decode("utf-8", errors="replace")

    for part in parts:
        if part.get("mimeType") == "text/plain":
            result = _decode_body(part)
            if result:
                return result

    for part in parts:
        result = _decode_body(part)
        if result:
            return result

    return ""


def fetch_emails(creds: Credentials, max_emails: int = 500) -> Generator[dict, None, None]:
    """
    Yield email dicts from the authenticated user's inbox.
    Each dict: id, thread_id, subject, sender, date, snippet, labels, body.
    """
    service = get_gmail_service(creds)
    fetched = 0
    page_token = None

    while fetched < max_emails:
        batch_size = min(100, max_emails - fetched)
        params = {
            "userId": "me",
            "maxResults": batch_size,
            "labelIds": ["INBOX"],
        }
        if page_token:
            params["pageToken"] = page_token

        result = _retry(service.users().messages().list(**params).execute)
        messages = result.get("messages", [])
        if not messages:
            break

        for msg_ref in messages:
            if fetched >= max_emails:
                break
            try:
                msg = _retry(
                    service.users().messages().get(
                        userId="me",
                        id=msg_ref["id"],
                        format="full",
                    ).execute
                )
                headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
                body = _decode_body(msg.get("payload", {}))

                yield {
                    "id": msg["id"],
                    "thread_id": msg.get("threadId", ""),
                    "subject": headers.get("subject", "(no subject)"),
                    "sender": headers.get("from", ""),
                    "date": headers.get("date", ""),
                    "snippet": msg.get("snippet", ""),
                    "labels": msg.get("labelIds", []),
                    "body": body,
                }
                fetched += 1
            except HttpError as e:
                logger.warning("Failed to fetch message %s: %s", msg_ref["id"], e)

        page_token = result.get("nextPageToken")
        if not page_token:
            break

    logger.info("Fetched %d emails", fetched)
