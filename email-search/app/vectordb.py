"""ChromaDB client — per-user collections."""

import logging
from typing import List, Optional

import chromadb
from chromadb.config import Settings

from app.config import config

logger = logging.getLogger(__name__)


def _get_client() -> chromadb.HttpClient:
    try:
        client = chromadb.HttpClient(
            host=config.CHROMA_HOST,
            port=config.CHROMA_PORT,
            settings=Settings(anonymized_telemetry=False),
        )
        client.heartbeat()
        return client
    except Exception as e:
        raise ConnectionError(
            f"Cannot connect to ChromaDB at {config.CHROMA_HOST}:{config.CHROMA_PORT}. "
            f"Is the chromadb service running? Error: {e}"
        )


def _collection_name(user_sub: str) -> str:
    # Keep name safe for ChromaDB (alphanumeric + underscore, max 63 chars)
    safe = user_sub.replace("-", "").replace(".", "")[:24]
    return f"{config.CHROMA_COLLECTION_PREFIX}_{safe}"


def get_collection(user_sub: str):
    client = _get_client()
    return client.get_or_create_collection(
        name=_collection_name(user_sub),
        metadata={"hnsw:space": "cosine"},
    )


def get_indexed_ids(user_sub: str) -> set:
    try:
        col = get_collection(user_sub)
        result = col.get(include=["metadatas"])
        return {m["gmail_message_id"] for m in result["metadatas"] if "gmail_message_id" in m}
    except Exception as e:
        logger.warning("Could not fetch indexed IDs: %s", e)
        return set()


def upsert_emails(
    user_sub: str,
    ids: List[str],
    embeddings: List[List[float]],
    documents: List[str],
    metadatas: List[dict],
) -> None:
    col = get_collection(user_sub)
    col.upsert(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)


def query_collection(user_sub: str, embedding: List[float], k: int = 10) -> dict:
    col = get_collection(user_sub)
    n = min(k, col.count() or 1)
    return col.query(
        query_embeddings=[embedding],
        n_results=n,
        include=["documents", "metadatas", "distances"],
    )


def collection_count(user_sub: str) -> int:
    try:
        return get_collection(user_sub).count()
    except Exception:
        return 0
