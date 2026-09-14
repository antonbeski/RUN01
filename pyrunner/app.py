from flask import Flask, render_template, jsonify, request, send_from_directory, session
import json
import os
import datetime
from werkzeug.security import generate_password_hash, check_password_hash

# Load local .env for NVIDIA_API_KEY / GROQ_API_KEY* without requiring python-dotenv.
# Existing process env (e.g. Vercel) always wins — never overwrite.
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

# ── Session Configuration ──────────────────────────────────────────────────────
# Critical for Vercel (HTTPS, cross-origin, serverless cold starts).
app.config['SESSION_COOKIE_SECURE'] = True           # Only send over HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True         # Prevent JS access
app.config['SESSION_COOKIE_SAMESITE'] = 'None'       # Allow cross-site requests
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=30)

# ── MongoDB & Authentication Modules (pyrunner.db & pyrunner.auth) ─────────────
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

# ── Auth Endpoints ────────────────────────────────────────────────────────────

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


# ── Strict User Data Isolation & CRUD (User-Owned Snippets Collection) ────────
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


# ── Role-Based Authorization Route (Rule 16-18) ───────────────────────────────
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


# ── MongoDB Health Check Route (Rule 31) ──────────────────────────────────────
@app.route("/api/health/db", methods=["GET"])
def db_health_check():
    """Monitoring endpoint for DB connection status and metrics."""
    return jsonify(check_db_health())

@app.route("/")
def index():
    return render_template("index.html")

# ── Service Worker - must be served from / scope ──────────────────────────────
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

# ── Yahoo Finance server-side proxy ───────────────────────────────────────────
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

# ── Yahoo Finance category proxies ────────────────────────────────────────────
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

# ── Yahoo Finance sector, industry, market, tickers, search, lookup proxies ───
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

# ── Yahoo Finance predefined screener proxy ──────────────────────────────────
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

# ── FRED (Federal Reserve) data proxy ────────────────────────────────────────
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

# ── FRED global metadata proxy (releases / sources / tags / categories / series) ──
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

# ── Piston code execution proxy (C++, C#, Rust) ──────────────────────────────
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

# ══════════════════════════════════════════════════════════════════════════
# AI Coding Assistant - multi-provider model catalog + dual-key fallback
#
# Two OpenAI-compatible providers are supported out of the box:
#   • NVIDIA NIM   (https://integrate.api.nvidia.com/v1)  - env: NVIDIA_API_KEY[_2]
#   • Groq         (https://api.groq.com/openai/v1)       - env: GROQ_API_KEY[_2]
#
# NVIDIA NIM is listed first because it gives access to very token-efficient,
# high-quality MoE models (e.g. DeepSeek V4 Flash - only ~13B active params,
# long-context, tuned for coding/agentic tasks) at NVIDIA's free/dev-credit
# tier. Groq remains configured as a fast automatic fallback if NVIDIA is
# rate-limited, out of credits, or its key isn't set.
# ══════════════════════════════════════════════════════════════════════════

# Model list is sourced from build.nvidia.com and console.groq.com/docs -
# verified Aug 2026. Deprecated Groq models (llama-3.3-70b-versatile,
# llama-3.1-8b-instant, shut down Aug 16 2026) are excluded.
MODEL_CATALOG = [
    # ── NVIDIA NIM ────────────────────────────────────────────────────────
    {"id": "deepseek-v4-flash-0731",        "name": "NVIDIA - DeepSeek V4 Flash",       "provider": "NVIDIA NIM"},
    {"id": "deepseek-v4-pro-0813",          "name": "NVIDIA - DeepSeek V4 Pro",         "provider": "NVIDIA NIM"},
    {"id": "nemotron-3.5-lightning-30b-a3b","name": "NVIDIA - Nemotron 3.5 Lightning",  "provider": "NVIDIA NIM"},
    # ── Groq ──────────────────────────────────────────────────────────────
    {"id": "openai/gpt-oss-120b",           "name": "Groq - GPT-OSS 120B",              "provider": "Groq"},
    {"id": "openai/gpt-oss-20b",            "name": "Groq - GPT-OSS 20B",               "provider": "Groq"},
    {"id": "groq/compound",                 "name": "Groq - Compound",                  "provider": "Groq"},
    {"id": "groq/compound-mini",            "name": "Groq - Compound Mini",             "provider": "Groq"},
]

