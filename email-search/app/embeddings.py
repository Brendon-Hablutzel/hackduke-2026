"""Sentence Transformers wrapper — singleton to avoid reloading the model."""

import logging
from functools import lru_cache
from typing import List

from sentence_transformers import SentenceTransformer

from app.config import config

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    logger.info("Loading embedding model: %s", config.EMBEDDING_MODEL)
    return SentenceTransformer(config.EMBEDDING_MODEL)


def embed_texts(texts: List[str]) -> List[List[float]]:
    model = _get_model()
    embeddings = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
    return embeddings.tolist()


def embed_query(query: str) -> List[float]:
    return embed_texts([query])[0]
