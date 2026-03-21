"""Email pre-processing: strip HTML, signatures, quoted replies, and summarize long emails."""

import re
import textwrap
from bs4 import BeautifulSoup


# Common signature patterns
_SIG_PATTERNS = [
    re.compile(r"^--\s*$", re.MULTILINE),                     # -- separator
    re.compile(r"^(Sent from|Get Outlook|Regards|Best,|Cheers,|Thanks,|Sincerely,)", re.MULTILINE | re.IGNORECASE),
]

# Quoted reply indicators
_QUOTE_PATTERNS = [
    re.compile(r"^On .+wrote:.*$", re.MULTILINE | re.DOTALL),  # "On Mon, Jan 1 ... wrote:"
    re.compile(r"^>.*$", re.MULTILINE),                          # > quoted lines
    re.compile(r"^_{5,}$", re.MULTILINE),                        # underline separators
    re.compile(r"From:.*Sent:.*To:.*Subject:", re.DOTALL),       # Outlook forward header
]


def strip_html(text: str) -> str:
    if "<" in text and ">" in text:
        soup = BeautifulSoup(text, "lxml")
        # Remove script/style noise
        for tag in soup(["script", "style", "head"]):
            tag.decompose()
        text = soup.get_text(separator=" ")
    return text


def strip_quoted_replies(text: str) -> str:
    for pat in _QUOTE_PATTERNS:
        text = pat.sub("", text)
    return text


def strip_signature(text: str) -> str:
    for pat in _SIG_PATTERNS:
        match = pat.search(text)
        if match:
            text = text[: match.start()]
            break
    return text


def clean_whitespace(text: str) -> str:
    # Collapse multiple blank lines and trim
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def preprocess(body: str) -> str:
    text = strip_html(body)
    text = strip_quoted_replies(text)
    text = strip_signature(text)
    text = clean_whitespace(text)
    return text


def _word_count(text: str) -> int:
    return len(text.split())


def summarize_if_long(text: str, max_words: int = 500, target_words: int = 150) -> str:
    """
    Simple extractive summarization for long emails:
    take first N sentences until we hit ~target_words.
    This avoids any external API calls.
    """
    if _word_count(text) <= max_words:
        return text

    sentences = re.split(r"(?<=[.!?])\s+", text)
    summary_parts = []
    word_count = 0
    for sentence in sentences:
        words = len(sentence.split())
        if word_count + words > target_words and summary_parts:
            break
        summary_parts.append(sentence)
        word_count += words

    return " ".join(summary_parts)
