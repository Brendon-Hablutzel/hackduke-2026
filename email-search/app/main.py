"""FastAPI application with Google OAuth 2.0 sign-in and multi-inbox support."""

import logging
import mimetypes
from pathlib import Path
from typing import Optional

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response
from starlette.middleware.sessions import SessionMiddleware

from app.auth import (
    clear_session,
    fetch_user_info,
    get_current_user,
    load_token,
    make_flow,
    save_token,
    set_session_user,
)
from app.config import config
from app.indexer import load_stats, run_indexing
from app.inboxes import (
    add_inbox,
    ensure_primary,
    get_inbox,
    inbox_scope,
    load_inboxes,
    remove_inbox,
    set_primary,
)
from app.search import search
from app.todos import count_todos, query_todos
from app.vectordb import collection_count

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = FastAPI(title="Email Semantic Search", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=config.SECRET_KEY, max_age=60 * 60 * 24 * 30)


# Per-scope background indexing state keyed by inbox scope string
_indexing: dict[str, dict] = {}

_avatar_cache_dir = Path(config.DATA_DIR) / "avatars"


def _get_user_or_401(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _get_creds_or_401(scope: str):
    creds = load_token(scope)
    if not creds or not creds.valid:
        raise HTTPException(status_code=401, detail="Gmail token expired. Please sign in again.")
    return creds


def _resolve_inboxes(user_sub: str, inbox_ids_param: Optional[str]) -> list:
    all_inboxes = load_inboxes(user_sub)
    if not inbox_ids_param:
        return all_inboxes
    selected = set(inbox_ids_param.split(","))
    return [i for i in all_inboxes if i["id"] in selected]


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.get("/auth/login")
async def auth_login(request: Request):
    flow = make_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    request.session["oauth_state"] = state
    request.session["oauth_purpose"] = "login"
    return RedirectResponse(auth_url)


@app.get("/auth/add_inbox")
async def auth_add_inbox(request: Request):
    _get_user_or_401(request)
    flow = make_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="select_account consent",
    )
    request.session["oauth_state"] = state
    request.session["oauth_purpose"] = "add_inbox"
    return RedirectResponse(auth_url)


@app.get("/auth/callback")
async def auth_callback(request: Request, code: str = Query(...), state: str = Query(...)):
    stored_state = request.session.pop("oauth_state", None)
    if stored_state != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch. Please try signing in again.")

    purpose = request.session.pop("oauth_purpose", "login")

    flow = make_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    user_info = await fetch_user_info(creds.token)
    email = user_info.get("email", "")
    name = user_info.get("name", "")
    picture = user_info.get("picture", "")

    if purpose == "add_inbox":
        current_user = get_current_user(request)
        if not current_user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        sub = current_user["sub"]
        inbox = add_inbox(sub, email, name, picture)
        save_token(inbox_scope(sub, inbox["id"]), creds)
        logger.info("Inbox added for user %s: %s", sub, email)
    else:
        sub = user_info["sub"]
        save_token(sub, creds)
        ensure_primary(sub, email, name, picture)
        set_session_user(request, {
            "sub": sub,
            "email": email,
            "name": name,
            "picture": picture,
        })
        logger.info("User signed in: %s", email)

    return RedirectResponse("/")


@app.get("/auth/logout")
async def auth_logout(request: Request):
    clear_session(request)
    return RedirectResponse("/")


@app.get("/auth/me")
async def auth_me(request: Request):
    user = get_current_user(request)
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, "user": user}


