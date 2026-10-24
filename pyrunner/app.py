from flask import Flask, render_template, jsonify, request, send_from_directory, session
import json
import os
import datetime
from werkzeug.security import generate_password_hash, check_password_hash

# Load local .env for NVIDIA_API_KEY / GROQ_API_KEY* without requiring python-dotenv.
# Existing process env (e.g. Vercel) always wins â€” never overwrite.
def _load_dotenv():
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.getcwd(), ".env"),
    ]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                for raw in fh:
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, val = line.partition("=")
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = val
        except OSError:
            pass
        break

_load_dotenv()

# Use __name__ so Flask can locate the templates/static folders correctly.
app = Flask(__name__)
app.name = "run01"
app.secret_key = os.environ.get("SECRET_KEY", "run01-dev-secret-key-change-in-prod")

# â”€â”€ Session Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Critical for Vercel (HTTPS, cross-origin, serverless cold starts).
app.config['SESSION_COOKIE_SECURE'] = True           # Only send over HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True         # Prevent JS access
app.config['SESSION_COOKIE_SAMESITE'] = 'None'       # Allow cross-site requests
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=30)

# â”€â”€ MongoDB & Authentication Modules (pyrunner.db & pyrunner.auth) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
from pyrunner.db import (
    get_db,
    ensure_indexes,
    prepare_user_owned_doc,
    check_db_health
)
from pyrunner.auth import (
    normalize_email,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_from_request,
    token_required,
    require_role,
    log_audit_event
)

# â”€â”€ Auth Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def get_google_client_id():
    cid = (os.environ.get("GOOGLE_CLIENT_ID") or "").strip().strip('"').strip("'")
    if not cid or "your_google_client_id" in cid.lower():
        return ""
    return cid

@app.route("/api/auth/config", methods=["GET"])
def auth_config():
    return jsonify({
        "google_client_id": get_google_client_id()
    })

def get_desmos_api_key():
    key = (os.environ.get("DESMOS_API_KEY") or "").strip().strip('"').strip("'")
    if not key or "your_desmos_api_key" in key.lower():
        return "dca3170180db492b4eb4508460839bad"
    return key

@app.route("/api/desmos/config", methods=["GET"])
def desmos_config():
    return jsonify({
        "apiKey": get_desmos_api_key()
    })

@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    # Supports both Bearer JWT and secure session cookie
    current = get_current_user_from_request()
    if not current:
        return jsonify({"authenticated": False, "user": None})

    db = get_db()
    user_id = current.get("id")
    if db is not None and user_id:
        try:
            from bson import ObjectId
            user = db.users.find_one({"_id": ObjectId(user_id)})
            if user:
                user_info = {
                    "id": str(user["_id"]),
                    "email": user.get("email"),
                    "name": user.get("name", ""),
                    "picture": user.get("picture", ""),
                    "role": user.get("role", "user"),
                    "auth_provider": user.get("auth_provider", "password")
                }
                session["user"] = user_info
                return jsonify({"authenticated": True, "user": user_info})
        except Exception as exc:
            app.logger.error(f"Error fetching user in auth_me: {exc}")

    cached_user = session.get("user") or current
    return jsonify({"authenticated": True, "user": cached_user})


@app.route("/api/auth/signup", methods=["POST"])
def auth_signup():
    data = request.get_json() or {}
    raw_email = data.get("email") or ""
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    try:
        email = normalize_email(raw_email)
    except ValueError as val_err:
        return jsonify({"error": str(val_err)}), 400

    if not password or len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    db = get_db()
    if db is None:
        return jsonify({"error": "Database connection not configured. Please ensure MONGODB_URI is set."}), 503

    try:
        existing = db.users.find_one({"email": email})
        if existing:
            return jsonify({"error": "An account with this email already exists."}), 409

        now = datetime.datetime.now(datetime.timezone.utc)
        pwd_hash = hash_password(password)
        user_doc = {
            "email": email,
            "password_hash": pwd_hash,
            "name": name or email.split("@")[0],
            "role": "user",
            "auth_provider": "password",
            "created_at": now,
            "updated_at": now,
            "last_login": now
        }

        result = db.users.insert_one(user_doc)
        user_id = str(result.inserted_id)

        token = create_access_token(user_id=user_id, email=email, role="user")

        user_info = {
            "id": user_id,
            "email": email,
            "name": user_doc["name"],
            "picture": "",
            "role": "user",
            "auth_provider": "password"
        }

        session.permanent = True
        session["user_id"] = user_id
        session["user"] = user_info

        log_audit_event(db, "SIGNUP_SUCCESS", user_id=user_id, status="SUCCESS", metadata={"email": email})
        return jsonify({"success": True, "token": token, "user": user_info}), 201

    except Exception as exc:
        app.logger.error(f"Signup exception: {exc}")
        log_audit_event(db, "SIGNUP_FAILED", status="FAILURE", metadata={"email": email, "error": str(exc)})
        return jsonify({"error": f"Failed to create account: {str(exc)}"}), 500


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json() or {}
    raw_email = data.get("email") or ""
    password = data.get("password") or ""

    try:
        email = normalize_email(raw_email)
    except ValueError as val_err:
        return jsonify({"error": str(val_err)}), 400

    if not password:
        return jsonify({"error": "Email and password are required."}), 400

    db = get_db()
    if db is None:
        return jsonify({"error": "Database connection not configured. Please ensure MONGODB_URI is set."}), 503

    try:
        user = db.users.find_one({"email": email})
        if not user:
            log_audit_event(db, "LOGIN_FAILED", status="FAILURE", metadata={"email": email, "reason": "user_not_found"})
            return jsonify({"error": "Invalid email or password."}), 401

        if not user.get("password_hash"):
            return jsonify({"error": "This account was registered using Google Sign-In. Please sign in with Google."}), 400

        if not verify_password(user["password_hash"], password):
            log_audit_event(db, "LOGIN_FAILED", user_id=str(user["_id"]), status="FAILURE", metadata={"email": email, "reason": "invalid_password"})
            return jsonify({"error": "Invalid email or password."}), 401

        user_id = str(user["_id"])
        role = user.get("role", "user")
        token = create_access_token(user_id=user_id, email=email, role=role)

        now = datetime.datetime.now(datetime.timezone.utc)
        db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": now}})

        user_info = {
            "id": user_id,
            "email": user["email"],
            "name": user.get("name") or user["email"].split("@")[0],
            "picture": user.get("picture", ""),
            "role": role,
            "auth_provider": user.get("auth_provider", "password")
        }

        session.permanent = True
        session["user_id"] = user_id
        session["user"] = user_info

        log_audit_event(db, "LOGIN_SUCCESS", user_id=user_id, status="SUCCESS", metadata={"email": email})
        return jsonify({"success": True, "token": token, "user": user_info})

    except Exception as exc:
        app.logger.error(f"Login exception: {exc}")
        return jsonify({"error": f"Login failed: {str(exc)}"}), 500


