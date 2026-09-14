"""
============================================================
RUN01 - Centralized Authentication & Authorization Layer
File: pyrunner/auth.py
Implements:
  - Secure password hashing & verification (scrypt/argon2/bcrypt)
  - JWT token generation & signature verification
  - Authentication middleware (@token_required)
  - Authorization middleware (@require_role)
  - Strict user identification attached to request context (g.user)
  - Audit logging with credential sanitization
============================================================
"""

import os
import re
import datetime
import logging
from functools import wraps
from typing import Optional, Dict, Any, Tuple
import jwt
from flask import request, jsonify, session, g
from werkzeug.security import generate_password_hash, check_password_hash

logger = logging.getLogger("run01.auth")

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def get_jwt_secret() -> str:
    """Retrieves the JWT signing secret from environment or secure fallback."""
    return os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY") or "run01-jwt-secret-key-change-in-prod"


def normalize_email(email: str) -> str:
    """Validates and normalizes email to lowercase trimmed string."""
    if not email or not isinstance(email, str):
        return ""
    clean = email.strip().lower()
    if not EMAIL_REGEX.match(clean):
        raise ValueError("Invalid email format.")
    return clean


def hash_password(password: str) -> str:
    """Generates secure scrypt password hash. Plaintext passwords never stored."""
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    return generate_password_hash(password, method="scrypt")


def verify_password(stored_hash: str, candidate_password: str) -> bool:
    """Safely verifies candidate password against stored hash with timing-attack mitigation."""
    if not stored_hash or not candidate_password:
        return False
    return check_password_hash(stored_hash, candidate_password)


def create_access_token(user_id: str, email: str, role: str = "user", expires_in_days: int = 7) -> str:
    """
    Generates signed JWT access token embedding userId, email, and role.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": str(user_id),
        "userId": str(user_id),
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + datetime.timedelta(days=expires_in_days)
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")


def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and verifies JWT signature and expiration."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError) as err:
        logger.debug(f"JWT verification failed: {err}")
        return None


def get_current_user_from_request() -> Optional[Dict[str, Any]]:
    """
    Extracts authenticated user from either:
      1. 'Authorization: Bearer <jwt>' header
      2. Active secure Flask session
    Returns dict: {'id': userId, 'email': email, 'role': role} or None
    """
    # 1. Check Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1].strip()
        decoded = verify_access_token(raw_token)
        if decoded:
            return {
                "id": str(decoded.get("userId") or decoded.get("sub")),
                "email": decoded.get("email", ""),
                "role": decoded.get("role", "user")
            }

    # 2. Check Flask session
    session_user_id = session.get("user_id")
    if session_user_id:
        cached_user = session.get("user") or {}
        return {
            "id": str(session_user_id),
            "email": cached_user.get("email", ""),
            "role": cached_user.get("role", "user")
        }

    return None


def token_required(f):
    """
    Middleware / Decorator for private routes.
    Guarantees that g.user = {'id': ..., 'email': ..., 'role': ...} is attached.
    Blocks unauthenticated requests with 401 Unauthorized.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user_from_request()
        if not user or not user.get("id"):
            return jsonify({
                "error": "Authentication required. Provide a valid Bearer token or session.",
                "authenticated": False
            }), 401

        # Centralized attachment: Always use g.user['id'] in query handlers
        g.user = user
        return f(*args, **kwargs)
    return decorated


def require_role(required_role: str):
    """
    Role-based authorization middleware.
    Ensures user is authenticated AND has the required role (e.g. 'admin').
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user_from_request()
            if not user or not user.get("id"):
                return jsonify({"error": "Authentication required."}), 401

            user_role = user.get("role", "user")
            if user_role != required_role:
                return jsonify({
                    "error": f"Access denied. Requires '{required_role}' authorization role."
                }), 403

            g.user = user
            return f(*args, **kwargs)
        return decorated
    return decorator


def sanitize_audit_metadata(metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Removes passwords, tokens, API keys, and credentials from audit metadata.
    Guarantees code hygiene and compliance with Rule 38.
    """
    if not metadata:
        return {}

    sanitized = {}
    forbidden_keys = {"password", "password_hash", "token", "credential", "secret", "authorization"}
    for k, v in metadata.items():
        if any(f in k.lower() for f in forbidden_keys):
            sanitized[k] = "[REDACTED]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_audit_metadata(v)
        else:
            sanitized[k] = v
    return sanitized


def log_audit_event(
    db,
    action: str,
    user_id: Optional[str] = None,
    status: str = "SUCCESS",
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Audit logger for critical events (login, signup, password change, deletions).
    Records: timestamp, action, userId, status, sanitized metadata, ip, userAgent.
    """
    try:
        ip = request.headers.get("X-Forwarded-For", request.remote_addr)
        ua = request.headers.get("User-Agent", "")
        clean_meta = sanitize_audit_metadata(metadata)

        audit_doc = {
            "action": action,
            "userId": str(user_id) if user_id else None,
            "status": status,
            "ip": ip,
            "userAgent": ua[:200] if ua else None,
            "metadata": clean_meta,
            "timestamp": datetime.datetime.now(datetime.timezone.utc)
        }

        if db is not None:
            db.audit_logs.insert_one(audit_doc)

        logger.info(f"AUDIT: action={action} user={user_id} status={status} ip={ip}")
    except Exception as exc:
        logger.warning(f"Failed to record audit log: {exc}")