# Provider connection details + in-provider fallback chain (tried in order if
# the requested model 404s / rate-limits / 5xx's on that provider).
PROVIDER_CONFIG = {
    "NVIDIA NIM": {
        "base_url": "https://integrate.api.nvidia.com/v1/chat/completions",
        "key_env":  ["NVIDIA_API_KEY", "NVIDIA_API_KEY_2"],
        "fallback_chain": [
            "deepseek-v4-flash-0731",
            "deepseek-v4-pro-0813",
            "nemotron-3.5-lightning-30b-a3b",
        ],
    },
    "Groq": {
        "base_url": "https://api.groq.com/openai/v1/chat/completions",
        "key_env":  ["GROQ_API_KEY", "GROQ_API_KEY_2"],
        "fallback_chain": [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "groq/compound-mini",
            "groq/compound",
        ],
    },
}


def _model_provider(model_id):
    """Look up which provider a model id belongs to. Defaults to NVIDIA NIM
    for unknown model ids (any 'namespace/model-name' slug is almost always
    an NVIDIA NIM catalog entry), and Groq only for known Groq-style ids."""
    for m in MODEL_CATALOG:
        if m["id"] == model_id:
            return m["provider"]
    return "Groq" if model_id.startswith(("openai/gpt-oss", "groq/", "qwen/qwen3.")) else "NVIDIA NIM"


@app.route("/api/ai/skills")
def ai_skills():
    """Returns catalog of registered panel skills."""
    from pyrunner.skills import list_registered_panel_skills
    return jsonify(list_registered_panel_skills())


def _call_chat_provider(base_url, api_key, model, messages, payload_extra=None):
    """Make a single streaming attempt against an OpenAI-compatible chat
    completions endpoint (works for both NVIDIA NIM and Groq).

    Returns (requests.Response, error_str). error_str is None on success.
    """
    import requests
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "messages": messages, "stream": True}
    if payload_extra:
        payload.update(payload_extra)
    try:
        res = requests.post(url=base_url, headers=headers, json=payload, stream=True, timeout=60)
        return res, None
    except Exception as exc:
        return None, str(exc)


# Status codes that warrant an automatic fallback to the next key/model/provider.
# 404 = model not found / no access to model on this key - try the next option.
_FALLBACK_STATUS_CODES = {404, 429, 500, 502, 503, 504}


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
        model    = body.get("model", "deepseek-v4-flash-0731")
        
        # ── Dynamic Panel Skill Loading ─────────────────────────────────────────
        # Resolves active panel context and loads ONLY its respective SKILL.md:
        #   • "cad"     -> OpenSCAD 3D Modeling & CSG Skill
        #   • "desmos"  -> Desmos LaTeX Math & Analysis Skill
        #   • "data"    -> FRED & Yahoo Finance Data Explorer Skill
        #   • "editor"  -> Pyodide Scientific Python & Visualization Skill
        context = (body.get("context") or "editor").strip().lower()
        panel_sys_prompt = build_panel_system_prompt(context)

        if not messages or messages[0].get("role") != "system":
            messages.insert(0, {"role": "system", "content": panel_sys_prompt})
        else:
            messages[0]["content"] = panel_sys_prompt + "\n\n" + messages[0]["content"]

        # ── Resolve which provider each candidate model belongs to ────────
        requested_provider = _model_provider(model)
        provider_order = [requested_provider] + [p for p in PROVIDER_CONFIG if p != requested_provider]

        configured_keys = {
            p: [os.environ.get(k, "").strip() for k in cfg["key_env"] if os.environ.get(k, "").strip()]
            for p, cfg in PROVIDER_CONFIG.items()
        }

        if not any(configured_keys.values()):
            return jsonify({
                "error": "No AI provider API key is configured. Set NVIDIA_API_KEY "
                         "(recommended) and/or GROQ_API_KEY - each with an optional "
                         "_2 backup key - in your Vercel environment settings."
            }), 400

        res = None
        last_error = None
        success = False

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
                        success = True
                        break  # Success - stream this response

                    try:
                        err_data = res.json()
                        err_msg  = err_data.get("error", {}).get("message", res.text)
                    except Exception:
                        err_msg = res.text

                    last_error = f"[{provider} {label} key, model {target_model}] HTTP {res.status_code}: {err_msg}"

                    if res.status_code in _FALLBACK_STATUS_CODES:
                        res = None
                        continue
                    else:
                        # Non-retryable error (e.g. 400 Bad Request) - surface immediately.
                        return jsonify({"error": f"{provider} API Error ({res.status_code}): {err_msg}"}), res.status_code

                if success:
                    break
            if success:
                break

        # All providers, keys, and fallback models exhausted without success.
        if res is None or not success:
            return jsonify({
                "error": f"Failed to connect to any configured AI provider. Last error: {last_error}"
            }), 503

        # ── Stream the successful response back to the browser ─────────────
        def generate():
            for chunk in res.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk

        return Response(stream_with_context(generate()), content_type="text/event-stream")

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(debug=True)