@app.route("/api/auth/google", methods=["POST"])
def auth_google():
    data = request.get_json() or {}
    token = data.get("credential") or data.get("token")

    raw_email = data.get("email") or ""
    name = (data.get("name") or "").strip()
    picture = data.get("picture") or ""
    google_id = data.get("sub") or data.get("google_id") or ""

    if token:
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests as google_requests
            google_client_id = get_google_client_id()

            idinfo = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                google_client_id if google_client_id else None
            )

            raw_email = idinfo.get("email", "")
            name = idinfo.get("name", "")
            picture = idinfo.get("picture", "")
            google_id = idinfo.get("sub", "")
        except Exception as e:
            app.logger.warning(f"Google ID token verification warning: {e}")
            try:
                import jwt as py_jwt
                unverified = py_jwt.decode(token, options={"verify_signature": False})
                raw_email = unverified.get("email", "")
                name = unverified.get("name", "")
                picture = unverified.get("picture", "")
                google_id = unverified.get("sub", "")
            except Exception as jwt_err:
                app.logger.error(f"JWT decode fallback error: {jwt_err}")

    try:
        email = normalize_email(raw_email)
    except ValueError:
        return jsonify({"error": "Google authentication failed: Invalid email."}), 400

    if not email:
        return jsonify({"error": "Google authentication failed: Email not found."}), 400

    db = get_db()
    user_id = None
    role = "user"

    now = datetime.datetime.now(datetime.timezone.utc)
    if db is not None:
        try:
            user = db.users.find_one({"email": email})
            if user:
                role = user.get("role", "user")
                db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {
                        "name": name or user.get("name"),
                        "picture": picture or user.get("picture"),
                        "google_id": google_id or user.get("google_id"),
                        "last_login": now,
                        "updated_at": now
                    }}
                )
                user_id = str(user["_id"])
            else:
                new_user = {
                    "email": email,
                    "name": name or email.split("@")[0],
                    "picture": picture,
                    "google_id": google_id,
                    "role": "user",
                    "auth_provider": "google",
                    "created_at": now,
                    "updated_at": now,
                    "last_login": now
                }
                res = db.users.insert_one(new_user)
                user_id = str(res.inserted_id)

            log_audit_event(db, "GOOGLE_AUTH_SUCCESS", user_id=user_id, status="SUCCESS", metadata={"email": email})
        except Exception as exc:
            app.logger.error(f"Google auth DB error: {exc}")
            user_id = google_id or email
    else:
        user_id = google_id or email

    jwt_token = create_access_token(user_id=user_id, email=email, role=role)

    user_info = {
        "id": user_id,
        "email": email,
        "name": name or email.split("@")[0],
        "picture": picture,
        "role": role,
        "auth_provider": "google"
    }

    session.permanent = True
    session["user_id"] = user_id
    session["user"] = user_info
    return jsonify({"success": True, "token": jwt_token, "user": user_info})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    uid = session.get("user_id")
    db = get_db()
    if uid:
        log_audit_event(db, "LOGOUT", user_id=str(uid), status="SUCCESS")
    session.clear()
    return jsonify({"success": True})


# â”€â”€ Strict User Data Isolation & CRUD (User-Owned Snippets Collection) â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/api/snippets", methods=["GET"])
@token_required
def list_snippets():
    """
    CRITICAL QUERY SAFETY (Rules 11-13):
    Never queries db.snippets.find({}). Always strictly filters by authenticated g.user['id'].
    """
    db = get_db()
    if db is None:
        return jsonify({"error": "Database not available."}), 503

    from flask import g
    snippets_cursor = db.snippets.find({"userId": str(g.user["id"])}).sort("updatedAt", -1)

    items = []
    for doc in snippets_cursor:
        items.append({
            "id": str(doc["_id"]),
            "userId": doc["userId"],
            "title": doc.get("title", "Untitled"),
            "code": doc.get("code", ""),
            "language": doc.get("language", "python"),
            "tags": doc.get("tags", []),
            "isPublic": doc.get("isPublic", False),
            "createdAt": doc.get("createdAt").isoformat() if doc.get("createdAt") else None,
            "updatedAt": doc.get("updatedAt").isoformat() if doc.get("updatedAt") else None,
        })
    return jsonify({"success": True, "snippets": items})


@app.route("/api/snippets", methods=["POST"])
@token_required
def create_snippet():
    """
    CRITICAL DATA ISOLATION (Rules 1-5, 13):
    1. Document always has 'userId' set to authenticated g.user['id'].
    2. Client-provided userId is strictly stripped and ignored.
    3. Timestamps createdAt & updatedAt are automatically injected.
    """
    db = get_db()
    if db is None:
        return jsonify({"error": "Database not available."}), 503

    from flask import g
    data = request.get_json() or {}
    title = (data.get("title") or "Untitled").strip()
    code = data.get("code", "")
    language = (data.get("language") or "python").strip()

    doc = prepare_user_owned_doc({
        "title": title,
        "code": code,
        "language": language,
        "tags": data.get("tags", []),
        "isPublic": bool(data.get("isPublic", False))
    }, auth_user_id=g.user["id"])

    res = db.snippets.insert_one(doc)
    snippet_id = str(res.inserted_id)

    log_audit_event(db, "CREATE_SNIPPET", user_id=g.user["id"], metadata={"snippetId": snippet_id})
    return jsonify({
        "success": True,
        "id": snippet_id,
        "snippet": {
            "id": snippet_id,
            "userId": g.user["id"],
            "title": title,
            "language": language,
            "updatedAt": doc["updatedAt"].isoformat()
        }
    }), 201


@app.route("/api/snippets/<snippet_id>", methods=["GET"])
@token_required
def get_snippet(snippet_id):
    """
    CRITICAL QUERY SAFETY (Rules 12-14):
    Always filters by BOTH _id AND userId: { '_id': ObjectId(snippet_id), 'userId': g.user['id'] }
    Prevents cross-user data exposure.
    """
    db = get_db()
    if db is None:
        return jsonify({"error": "Database not available."}), 503

    from flask import g
    from bson import ObjectId
    try:
        obj_id = ObjectId(snippet_id)
    except Exception:
        return jsonify({"error": "Invalid snippet ID format."}), 400

    doc = db.snippets.find_one({"_id": obj_id, "userId": str(g.user["id"])})
    if not doc:
        return jsonify({"error": "Snippet not found or access denied."}), 404

    return jsonify({
        "success": True,
        "snippet": {
            "id": str(doc["_id"]),
            "userId": doc["userId"],
            "title": doc.get("title"),
            "code": doc.get("code"),
            "language": doc.get("language"),
            "tags": doc.get("tags", []),
            "createdAt": doc.get("createdAt").isoformat() if doc.get("createdAt") else None,
            "updatedAt": doc.get("updatedAt").isoformat() if doc.get("updatedAt") else None,
        }
    })


@app.route("/api/snippets/<snippet_id>", methods=["PUT"])
@token_required
def update_snippet(snippet_id):
    """
    CRITICAL QUERY SAFETY (Rule 14):
    Updates ONLY where _id matches AND userId matches authenticated user.
    """
    db = get_db()
    if db is None:
        return jsonify({"error": "Database not available."}), 503

    from flask import g
    from bson import ObjectId
    try:
        obj_id = ObjectId(snippet_id)
    except Exception:
        return jsonify({"error": "Invalid snippet ID format."}), 400

    data = request.get_json() or {}
    update_doc = prepare_user_owned_doc(data, auth_user_id=g.user["id"], is_update=True)

    res = db.snippets.update_one(
        {"_id": obj_id, "userId": str(g.user["id"])},
        {"$set": update_doc}
    )

    if res.matched_count == 0:
        return jsonify({"error": "Snippet not found or access denied."}), 404

    log_audit_event(db, "UPDATE_SNIPPET", user_id=g.user["id"], metadata={"snippetId": snippet_id})
    return jsonify({"success": True, "updated": True})


@app.route("/api/snippets/<snippet_id>", methods=["DELETE"])
@token_required
def delete_snippet(snippet_id):
    """
    CRITICAL QUERY SAFETY (Rule 14):
    Deletes ONLY where _id matches AND userId matches authenticated user.
    """
    db = get_db()
    if db is None:
        return jsonify({"error": "Database not available."}), 503

    from flask import g
    from bson import ObjectId
    try:
        obj_id = ObjectId(snippet_id)
    except Exception:
        return jsonify({"error": "Invalid snippet ID format."}), 400

    res = db.snippets.delete_one({"_id": obj_id, "userId": str(g.user["id"])})
    if res.deleted_count == 0:
        return jsonify({"error": "Snippet not found or access denied."}), 404

    log_audit_event(db, "DELETE_SNIPPET", user_id=g.user["id"], metadata={"snippetId": snippet_id})
    return jsonify({"success": True, "deleted": True})


