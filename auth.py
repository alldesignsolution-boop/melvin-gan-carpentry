"""
Simple session-based auth.
- Login returns a signed token (username:role:timestamp HMAC).
- Each protected request validates the token from cookie or Authorization header.
- Admin sees all leads; sales sees only their assigned leads.
"""
import os, hmac, hashlib, time
from fastapi import Request, HTTPException, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from database import get_db
from models import User

SECRET = os.getenv("SESSION_SECRET", "melvin_session_secret_change_me")


def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def make_token(username: str, role: str) -> str:
    payload = f"{username}:{role}:{int(time.time())}"
    sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def verify_token(token: str) -> dict | None:
    try:
        parts = token.rsplit(":", 1)
        if len(parts) != 2:
            return None
        payload, sig = parts
        expected = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        username, role, ts = payload.split(":", 2)
        # Token valid for 12 hours
        if time.time() - int(ts) > 43200:
            return None
        return {"username": username, "role": role}
    except Exception:
        return None


def get_current_user(request: Request) -> dict:
    token = request.cookies.get("melvin_session")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def require_write(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] == "viewer":
        raise HTTPException(status_code=403, detail="View-only access — this account cannot make changes")
    return user


def authenticate_user(username: str, password: str, db: Session) -> User | None:
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        return None
    if not hmac.compare_digest(user.password_hash, hash_pw(password)):
        return None
    return user