@app.get("/auth/avatar")
async def auth_avatar(request: Request):
    user = _get_user_or_401(request)
    picture_url = user.get("picture", "")
    if not picture_url:
        raise HTTPException(status_code=404, detail="No profile picture")

    user_sub = user["sub"]
    _avatar_cache_dir.mkdir(parents=True, exist_ok=True)

    cached = next(_avatar_cache_dir.glob(f"{user_sub}.*"), None)
    if cached:
        content_type = mimetypes.guess_type(cached.name)[0] or "image/jpeg"
        return Response(content=cached.read_bytes(), media_type=content_type,
                        headers={"Cache-Control": "public, max-age=86400"})

    async with httpx.AsyncClient() as client:
        r = await client.get(picture_url, timeout=10, follow_redirects=True)
        r.raise_for_status()

    content_type = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    ext = mimetypes.guess_extension(content_type) or ".jpg"
    if ext in (".jpe", ".jpeg"):
        ext = ".jpg"

    cache_path = _avatar_cache_dir / f"{user_sub}{ext}"
    cache_path.write_bytes(r.content)
    return Response(content=r.content, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=86400"})


# ---------------------------------------------------------------------------
# Inbox management routes
# ---------------------------------------------------------------------------

@app.get("/inboxes")
async def get_inboxes(request: Request):
    user = _get_user_or_401(request)
    # Migrate existing sessions: ensure the primary inbox record exists even if
    # the user logged in before multi-inbox support was added.
    ensure_primary(user["sub"], user.get("email", ""), user.get("name", ""), user.get("picture", ""))
    return {"inboxes": load_inboxes(user["sub"])}


@app.delete("/inboxes/{inbox_id}")
async def delete_inbox(request: Request, inbox_id: str):
    user = _get_user_or_401(request)
    sub = user["sub"]
    if inbox_id == sub:
        raise HTTPException(status_code=400, detail="Cannot remove your primary account.")
    remove_inbox(sub, inbox_id)
    return {"status": "removed"}


@app.post("/inboxes/{inbox_id}/primary")
async def make_primary(request: Request, inbox_id: str):
    user = _get_user_or_401(request)
    set_primary(user["sub"], inbox_id)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# App routes
# ---------------------------------------------------------------------------



@app.get("/health")
async def health(request: Request):
    user = get_current_user(request)
    count = 0
    if user:
        try:
            inboxes = load_inboxes(user["sub"])
            count = sum(
                collection_count(inbox_scope(user["sub"], i["id"]))
                for i in inboxes
            )
        except ConnectionError as e:
            raise HTTPException(status_code=503, detail=str(e))
    return {"status": "ok", "indexed_emails": count}


@app.get("/stats")
async def stats(request: Request, inbox_ids: Optional[str] = Query(default=None)):
    user = _get_user_or_401(request)
    sub = user["sub"]
    inboxes = _resolve_inboxes(sub, inbox_ids)

    total_indexed = 0
    last_sync = None
    for inbox in inboxes:
        scope = inbox_scope(sub, inbox["id"])
        data = load_stats(scope)
        try:
            total_indexed += collection_count(scope)
        except ConnectionError:
            pass
        sync = data.get("last_sync")
        if sync and (last_sync is None or sync > last_sync):
            last_sync = sync

    return {"indexed_count": total_indexed, "last_sync": last_sync}


@app.post("/index")
async def trigger_index(
    request: Request,
    background_tasks: BackgroundTasks,
    inbox_id: Optional[str] = Query(default=None),
    max_emails: Optional[int] = Query(default=None),
):
    user = _get_user_or_401(request)
    sub = user["sub"]
    inboxes = load_inboxes(sub)
    if not inboxes:
        raise HTTPException(status_code=400, detail="No inboxes connected.")

    if inbox_id is None:
        target = next((i for i in inboxes if i.get("is_primary")), inboxes[0])
        inbox_id = target["id"]

    if not get_inbox(sub, inbox_id):
        raise HTTPException(status_code=404, detail="Inbox not found.")

    scope = inbox_scope(sub, inbox_id)
    if _indexing.get(scope, {}).get("running"):
        return {"status": "already_running"}

    creds = _get_creds_or_401(scope)
    limit = max_emails or config.MAX_EMAILS

    def _run():
        _indexing[scope] = {"running": True, "result": None, "error": None}
        try:
            result = run_indexing(creds=creds, user_sub=scope, max_emails=limit)
            _indexing[scope]["result"] = result
        except Exception as e:
            logger.exception("Indexing failed for scope %s", scope)
            _indexing[scope]["error"] = str(e)
        finally:
            _indexing[scope]["running"] = False

    background_tasks.add_task(_run)
    return {"status": "started", "inbox_id": inbox_id, "max_emails": limit}


@app.get("/index/status")
async def index_status(request: Request, inbox_id: Optional[str] = Query(default=None)):
    user = _get_user_or_401(request)
    sub = user["sub"]
    inboxes = load_inboxes(sub)

    if inbox_id:
        scope = inbox_scope(sub, inbox_id)
        return _indexing.get(scope, {"running": False, "result": None, "error": None})

    return {
        i["id"]: _indexing.get(inbox_scope(sub, i["id"]), {"running": False, "result": None, "error": None})
        for i in inboxes
    }


@app.get("/todos")
async def todos(
    request: Request,
    days: int = Query(default=7, ge=1, le=30),
    inbox_ids: Optional[str] = Query(default=None),
):
    user = _get_user_or_401(request)
    sub = user["sub"]
    inboxes = _resolve_inboxes(sub, inbox_ids)

    merged: dict = {"next_24h": [], "next_week": [], "undated": []}
    total = 0
    for inbox in inboxes:
        scope = inbox_scope(sub, inbox["id"])
        try:
            result = query_todos(user_sub=scope, days=days)
            for bucket in ("next_24h", "next_week", "undated"):
                merged[bucket].extend(result[bucket])
            total += count_todos(scope)
        except Exception as e:
            logger.warning("Todos query failed for scope %s: %s", scope, e)

    for bucket in ("next_24h", "next_week"):
        merged[bucket].sort(key=lambda t: t.get("deadline_date") or "")

    merged["total"] = total
    return merged


@app.get("/search")
async def search_emails(
    request: Request,
    q: str = Query(..., min_length=1),
    k: int = Query(default=10, ge=1, le=100),
    inbox_ids: Optional[str] = Query(default=None),
):
    user = _get_user_or_401(request)
    sub = user["sub"]
    inboxes = _resolve_inboxes(sub, inbox_ids)

    all_results = []
    for inbox in inboxes:
        scope = inbox_scope(sub, inbox["id"])
        try:
            results = search(q.strip(), user_sub=scope, k=k)
            for r in results:
                r["inbox_id"] = inbox["id"]
                r["inbox_email"] = inbox["email"]
            all_results.extend(results)
        except ConnectionError:
            pass
        except Exception as e:
            logger.warning("Search failed for scope %s: %s", scope, e)

    all_results.sort(key=lambda r: r["score"], reverse=True)
    all_results = all_results[:k]
    for i, r in enumerate(all_results, 1):
        r["rank"] = i

    return {"query": q, "k": k, "results": all_results}