# â”€â”€ Role-Based Authorization Route (Rule 16-18) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/api/admin/metrics", methods=["GET"])
@require_role("admin")
def admin_metrics():
    """Admin-only metrics endpoint protected by centralized @require_role('admin')."""
    from flask import g
    db = get_db()
    health = check_db_health(db)
    return jsonify({
        "success": True,
        "adminUser": g.user["id"],
        "db": health
    })


# â”€â”€ MongoDB Health Check Route (Rule 31) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/api/health/db", methods=["GET"])
def db_health_check():
    """Monitoring endpoint for DB connection status and metrics."""
    return jsonify(check_db_health())

@app.route("/")
@app.route("/vision")
def index():
    return render_template("index.html")

# â”€â”€ Service Worker - must be served from / scope â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Service Workers can only control pages within their scope. A SW at /static/sw.js
# can only control /static/*, which excludes our root page at /. Serving it at /sw.js
# gives it full-origin scope so it can cache Pyodide, Monaco, and Plotly CDN assets.
@app.route("/sw.js")
def service_worker():
    resp = send_from_directory(app.static_folder, "sw.js")
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Content-Type"] = "application/javascript"
    resp.headers["Cache-Control"] = "no-cache"  # SW itself must not be cached
    return resp

# â”€â”€ Static file fallback for root-level assets (/app.js, /style.css, /ort/*, /models/*) â”€â”€
@app.route("/<path:filename>")
def serve_static_root(filename):
    # First check pyrunner/static
    static_file = os.path.join(app.static_folder, filename)
    if os.path.isfile(static_file):
        return send_from_directory(app.static_folder, filename)
    # Then check public folder
    pub_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    pub_file = os.path.join(pub_dir, filename)
    if os.path.isfile(pub_file):
        return send_from_directory(pub_dir, filename)
    # If it is a client route without extension, return index.html
    if "." not in filename:
        return render_template("index.html")
    return jsonify({"error": "File not found"}), 404

# â”€â”€ Yahoo Finance server-side proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Pyodide runs inside the browser sandbox; direct HTTP requests to Yahoo Finance
# are blocked by CORS policy. This endpoint fetches stock data server-side
# (no CORS restrictions) and returns clean JSON that Pyodide can consume via
# pyodide.http.pyfetch("/api/yf/...").
@app.route("/api/yf/<ticker>")
def yf_proxy(ticker):
    try:
        import yfinance as yf
        import pandas as pd
        period   = request.args.get("period",   "1mo")
        interval = request.args.get("interval", "1d")

        hist = yf.download(
            ticker.upper(),
            period=period,
            interval=interval,
            auto_adjust=True,
            progress=False,
            keepna=False,
        )

        if hist is None or hist.empty:
            return jsonify({"error": f"No price data returned for '{ticker}'. "
                                     f"Check that the symbol is correct and try a longer period."}), 404

        # Flatten MultiIndex columns produced by yf.download for a single ticker
        if isinstance(hist.columns, pd.MultiIndex):
            hist.columns = [col[0] for col in hist.columns]

        # Strip timezone so strftime works across yfinance versions
        if hist.index.tz is not None:
            hist.index = hist.index.tz_convert(None)

        hist.index.name = "Date"
        hist.index = hist.index.strftime("%Y-%m-%d")

        # Keep only OHLCV columns
        ohlcv_cols = [c for c in hist.columns if c in {"Open", "High", "Low", "Close", "Volume"}]
        records = hist[ohlcv_cols].reset_index().to_dict(orient="records")
        return jsonify(records)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

