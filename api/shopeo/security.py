import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque
from threading import Lock
from urllib.parse import urlsplit
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import HTTPException, Request, Response, Depends
from sqlalchemy.orm import Session as DBSession
from .db import get_db, SessionLocal, engine
from .models import Session, User, RateBucket
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

ph = PasswordHasher()
COOKIE = "shopeo_session"
CSRF = "shopeo_csrf"
LOCAL_DEMO = (
    os.environ.get("LOCAL_DEMO", "0" if os.environ.get("VERCEL") else "1") == "1"
)
SECURE = (
    os.environ.get("COOKIE_SECURE", "1" if os.environ.get("VERCEL") else "0") == "1"
)
PAYMENTS_SIMULATED = os.environ.get("PAYMENTS_SIMULATED", "1") == "1"
if os.environ.get("VERCEL") and LOCAL_DEMO:
    raise RuntimeError(
        "Les raccourcis administrateur locaux sont interdits sur Vercel."
    )
ALLOWED_ORIGINS = set(
    os.environ.get(
        "ALLOWED_ORIGINS",
        "http://127.0.0.1:3100,http://localhost:3100,http://127.0.0.1:8100",
    ).split(",")
)
_attempts = defaultdict(deque)
_lock = Lock()
_dummy_hash = ph.hash(secrets.token_urlsafe(30))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_ok(hashed, supplied):
    try:
        return ph.verify(hashed or _dummy_hash, supplied)
    except (VerificationError, InvalidHashError):
        return False


def limit(request, bucket, count=15, seconds=60):
    current = int(time.time())
    ip = request.client.host if request.client else "unknown"
    proxy_secret = os.environ.get("INTERNAL_PROXY_SECRET", "")
    if len(proxy_secret) >= 32 and hmac.compare_digest(
        request.headers.get("x-shopeo-proxy-token", ""), proxy_secret
    ):
        ip = request.headers.get("x-shopeo-client-ip", ip)
    key = digest(f"{bucket}:{ip}:{current // seconds}")
    factory = postgres_insert if engine.dialect.name == "postgresql" else sqlite_insert
    statement = factory(RateBucket).values(
        id=key, hits=1, expires_at=current + seconds * 2
    )
    statement = statement.on_conflict_do_update(
        index_elements=[RateBucket.id], set_={"hits": RateBucket.hits + 1}
    ).returning(RateBucket.hits)
    with SessionLocal.begin() as db:
        hits = db.scalar(statement)
        if secrets.randbelow(30) == 0:
            db.execute(delete(RateBucket).where(RateBucket.expires_at < current))
    if hits > count:
        raise HTTPException(
            429, "Trop de tentatives. Réessayez dans quelques instants."
        )


def ensure_csrf(request: Request):
    origin = request.headers.get("origin")
    internal_secret = os.environ.get("INTERNAL_PROXY_SECRET", "")
    trusted_proxy = len(internal_secret) >= 32 and hmac.compare_digest(
        request.headers.get("x-shopeo-proxy-token", ""), internal_secret
    )
    if origin and origin not in ALLOWED_ORIGINS and not trusted_proxy:
        raise HTTPException(403, "Origine non autorisée.")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "Requête intersite refusée.")
    cookie, header = (
        request.cookies.get(CSRF, ""),
        request.headers.get("x-shopeo-csrf", ""),
    )
    if not cookie or not hmac.compare_digest(cookie, header):
        raise HTTPException(403, "Session de formulaire expirée. Rechargez la page.")


def csrf_cookie(request, response):
    value = request.cookies.get(CSRF) or secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF,
        value,
        httponly=False,
        secure=SECURE,
        samesite="lax",
        max_age=43200,
        path="/",
    )
    return value


def current_user(request: Request, db: DBSession = Depends(get_db, scope="function")):
    token = request.cookies.get(COOKIE)
    session = db.get(Session, digest(token)) if token else None
    if session and session.expires_at > time.time():
        return db.get(User, session.user_id)
    return None


def require_user(user=Depends(current_user)):
    if not user:
        raise HTTPException(401, "Connectez-vous pour continuer.")
    return user


def require_admin(user=Depends(require_user)):
    if user.role != "admin":
        raise HTTPException(403, "Accès réservé à l’administration.")
    return user


def login_session(db, user, response):
    token = secrets.token_urlsafe(40)
    db.add(
        Session(
            token_hash=digest(token),
            user_id=user.id,
            expires_at=int(time.time()) + 43200,
        )
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=SECURE,
        samesite="lax",
        max_age=43200,
        path="/",
    )
    response.set_cookie(
        CSRF,
        secrets.token_urlsafe(32),
        httponly=False,
        secure=SECURE,
        samesite="lax",
        max_age=43200,
        path="/",
    )


def public_user(user):
    return (
        {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
        if user
        else None
    )
