"""FastAPI application with Google OAuth 2.0 sign-in."""

import logging
import mimetypes
from pathlib import Path
from typing import Optional

import httpx

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
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
from app.search import search
from app.todos import get_todos
from app.vectordb import collection_count

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = FastAPI(title="Email Semantic Search", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=config.SECRET_KEY, max_age=60 * 60 * 24 * 30)

# Per-user background indexing state
_indexing: dict[str, dict] = {}


def _get_user_or_401(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _get_creds_or_401(user_sub: str):
    creds = load_token(user_sub)
    if not creds or not creds.valid:
        raise HTTPException(status_code=401, detail="Gmail token expired. Please sign in again.")
    return creds


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
    return RedirectResponse(auth_url)


@app.get("/auth/callback")
async def auth_callback(request: Request, code: str = Query(...), state: str = Query(...)):
    stored_state = request.session.pop("oauth_state", None)
    if stored_state != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch. Please try signing in again.")

    flow = make_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    user_info = await fetch_user_info(creds.token)
    user_sub = user_info["sub"]

    save_token(user_sub, creds)
    set_session_user(request, {
        "sub": user_sub,
        "email": user_info.get("email", ""),
        "name": user_info.get("name", ""),
        "picture": user_info.get("picture", ""),
    })

    logger.info("User signed in: %s", user_info.get("email"))
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


_avatar_cache_dir = Path(config.DATA_DIR) / "avatars"


@app.get("/auth/avatar")
async def auth_avatar(request: Request):
    """Serve the user's profile picture, cached locally to avoid Google rate limits."""
    user = _get_user_or_401(request)
    picture_url = user.get("picture", "")
    if not picture_url:
        raise HTTPException(status_code=404, detail="No profile picture")

    user_sub = user["sub"]
    _avatar_cache_dir.mkdir(parents=True, exist_ok=True)

    # Check for an already-cached file (any extension)
    cached = next(_avatar_cache_dir.glob(f"{user_sub}.*"), None)
    if cached:
        content_type = mimetypes.guess_type(cached.name)[0] or "image/jpeg"
        return Response(content=cached.read_bytes(), media_type=content_type,
                        headers={"Cache-Control": "public, max-age=86400"})

    # Download from Google and cache
    async with httpx.AsyncClient() as client:
        r = await client.get(picture_url, timeout=10, follow_redirects=True)
        r.raise_for_status()

    content_type = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    ext = mimetypes.guess_extension(content_type) or ".jpg"
    # mimetypes sometimes returns .jpe / .jpeg — normalise
    if ext in (".jpe", ".jpeg"):
        ext = ".jpg"

    cache_path = _avatar_cache_dir / f"{user_sub}{ext}"
    cache_path.write_bytes(r.content)

    return Response(content=r.content, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=86400"})


# ---------------------------------------------------------------------------
# App routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health(request: Request):
    user = get_current_user(request)
    count = 0
    if user:
        try:
            count = collection_count(user["sub"])
        except ConnectionError as e:
            raise HTTPException(status_code=503, detail=str(e))
    return {"status": "ok", "indexed_emails": count}


@app.get("/stats")
async def stats(request: Request):
    user = _get_user_or_401(request)
    data = load_stats(user["sub"])
    try:
        data["indexed_count"] = collection_count(user["sub"])
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return data


@app.post("/index")
async def trigger_index(
    request: Request,
    background_tasks: BackgroundTasks,
    max_emails: Optional[int] = Query(default=None),
):
    user = _get_user_or_401(request)
    sub = user["sub"]

    if _indexing.get(sub, {}).get("running"):
        return {"status": "already_running"}

    creds = _get_creds_or_401(sub)
    limit = max_emails or config.MAX_EMAILS

    def _run():
        _indexing[sub] = {"running": True, "result": None, "error": None}
        try:
            result = run_indexing(creds=creds, user_sub=sub, max_emails=limit)
            _indexing[sub]["result"] = result
        except Exception as e:
            logger.exception("Indexing failed for user %s", sub)
            _indexing[sub]["error"] = str(e)
        finally:
            _indexing[sub]["running"] = False

    background_tasks.add_task(_run)
    return {"status": "started", "max_emails": limit}


@app.get("/index/status")
async def index_status(request: Request):
    user = _get_user_or_401(request)
    return _indexing.get(user["sub"], {"running": False, "result": None, "error": None})


@app.get("/todos")
async def todos(
    request: Request,
    n: int = Query(default=20, ge=1, le=200),
):
    user = _get_user_or_401(request)
    try:
        items = get_todos(user_sub=user["sub"], n=n)
        return {"n": n, "items": items}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Todos failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search")
async def search_emails(
    request: Request,
    q: str = Query(..., min_length=1),
    k: int = Query(default=10, ge=1, le=100),
):
    user = _get_user_or_401(request)
    try:
        results = search(q.strip(), user_sub=user["sub"], k=k)
        return {"query": q, "k": k, "results": results}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=str(e))