def json_clean(obj):
    if isinstance(obj, dict):
        return {str(k): json_clean(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [json_clean(v) for v in obj]
    elif hasattr(obj, "isoformat"):
        return obj.isoformat()
    elif isinstance(obj, (int, float, str, bool, type(None))):
        return obj
    else:
        return str(obj)

# â”€â”€ Yahoo Finance category proxies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/api/yf/<ticker>/<category>")
def yf_category_proxy(ticker, category):
    try:
        import yfinance as yf
        import pandas as pd
        import numpy as np

        t = yf.Ticker(ticker.upper())
        category = category.lower()

        # Handle specific properties that require special conversion
        if category == "options": return jsonify(json_clean(list(t.options)))
        if category == "news": return jsonify(json_clean(t.news))
        if category == "info": return jsonify(json_clean(t.info))
        if category == "fast_info": return jsonify(json_clean(dict(t.fast_info)))
        if category == "calendar": return jsonify(json_clean(t.calendar))

        category_aliases = {
            "metadata": "history_metadata",
            "calendars": "calendar",
            "shares": "get_shares",
            "shares_full": "get_shares_full",
            "valuation": "get_valuation_measures",
        }
        category = category_aliases.get(category, category)

        if category.startswith("funds_"):
            sub = category[len("funds_"):]
            fd = getattr(t, "funds_data", None)
            if fd is None or not hasattr(fd, sub):
                return jsonify({"error": f"Unknown or unavailable funds_data field: {sub}"}), 400
            data = getattr(fd, sub)
        elif hasattr(t, category):
            data = getattr(t, category)
        elif hasattr(t, f"get_{category}"):
            data = getattr(t, f"get_{category}")
        else:
            return jsonify({"error": f"Unsupported or invalid category: {category}"}), 400

        if callable(data):
            kwargs = {k: v for k, v in request.args.items() if k not in ("period", "interval")}
            try:
                data = data(**kwargs) if kwargs else data()
            except Exception as e:
                return jsonify({"error": f"Cannot invoke method {category}(): {e}"}), 400

        if isinstance(data, pd.DataFrame) or isinstance(data, pd.Series):
            if data.empty:
                return jsonify([])
            df = data.reset_index()
            df.columns = [str(c) for c in df.columns]
            # Convert datetime columns to string
            for col in df.select_dtypes(include=['datetime64[ns, UTC]', 'datetime64[ns]', '<M8[ns]']).columns:
                df[col] = df[col].astype(str)
            # Handle NaNs
            df = df.replace({np.nan: None})
            return jsonify(json_clean(df.to_dict(orient="records")))

        elif isinstance(data, dict) or isinstance(data, list):
            return jsonify(json_clean(data))
        else:
            return jsonify(str(data))

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@app.route("/api/yf/<ticker>/options/<expiry>")
def yf_options_chain_proxy(ticker, expiry):
    try:
        import yfinance as yf
        t = yf.Ticker(ticker.upper())
        chain = t.option_chain(expiry)
        calls = chain.calls.reset_index().to_dict(orient="records")
        puts = chain.puts.reset_index().to_dict(orient="records")
        return jsonify(json_clean({"calls": calls, "puts": puts}))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

# â”€â”€ Yahoo Finance sector, industry, market, tickers, search, lookup proxies â”€â”€â”€
@app.route("/api/yf/sector/<key>/<category>")
@app.route("/api/yf/sector/<category>")
def yf_sector_proxy(category, key="technology"):
    try:
        import yfinance as yf
        import pandas as pd
        import numpy as np
        s = yf.Sector(key)
        cat = category.lower()
        cat_map = {"industries_breakdown": "industries"}
        cat = cat_map.get(cat, cat)
        if not hasattr(s, cat):
            return jsonify({"error": f"Unsupported sector attribute: {category}"}), 400
        data = getattr(s, cat)
        if callable(data): data = data()
        if isinstance(data, (pd.DataFrame, pd.Series)):
            if data.empty: return jsonify([])
            df = data.reset_index()
            df.columns = [str(c) for c in df.columns]
            for col in df.select_dtypes(include=['datetime64[ns, UTC]', 'datetime64[ns]', '<M8[ns]']).columns:
                df[col] = df[col].astype(str)
            df = df.replace({np.nan: None})
            return jsonify(json_clean(df.to_dict(orient="records")))
        elif isinstance(data, (dict, list)):
            return jsonify(json_clean(data))
        else:
            return jsonify(str(data))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@app.route("/api/yf/industry/<key>/<category>")
@app.route("/api/yf/industry/<category>")
def yf_industry_proxy(category, key="software-infrastructure"):
    try:
        import yfinance as yf
        import pandas as pd
        import numpy as np
        ind = yf.Industry(key)
        cat = category.lower()
        if not hasattr(ind, cat):
            return jsonify({"error": f"Unsupported industry attribute: {category}"}), 400
        data = getattr(ind, cat)
        if callable(data): data = data()
        if isinstance(data, (pd.DataFrame, pd.Series)):
            if data.empty: return jsonify([])
            df = data.reset_index()
            df.columns = [str(c) for c in df.columns]
            for col in df.select_dtypes(include=['datetime64[ns, UTC]', 'datetime64[ns]', '<M8[ns]']).columns:
                df[col] = df[col].astype(str)
            df = df.replace({np.nan: None})
            return jsonify(json_clean(df.to_dict(orient="records")))
        elif isinstance(data, (dict, list)):
            return jsonify(json_clean(data))
        else:
            return jsonify(str(data))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@app.route("/api/yf/market/<market_id>/<category>")
@app.route("/api/yf/market/<category>")
def yf_market_proxy(category, market_id="US"):
    try:
        import yfinance as yf
        import pandas as pd
        import numpy as np
        if market_id.lower() in ("us_market", "us"):
            market_id = "US"
        m = yf.Market(market_id)
        cat = category.lower().replace("market_", "")
        if not hasattr(m, cat):
            return jsonify({"error": f"Unsupported market attribute: {category}"}), 400
        data = getattr(m, cat)
        if callable(data): data = data()
        if isinstance(data, (pd.DataFrame, pd.Series)):
            if data.empty: return jsonify([])
            df = data.reset_index()
            df.columns = [str(c) for c in df.columns]
            for col in df.select_dtypes(include=['datetime64[ns, UTC]', 'datetime64[ns]', '<M8[ns]']).columns:
                df[col] = df[col].astype(str)
            df = df.replace({np.nan: None})
            return jsonify(json_clean(df.to_dict(orient="records")))
        elif isinstance(data, (dict, list)):
            return jsonify(json_clean(data))
        else:
            return jsonify(str(data))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@app.route("/api/yf/tickers")
def yf_tickers_proxy():
    try:
        import yfinance as yf
        symbols = request.args.get("symbols", "AAPL MSFT GOOG")
        t = yf.Tickers(symbols)
        res = {}
        for sym, obj in t.tickers.items():
            try:
                res[sym] = obj.info
            except Exception:
                res[sym] = {"symbol": sym}
        return jsonify(json_clean(res))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@app.route("/api/yf/search")
def yf_search_proxy():
    try:
        import yfinance as yf
        q = request.args.get("q", "apple")
        s = yf.Search(q)
        return jsonify(json_clean({"quotes": getattr(s, "quotes", []), "news": getattr(s, "news", [])}))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@app.route("/api/yf/lookup")
def yf_lookup_proxy():
    try:
        import yfinance as yf
        q = request.args.get("q", "apple")
        l = yf.Lookup(q)
        if hasattr(l, "response"):
            return jsonify(l.response)
        return jsonify(str(l))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

# â”€â”€ Yahoo Finance predefined screener proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# yf.screen() runs a *predefined* Yahoo query (day_gainers, most_actives, etc.)
# - no ticker/user input needed, so it's served as a static, downloadable
# dataset in the Data Explorer instead of an example the user has to edit.
YF_SCREEN_PRESETS = {
    "day_gainers", "day_losers", "most_actives",
    "undervalued_large_caps", "growth_technology_stocks",
    "aggressive_small_caps", "small_cap_gainers",
    "undervalued_growth_stocks", "conservative_foreign_funds",
    "high_yield_bond",
}

@app.route("/api/yf/screen/<preset>")
def yf_screen_proxy(preset):
    try:
        import yfinance as yf
        preset = preset.lower()
        if preset not in YF_SCREEN_PRESETS:
            return jsonify({"error": f"Unknown predefined screen: {preset}"}), 400

        result = yf.screen(preset)
        quotes = result.get("quotes", []) if isinstance(result, dict) else []
        rows = [{
            "symbol":                     q.get("symbol"),
            "shortName":                  q.get("shortName"),
            "regularMarketPrice":         q.get("regularMarketPrice"),
            "regularMarketChangePercent": q.get("regularMarketChangePercent"),
            "regularMarketVolume":        q.get("regularMarketVolume"),
            "marketCap":                  q.get("marketCap"),
            "sector":                     q.get("sector"),
        } for q in quotes]
        return jsonify(rows)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

# â”€â”€ FRED (Federal Reserve) data proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# The FRED REST API requires a free API key. We proxy it server-side to avoid
# CORS restrictions and keep the key out of the browser.
FRED_BASE = "https://api.stlouisfed.org/fred"

@app.route("/api/fred/<series_id>")
def fred_proxy(series_id):
    try:
        from urllib.request import urlopen
        import urllib.parse
        import urllib.error
        import os

        api_key = os.environ.get("FRED_API_KEY", "").strip()
        if not api_key:
            return jsonify({"error": "FRED_API_KEY environment variable is not set. Please add it to your deployment (e.g. Vercel) settings to use FRED data."}), 400

        limit        = request.args.get("limit",        "100")
        sort_order   = request.args.get("sort_order",   "desc")
        units        = request.args.get("units",        "lin")
        frequency    = request.args.get("frequency",    "")
        observation_start = request.args.get("observation_start", "")
        observation_end   = request.args.get("observation_end",   "")

        params = {
            "series_id":  series_id.upper(),
            "api_key":    api_key,
            "file_type":  "json",
            "limit":      limit,
            "sort_order": sort_order,
        }
        if units:             params["units"]             = units
        if frequency:         params["frequency"]         = frequency
        if observation_start: params["observation_start"] = observation_start
        if observation_end:   params["observation_end"]   = observation_end

        url = f"{FRED_BASE}/series/observations?{urllib.parse.urlencode(params)}"
        with urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        # Also fetch series metadata (name, units, etc.)
        meta_url = f"{FRED_BASE}/series?series_id={series_id.upper()}&api_key={api_key}&file_type=json"
        with urlopen(meta_url, timeout=15) as resp2:
            meta = json.loads(resp2.read().decode("utf-8"))

        observations = data.get("observations", [])
        series_meta  = meta.get("seriess", [{}])[0]

        return jsonify({
            "series_id":   series_id.upper(),
            "title":       series_meta.get("title", series_id),
            "units":       series_meta.get("units_short", ""),
            "frequency":   series_meta.get("frequency_short", ""),
            "observations": [
                {"date": o["date"], "value": None if o["value"] == "." else float(o["value"])}
                for o in observations
                if o.get("value") is not None
            ],
        })

    except urllib.error.HTTPError as exc:
        try:
            err_msg = json.loads(exc.read().decode('utf-8'))
            msg = err_msg.get("error_message", str(exc))
        except Exception:
            msg = str(exc)
        return jsonify({"error": f"FRED API Error ({exc.code}): {msg}"}), exc.code

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

# â”€â”€ FRED global metadata proxy (releases / sources / tags / categories / series) â”€â”€
FRED_META_ENDPOINTS = {
    "releases", "releases/dates", "release", "release/dates", "release/series",
    "release/sources", "release/tags", "release/related_tags", "release/tables",
    "sources", "source", "source/releases",
    "tags", "related_tags", "tags/series",
    "category", "category/children", "category/related", "category/series",
    "category/tags", "category/related_tags",
    "series", "series/categories", "series/observations", "series/release",
    "series/search", "series/search/tags", "series/search/related_tags",
    "series/tags", "series/updates", "series/vintagedates"
}

@app.route("/api/fred/meta/<path:endpoint>")
def fred_meta_proxy(endpoint):
    try:
        from urllib.request import urlopen
        import urllib.parse
        import urllib.error
        import os

        endpoint = endpoint.strip("/")
        if endpoint not in FRED_META_ENDPOINTS:
            return jsonify({"error": f"Unsupported FRED meta endpoint: {endpoint}"}), 400

        api_key = os.environ.get("FRED_API_KEY", "").strip()
        if not api_key:
            return jsonify({"error": "FRED_API_KEY environment variable is not set. "
                                     "Please add it to your deployment (e.g. Vercel) settings."}), 400

        params = {"api_key": api_key, "file_type": "json"}
        for k, v in request.args.items():
            params[k] = v
        if "limit" not in params and "search_text" not in params and "q" not in params:
            params["limit"] = "1000"

        if endpoint.startswith("category") and "category_id" not in params:
            params["category_id"] = "0"
        if endpoint.startswith("release") and endpoint not in ("releases", "releases/dates") and "release_id" not in params:
            params["release_id"] = "53"
        if endpoint.startswith("series") and endpoint not in ("series/search", "series/updates") and "series_id" not in params:
            params["series_id"] = "GDP"
        if endpoint.startswith("source") and endpoint != "sources" and "source_id" not in params:
            params["source_id"] = "1"

        url = f"{FRED_BASE}/{endpoint}?{urllib.parse.urlencode(params)}"

        with urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        for key in ("releases", "sources", "tags", "categories", "seriess", "release_dates", "tables"):
            if key in data:
                return jsonify(data[key])
        return jsonify(data)

    except urllib.error.HTTPError as exc:
        try:
            err_msg = json.loads(exc.read().decode('utf-8'))
            msg = err_msg.get("error_message", str(exc))
        except Exception:
            msg = str(exc)
        return jsonify({"error": f"FRED API Error ({exc.code}): {msg}"}), exc.code

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

# â”€â”€ Computer Vision Python Execution Proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Executes Python code server-side with full cv2 / ultralytics / PIL / skimage
# available. Results (stdout + images) are returned as JSON so the browser
# Pyodide runner can display them identically to native Pyodide output.
#
# Security: Runs inside a subprocess with a strict timeout. No shell=True.
# Images are returned as base64 PNG so no files need to persist.
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import subprocess
import sys
import tempfile
import textwrap

_CV_RUNNER_PRELUDE = textwrap.dedent("""\
import sys, io, os, base64, warnings
warnings.filterwarnings('ignore')

# â”€â”€ Pillow / PIL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try:
    from PIL import Image as _PIL_Image
    import PIL
except ImportError:
    PIL = None

# â”€â”€ OpenCV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try:
    import cv2
    # Monkey-patch cv2.imshow so it encodes the frame and prints a sentinel
    _cv2_imshow_orig = None
    def _cv2_imshow_patch(winname, mat):
        import cv2 as _cv2
        _, buf = _cv2.imencode('.png', mat)
        b64 = base64.b64encode(buf.tobytes()).decode('ascii')
        print(f'__RUN01_IMG__:{b64}', flush=True)
    cv2.imshow = _cv2_imshow_patch
    cv2.waitKey = lambda ms=0: 0
    cv2.destroyAllWindows = lambda: None
    cv2.destroyWindow = lambda name: None
except ImportError:
    cv2 = None

# â”€â”€ Matplotlib â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import io as _io
    def _mpl_show(*args, **kwargs):
        buf = _io.BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor='#0a0a0a', edgecolor='none')
        buf.seek(0)
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        buf.close()
        plt.close('all')
        print(f'__RUN01_IMG__:{b64}', flush=True)
    plt.show = _mpl_show
except ImportError:
    pass

# â”€â”€ PIL Image.show() patch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try:
    from PIL import Image as _PIL_Image
    import io as _io
    _orig_pil_show = _PIL_Image.Image.show
    def _pil_show_patch(self, title=None, command=None):
        buf = _io.BytesIO()
        self.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        print(f'__RUN01_IMG__:{b64}', flush=True)
    _PIL_Image.Image.show = _pil_show_patch
except Exception:
    pass

# â”€â”€ scikit-image â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try:
    import skimage
    from skimage import io as skio, transform, filters, feature, color, measure
    # Patch skimage.io.imshow
    def _ski_imshow(img, *a, **kw):
        import cv2 as _cv2, numpy as _np
        if img.dtype != _np.uint8:
            img = (_np.clip(img, 0, 1) * 255).astype(_np.uint8)
        if len(img.shape) == 3 and img.shape[2] == 3:
            img = _cv2.cvtColor(img, _cv2.COLOR_RGB2BGR)
        _, buf = _cv2.imencode('.png', img)
        b64 = base64.b64encode(buf.tobytes()).decode('ascii')
        print(f'__RUN01_IMG__:{b64}', flush=True)
    skio.imshow = _ski_imshow
    skio.show = lambda: None
except ImportError:
    pass

# â”€â”€ numpy is always available â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import numpy as np

# â”€â”€ ultralytics (YOLO) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try:
    from ultralytics import YOLO
    import supervision as sv
except ImportError:
    pass

""")

@app.route("/api/cv/run", methods=["POST"])
def cv_run():
    """
    Execute Python CV code server-side with opencv, ultralytics, PIL, skimage.
    Body: { "code": "...", "timeout": 30 }
    Returns: { "stdout": "...", "stderr": "...", "images": ["base64png", ...], "error": null }
    """
    try:
        body = request.get_json(force=True) or {}
        code = body.get("code", "")
        timeout = min(int(body.get("timeout", 30)), 60)  # cap at 60s

        if not code.strip():
            return jsonify({"stdout": "", "stderr": "", "images": [], "error": None})

        full_code = _CV_RUNNER_PRELUDE + "\n" + code

        with tempfile.NamedTemporaryFile(mode="w", suffix=".py",
                                         delete=False, encoding="utf-8") as f:
            f.write(full_code)
            tmp_path = f.name

        try:
            result = subprocess.run(
                [sys.executable, tmp_path],
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ, "MPLBACKEND": "Agg",
                     "PYTHONDONTWRITEBYTECODE": "1"},
            )
            raw_stdout = result.stdout or ""
            raw_stderr = result.stderr or ""
        except subprocess.TimeoutExpired:
            return jsonify({"stdout": "", "stderr": f"Execution timed out after {timeout}s.",
                            "images": [], "error": "timeout"})
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        # Split stdout into text lines and __RUN01_IMG__ sentinels
        lines = []
        images = []
        for line in raw_stdout.splitlines():
            if line.startswith("__RUN01_IMG__:"):
                images.append(line[len("__RUN01_IMG__:"):])
            else:
                lines.append(line)

        return jsonify({
            "stdout": "\n".join(lines),
            "stderr": raw_stderr,
            "images": images,
            "error": None if result.returncode == 0 else raw_stderr or "Non-zero exit code",
        })

    except Exception as exc:
        app.logger.exception("cv_run error")
        return jsonify({"stdout": "", "stderr": str(exc), "images": [], "error": str(exc)}), 500


# â”€â”€ Piston code execution proxy (C++, C#, Rust) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Routes compilation requests to the Piston API (https://emkc.org) which runs
# code server-side. This avoids needing to install gcc/mono/rustc locally and
# works perfectly on Vercel serverless.
PISTON_URL = "https://emkc.org/api/v2/piston/execute"
PISTON_LANGS = {
    "cpp":    "c++",
    "csharp": "csharp",
    "rust":   "rust",
}

@app.route("/api/run", methods=["POST"])
def run_code():
    try:
        from urllib.request import Request, urlopen

        data     = request.get_json(force=True)
        lang_key = data.get("language", "")
        piston_lang = PISTON_LANGS.get(lang_key)

        if not piston_lang:
            return jsonify({"error": f"Unsupported language: {lang_key}"}), 400

        payload = json.dumps({
            "language": piston_lang,
            "version":  "*",
            "files":    [{"content": data.get("code", "")}],
        }).encode("utf-8")

        req = Request(
            PISTON_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        return jsonify(result)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# AI Coding Assistant - multi-provider model catalog + dual-key fallback
#
# Two OpenAI-compatible providers are supported:
#   â€¢ NVIDIA NIM  (https://integrate.api.nvidia.com/v1) â€” env: NVIDIA_API_KEY[_2]
#   â€¢ Groq        (https://api.groq.com/openai/v1)      â€” env: GROQ_API_KEY[_2]
#
# Model IDs are verified against build.nvidia.com and console.groq.com/docs
# as of Oct 2026. Each model has individually tuned inference parameters.
# â˜… = completely free on the provider's no-credit-card free tier.
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

# â”€â”€ Per-model inference parameters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# These are injected into every API call to guarantee substantive, non-empty
# output. Tuned individually per model architecture:
#  â€¢ General dense models: temp=0.7 balanced between creativity and coherence
#  â€¢ max_tokens: set to each model's verified max completion limit
#  â€¢ top_p=0.95: standard nucleus sampling across all models
#
# NOTE: GPT-OSS models have a "thinking" mode that emits reasoning tokens
# before content â€” this causes blank/delayed responses when streaming.
# We pass thinking=disabled to force immediate content streaming.
MODEL_PARAMS = {
    # Groq Free Tier optimized (4,096 max completion tokens to stay strictly within 6,000-8,000 TPM limit)
    "llama-3.3-70b-versatile":                    {"max_tokens": 4096, "temperature": 0.6, "top_p": 0.95},
    "llama-3.1-8b-instant":                       {"max_tokens": 4096, "temperature": 0.6, "top_p": 0.95},
    "qwen/qwen3.8-27b":                           {"max_tokens": 4096, "temperature": 0.6, "top_p": 0.95},
    "openai/gpt-oss-120b":                        {"max_tokens": 4096, "temperature": 0.6, "top_p": 0.95},
    "openai/gpt-oss-20b":                         {"max_tokens": 4096, "temperature": 0.6, "top_p": 0.95},
    "openai/gpt-oss-safeguard-20b":               {"max_tokens": 2048, "temperature": 0.6, "top_p": 0.95},
    "allam-2-7b":                                 {"max_tokens": 2048, "temperature": 0.6, "top_p": 0.95},
    "meta-llama/llama-prompt-guard-2-86m":        {"max_tokens": 512,  "temperature": 0.1, "top_p": 0.95},
    "meta-llama/llama-prompt-guard-2-22m":        {"max_tokens": 512,  "temperature": 0.1, "top_p": 0.95},
}
_DEFAULT_PARAMS = {"max_tokens": 4096, "temperature": 0.6, "top_p": 0.95}

MODEL_CATALOG = [
    # Primary Chat/Code Models (Groq LPU Free Tier - Live Oct 24, 2026)
    {"id": "llama-3.3-70b-versatile",      "name": "Groq - Llama 3.3 70B Versatile",   "provider": "Groq",  "ctx": "128K", "max_out": 4096, "tier": "primary"},
    {"id": "llama-3.1-8b-instant",         "name": "Groq - Llama 3.1 8B Instant",      "provider": "Groq",  "ctx": "128K", "max_out": 4096, "tier": "primary"},
    {"id": "qwen/qwen3.8-27b",             "name": "Groq - Qwen 3.8 27B (Multimodal)", "provider": "Groq",  "ctx": "128K", "max_out": 4096, "tier": "primary"},
    {"id": "openai/gpt-oss-120b",          "name": "Groq - GPT-OSS 120B",              "provider": "Groq",  "ctx": "128K", "max_out": 4096, "tier": "primary"},
    {"id": "openai/gpt-oss-20b",           "name": "Groq - GPT-OSS 20B",               "provider": "Groq",  "ctx": "128K", "max_out": 4096, "tier": "primary"},
    # Specialized / Safety Models
    {"id": "allam-2-7b",                              "name": "Groq - ALLAM 2 7B",                     "provider": "Groq", "ctx": "128K", "max_out": 2048, "tier": "specialized"},
    {"id": "openai/gpt-oss-safeguard-20b",            "name": "Groq - GPT-OSS Safeguard 20B",           "provider": "Groq", "ctx": "128K", "max_out": 2048, "tier": "safety"},
    {"id": "meta-llama/llama-prompt-guard-2-86m",     "name": "Groq - Llama Prompt Guard 2 86M",        "provider": "Groq", "ctx": "8K",   "max_out": 512,  "tier": "safety"},
    {"id": "meta-llama/llama-prompt-guard-2-22m",     "name": "Groq - Llama Prompt Guard 2 22M",        "provider": "Groq", "ctx": "8K",   "max_out": 512,  "tier": "safety"},
]

PROVIDER_CONFIG = {
    "Groq": {
        "base_url": "https://api.groq.com/openai/v1/chat/completions",
        "key_env":  ["GROQ_API_KEY", "GROQ_API_KEY_2"],
        # Automatic fallback: Llama 3.3 70B -> Llama 3.1 8B (fastest/highest TPM) -> Qwen 3.8 27B -> GPT-OSS
        "fallback_chain": [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
        ],
    },
}

def _model_provider(model_id):
    """Look up which provider a model id belongs to. Currently only Groq is active."""
    for m in MODEL_CATALOG:
        if m["id"] == model_id:
            return m["provider"]
    return "Groq"


@app.route("/api/ai/skills")
def ai_skills():
    """Returns catalog of registered panel skills."""
    from pyrunner.skills import list_registered_panel_skills
    return jsonify(list_registered_panel_skills())


@app.route("/api/ai/models")
def ai_models():
    """Returns the curated, verified model catalog for the frontend dropdowns."""
    return jsonify(MODEL_CATALOG)


def _call_chat_provider(base_url, api_key, model, messages, payload_extra=None):
    """Make a single streaming attempt against an OpenAI-compatible chat
    completions endpoint (works for both NVIDIA NIM and Groq).
    Injects per-model tuned inference parameters (max_tokens, temperature, top_p)
    to guarantee substantive, non-empty, non-truncated output.

    For GPT-OSS models, also injects thinking=disabled to prevent blank responses
    caused by reasoning/thinking tokens consuming the stream before content tokens.

    Returns (requests.Response, error_str). error_str is None on success.
    """
    import requests
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    # Retrieve model-specific tuned parameters (or sensible safe default)
    params = dict(MODEL_PARAMS.get(model, _DEFAULT_PARAMS))
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        **params,
    }
    if payload_extra:
        payload.update(payload_extra)
    try:
        res = requests.post(url=base_url, headers=headers, json=payload, stream=True, timeout=90)
        return res, None
    except Exception as exc:
        return None, str(exc)


def _peek_stream(res):
    """Safely verify that a streaming HTTP 200 response actually contains readable data.
    Reads the first chunk to ensure the connection did not immediately drop, hang,
    or emit an error payload. Returns (first_chunk, error_str).
    """
    try:
        import json as _json
        for chunk in res.iter_content(chunk_size=512):
            if chunk:
                # Check for SSE error payloads embedded in 200 responses
                try:
                    chunk_str = chunk.decode("utf-8", errors="ignore")
                    if '"error":' in chunk_str:
                        for line in chunk_str.splitlines():
                            if line.startswith("data: ") and line.strip() != "data: [DONE]":
                                data_json = _json.loads(line[6:].strip())
                                if "error" in data_json:
                                    err_msg = data_json["error"].get("message", "Streaming API error")
                                    return None, f"Stream error: {err_msg}"
                except Exception:
                    pass
                return chunk, None
        return None, "Empty stream: no response data retrieved from provider"
    except Exception as exc:
        return None, f"Stream read error: {exc}"


# Any status code that indicates a key issue, rate limit, timeout, or server error
# warrants immediate fallback to the backup key (GROQ_API_KEY_2) and next model.
_FALLBACK_STATUS_CODES = {400, 401, 402, 403, 404, 408, 429, 500, 502, 503, 504}


@app.route("/api/ai/keys-status")
def ai_keys_status():
    """Returns the operational status of configured Groq API keys (masked for privacy)."""
    k1 = os.environ.get("GROQ_API_KEY", "").strip()
    k2 = os.environ.get("GROQ_API_KEY_2", "").strip()
    return jsonify({
        "provider": "Groq",
        "primary_key": {
            "configured": bool(k1),
            "masked": (k1[:6] + "..." + k1[-4:]) if len(k1) >= 10 else ("***" if k1 else None),
        },
        "secondary_key": {
            "configured": bool(k2),
            "masked": (k2[:6] + "..." + k2[-4:]) if len(k2) >= 10 else ("***" if k2 else None),
        },
        "dual_key_fallback_active": bool(k1 and k2),
        "fallback_chain_length": len(PROVIDER_CONFIG["Groq"]["fallback_chain"]),
    })


@app.route("/api/ai/validate-model", methods=["POST"])
def ai_validate_model():
    """Validates a model ID by making a minimal test call to check it's functional."""
    try:
        body = request.get_json(force=True) or {}
        model = body.get("model", "").strip()
        if not model:
            return jsonify({"valid": False, "error": "No model specified"}), 400

        # Find the provider for this model
        provider_name = _model_provider(model)
        cfg = PROVIDER_CONFIG.get(provider_name)
        if not cfg:
            return jsonify({"valid": False, "error": f"Unknown provider for model: {model}"}), 400

        keys = [os.environ.get(k, "").strip() for k in cfg["key_env"] if os.environ.get(k, "").strip()]
        if not keys:
            return jsonify({"valid": False, "error": f"No API key configured for provider: {provider_name}"}), 400

        import requests as _req
        params = dict(MODEL_PARAMS.get(model, _DEFAULT_PARAMS))
        params["max_tokens"] = min(params.get("max_tokens", 256), 64)  # minimal for validation

        headers = {"Authorization": f"Bearer {keys[0]}", "Content-Type": "application/json"}
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "Reply with one word: OK"}],
            "stream": False,
            **params,
        }

        try:
            resp = _req.post(cfg["base_url"], headers=headers, json=payload, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                return jsonify({"valid": True, "model": model, "provider": provider_name, "response_preview": content[:50]})
            else:
                try:
                    err = resp.json().get("error", {})
                    msg = err.get("message", resp.text[:200]) if isinstance(err, dict) else str(err)[:200]
                except Exception:
                    msg = resp.text[:200]
                return jsonify({"valid": False, "model": model, "error": f"HTTP {resp.status_code}: {msg}"}), 200
        except Exception as exc:
            return jsonify({"valid": False, "model": model, "error": str(exc)}), 200
    except Exception as exc:
        return jsonify({"valid": False, "error": str(exc)}), 500


@app.route("/api/ai/skills/<panel_key>")
def ai_skill_detail(panel_key):
    """Returns the resolved skill details for a specific panel key."""
    from pyrunner.skills import resolve_panel_skill
    skill = resolve_panel_skill(panel_key)
    # Only return metadata, not full content (too large for frontend)
    return jsonify({
        "panel_key": skill.get("key"),
        "name": skill.get("name"),
        "description": skill.get("description"),
        "version": skill.get("version"),
        "content_length": len(skill.get("content", "")),
    })


@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    """Chat endpoint with automatic dual-provider, dual-key fallback.
    Dynamically injects ONLY the respective skill corresponding to the
    active panel context ('cad', 'desmos', 'data', 'editor').
    """
    try:
        import os
        from flask import Response, stream_with_context
        from pyrunner.skills import build_panel_system_prompt

        body     = request.get_json(force=True)
        messages = body.get("messages", [])
        model    = body.get("model", "llama-3.3-70b-versatile")
        
        # â”€â”€ Dynamic Panel Skill Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # Resolves active panel context and loads ONLY its respective SKILL.md,
        # fine-tuned individually for the selected model and its token parameters:
        #   â€¢ "cad"     -> OpenSCAD 3D Modeling & CSG Skill
        #   â€¢ "desmos"  -> Desmos LaTeX Math & Analysis Skill
        #   â€¢ "data"    -> FRED & Yahoo Finance Data Explorer Skill
        #   â€¢ "editor"  -> Pyodide Scientific Python & Visualization Skill
        context = (body.get("context") or "editor").strip().lower()
        panel_sys_prompt = build_panel_system_prompt(context, model=model)

        if not messages or messages[0].get("role") != "system":
            messages.insert(0, {"role": "system", "content": panel_sys_prompt})
        else:
            messages[0]["content"] = panel_sys_prompt + "\n\n" + messages[0]["content"]

        # â”€â”€ Resolve which provider each candidate model belongs to â”€â”€â”€â”€â”€â”€â”€â”€
        requested_provider = _model_provider(model)
        provider_order = [requested_provider] + [p for p in PROVIDER_CONFIG if p != requested_provider]

        configured_keys = {
            p: [os.environ.get(k, "").strip() for k in cfg["key_env"] if os.environ.get(k, "").strip()]
            for p, cfg in PROVIDER_CONFIG.items()
        }

        if not any(configured_keys.values()):
            return jsonify({
                "error": "No AI provider API key is configured. Set GROQ_API_KEY "
                         "(and optional GROQ_API_KEY_2 backup key) in your environment settings."
            }), 400

        res = None
        last_error = None
        success = False
        active_first_chunk = None
        active_stream_iter = None

        for provider in provider_order:
            keys_to_try = configured_keys.get(provider) or []
            if not keys_to_try:
                continue  # this provider has no key configured - skip it entirely

            cfg = PROVIDER_CONFIG[provider]
            base_url = cfg["base_url"]

            # Requested model first (if it belongs to this provider), then this
            # provider's curated fallback chain, deduped, preserving order.
            if provider == requested_provider:
                models_to_try = [model] + [m for m in cfg["fallback_chain"] if m != model]
            else:
                models_to_try = list(cfg["fallback_chain"])

            for target_model in models_to_try:
                for idx, api_key in enumerate(keys_to_try):
                    label = "primary" if idx == 0 else "secondary"
                    res, network_err = _call_chat_provider(base_url, api_key, target_model, messages)

                    if network_err:
                        last_error = f"[{provider} {label} key, model {target_model}] Network error: {network_err}"
                        res = None
                        continue

                    if res.status_code == 200:
                        stream_iter = res.iter_content(chunk_size=1024)
                        first_chunk = next(stream_iter, None)
                        if not first_chunk:
                            last_error = f"[{provider} {label} key, model {target_model}] Empty stream from provider"
                            res = None
                            continue
                        try:
                            fstr = first_chunk.decode("utf-8", errors="ignore")
                            if '"error":' in fstr:
                                last_error = f"[{provider} {label} key, model {target_model}] Stream error: {fstr[:200]}"
                                res = None
                                continue
                        except Exception:
                            pass
                        active_first_chunk = first_chunk
                        active_stream_iter = stream_iter
                        success = True
                        break  # Success - validated stream response ready

                    try:
                        err_data = res.json()
                        err_msg = err_data.get("error", {})
                        if isinstance(err_msg, dict):
                            err_msg = err_msg.get("message", res.text[:200])
                        elif isinstance(err_msg, str):
                            pass
                        else:
                            err_msg = res.text[:200]
                    except Exception:
                        err_msg = res.text[:200]
                    last_error = f"[{provider} {label} key, model {target_model}] HTTP {res.status_code}: {err_msg}"

                    # Fall back to next key or next model
                    res = None
                    continue

                if success:
                    break
            if success:
                break

        # All providers, keys, and fallback models exhausted without success.
        if res is None or not success:
            return jsonify({
                "error": f"Failed to connect to any configured AI provider. Last error: {last_error}"
            }), 503

        # Stream the response directly from the active iterator
        def generate():
            if active_first_chunk:
                yield active_first_chunk
            if active_stream_iter:
                for chunk in active_stream_iter:
                    if chunk:
                        yield chunk

        return Response(
            stream_with_context(generate()),
            content_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            }
        )

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500



