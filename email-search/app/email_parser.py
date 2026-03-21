"""Parse an email into structured fields using Gemini structured outputs."""

import logging
from enum import Enum
from typing import Optional

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.config import config

logger = logging.getLogger(__name__)


class Priority(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class ParsedEmail(BaseModel):
    title: str
    details: str
    due_date: Optional[str] = None
    location: Optional[str] = None
    priority: Priority


def parse_email(subject: str, body: str, sender: str = "", date: str = "") -> ParsedEmail:
    """
    Use Gemini to extract structured information from an email.

    Args:
        subject: Email subject line.
        body: Cleaned email body text.
        sender: From address (optional, provides context).
        date: Email date string (optional, helps resolve relative dates).

    Returns:
        ParsedEmail with title, details, due_date, location, and priority.
    """
    client = genai.Client(api_key=config.GEMINI_API_KEY)

    prompt = f"""You are an assistant that extracts structured information from emails.

Email metadata:
- From: {sender or '(unknown)'}
- Date: {date or '(unknown)'}
- Subject: {subject or '(no subject)'}

Email body:
{body[:4000]}

Extract the following fields:
- title: A short, clear title for what this email is about (max 80 chars).
- details: A concise summary of the key information or requested action (max 300 chars).
- due_date: The deadline or event date if mentioned, as an ISO 8601 date (YYYY-MM-DD). Null if none.
- location: A physical or virtual location if mentioned (e.g. room, Zoom link description). Null if none.
- priority: One of "high", "medium", or "low" based on urgency and importance."""

    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParsedEmail,
        ),
    )

    return ParsedEmail.model_validate_json(response.text)
