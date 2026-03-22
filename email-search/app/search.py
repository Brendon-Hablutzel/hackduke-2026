"""Hybrid search: vector similarity + BM25 re-ranking, scoped per user."""

import logging
from typing import List, Optional

from rank_bm25 import BM25Okapi

from app.embeddings import embed_query
from app.vectordb import collection_count, query_collection

logger = logging.getLogger(__name__)


def _tokenize(text: str) -> List[str]:
    return text.lower().split()


def _bm25_scores(query: str, documents: List[str]) -> List[float]:
    if not documents:
        return []
    bm25 = BM25Okapi([_tokenize(d) for d in documents])
    return bm25.get_scores(_tokenize(query)).tolist()


def _cosine_score(distance: float) -> float:
    return max(0.0, 1.0 - distance)


def search(query: str, user_sub: str, k: int = 10,
           from_filter: Optional[str] = None,
           has_attachment: Optional[bool] = None) -> List[dict]:
    """Hybrid search for a specific user's indexed emails."""
    count = collection_count(user_sub)
    if count == 0:
        return []

    candidate_k = min(max(k * 10, 100), count)
    embedding = embed_query(query)

    try:
        raw = query_collection(user_sub, embedding, k=candidate_k)
    except Exception as e:
        logger.error("ChromaDB query failed: %s", e)
        raise

    ids = raw["ids"][0]
    metadatas = raw["metadatas"][0]
    documents = raw["documents"][0]
    distances = raw["distances"][0]

    if not ids:
        return []

    vector_scores = [_cosine_score(d) for d in distances]

    bm25_raw = _bm25_scores(query, documents)
    bm25_max = max(bm25_raw) if bm25_raw and max(bm25_raw) > 0 else 1.0
    bm25_norm = [s / bm25_max for s in bm25_raw]

    blended = [0.7 * v + 0.3 * b for v, b in zip(vector_scores, bm25_norm)]

    results = [
        {
            "rank": i + 1,
            "id": doc_id,
            "subject": meta.get("subject", ""),
            "sender": meta.get("sender", ""),
            "date": meta.get("date", ""),
            "snippet": meta.get("snippet", ""),
            "labels": meta.get("labels", "[]"),
            "thread_id": meta.get("thread_id", ""),
            "has_attachment": bool(meta.get("has_attachment", 0)),
            "score": round(score, 4),
            "vector_score": round(vector_scores[i], 4),
            "bm25_score": round(bm25_norm[i], 4),
        }
        for i, (doc_id, meta, score) in enumerate(zip(ids, metadatas, blended))
    ]

    if from_filter:
        needle = from_filter.lower()
        results = [r for r in results if needle in r["sender"].lower()]

    if has_attachment is True:
        results = [r for r in results if r["has_attachment"]]

    results.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    return results