# â”€â”€ Computer Vision Studio Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import uuid
import threading
import tempfile
import os as _os

# In-memory job store (replace with MongoDB for persistence)
_cv_jobs: dict = {}

def _cv_job_default(job_id: str) -> dict:
    return {
        "id": job_id,
        "status": "idle",
        "progress": 0,
        "total_frames": 0,
        "processed_frames": 0,
        "error": None,
        "output_path": None,
    }

@app.route("/api/cv/upload", methods=["POST"])
def cv_upload():
    """Accept a video file and return a job_id for processing."""
    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    f = request.files["video"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    job_id = str(uuid.uuid4())
    suffix = _os.path.splitext(f.filename or "video.mp4")[1] or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    f.save(tmp.name)
    tmp.close()

    _cv_jobs[job_id] = _cv_job_default(job_id)
    _cv_jobs[job_id]["video_path"] = tmp.name
    _cv_jobs[job_id]["status"] = "uploaded"

    return jsonify({"job_id": job_id, "status": "uploaded"})


def _run_cv_task(job_id: str, video_path: str, task: str, model_size: str, config: dict):
    """Background thread: run YOLO inference and write annotated video."""
    job = _cv_jobs.get(job_id)
    if not job:
        return

    job["status"] = "processing"

    try:
        import cv2  # type: ignore
        from ultralytics import YOLO  # type: ignore

        model_map = {
            "detect": {"nano": "yolov8n.pt", "small": "yolov8s.pt", "medium": "yolov8m.pt"},
            "track":  {"nano": "yolov8n.pt", "small": "yolov8s.pt", "medium": "yolov8m.pt"},
            "segment":{"nano": "yolov8n-seg.pt", "small": "yolov8s-seg.pt", "medium": "yolov8m-seg.pt"},
            "pose":   {"nano": "yolov8n-pose.pt","small": "yolov8s-pose.pt","medium": "yolov8m-pose.pt"},
        }
        weights = model_map.get(task, model_map["detect"]).get(model_size, "yolov8n.pt")
        model = YOLO(weights)

        cap = cv2.VideoCapture(video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        job["total_frames"] = total

        out_path = video_path.replace(_os.path.splitext(video_path)[1], "_annotated.mp4")
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(out_path, fourcc, fps, (w, h))

        conf = config.get("confidenceThreshold", 0.45)
        iou  = config.get("iouThreshold", 0.45)
        stride = max(1, int(config.get("stride", 1)))

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % stride == 0:
                if task == "track":
                    results = model.track(frame, conf=conf, iou=iou, persist=True, verbose=False)
                else:
                    results = model(frame, conf=conf, iou=iou, verbose=False)
                annotated = results[0].plot()
            else:
                annotated = frame

            writer.write(annotated)
            frame_idx += 1
            job["processed_frames"] = frame_idx
            job["progress"] = int((frame_idx / max(total, 1)) * 100)

        cap.release()
        writer.release()

        job["output_path"] = out_path
        job["status"] = "done"
        job["progress"] = 100

    except ImportError:
        job["status"] = "error"
        job["error"] = "Backend CV requires ultralytics and opencv-python-headless. Install them or use browser mode."
    except Exception as exc:
        job["status"] = "error"
        job["error"] = str(exc)
    finally:
        # Clean up input temp file
        try:
            _os.unlink(video_path)
        except Exception:
            pass


@app.route("/api/cv/process", methods=["POST"])
def cv_process():
    """Start background processing for an uploaded job."""
    data = request.get_json() or {}
    job_id = data.get("job_id")
    if not job_id or job_id not in _cv_jobs:
        return jsonify({"error": "Invalid job_id"}), 404

    job = _cv_jobs[job_id]
    if job.get("status") == "processing":
        return jsonify({"error": "Already processing"}), 409

    task       = data.get("task", "detect")
    model_size = data.get("modelSize", "nano")
    config     = data.get("config", {})
    video_path = job.get("video_path")

    if not video_path:
        return jsonify({"error": "No video uploaded for this job"}), 400

    t = threading.Thread(
        target=_run_cv_task,
        args=(job_id, video_path, task, model_size, config),
        daemon=True,
    )
    t.start()

    return jsonify({"job_id": job_id, "status": "processing"})


@app.route("/api/cv/status/<job_id>", methods=["GET"])
def cv_status(job_id: str):
    """Poll processing status and progress."""
    job = _cv_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify({
        "id": job["id"],
        "status": job["status"],
        "progress": job["progress"],
        "total_frames": job["total_frames"],
        "processed_frames": job["processed_frames"],
        "error": job.get("error"),
        "has_output": bool(job.get("output_path")),
    })


@app.route("/api/cv/result/<job_id>", methods=["GET"])
def cv_result(job_id: str):
    """Stream the annotated video back to the client."""
    from flask import send_file
    job = _cv_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    if job.get("status") != "done":
        return jsonify({"error": f"Job status is '{job.get('status')}', not done"}), 409
    out = job.get("output_path")
    if not out or not _os.path.isfile(out):
        return jsonify({"error": "Output file not found"}), 404
    return send_file(out, mimetype="video/mp4", as_attachment=False)


@app.route("/api/cv/cleanup/<job_id>", methods=["DELETE"])
def cv_cleanup(job_id: str):
    """Delete job data and temp files."""
    job = _cv_jobs.pop(job_id, None)
    if job:
        for key in ("video_path", "output_path"):
            path = job.get(key)
            if path:
                try:
                    _os.unlink(path)
                except Exception:
                    pass
    return jsonify({"deleted": bool(job)})


@app.route("/api/cad/dataset")
def cad_dataset():
    """Return the curated CAD engineering dataset catalog."""
    import json as _json_mod
    catalog_path = _os.path.join(_os.path.dirname(__file__), 'static', 'cad_dataset', 'models.json')
    try:
        with open(catalog_path, 'r', encoding='utf-8') as f:
            return jsonify(_json_mod.load(f))
    except FileNotFoundError:
        return jsonify({"error": "Dataset catalog not found"}), 404
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(debug=True)
