from flask import Flask, render_template, jsonify, request, send_from_directory, session
import json
import os
import datetime
from werkzeug.security import generate_password_hash, check_password_hash

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

# ── MongoDB Database Connection (persistent, module-level client) ──────────────
# Cache the MongoClient at module scope so warm Lambda invocations reuse the
# existing TCP connection instead of opening a new one every request.
_mongo_client = None
_mongo_db = None

def get_db():
    global _mongo_client, _mongo_db
    if _mongo_db is not None:
        try:
            _mongo_client.admin.command("ping")
            return _mongo_db
        except Exception:
            _mongo_client = None
            _mongo_db = None

    mongodb_uri = os.environ.get("MONGODB_URI")
    if not mongodb_uri:
        app.logger.warning("MONGODB_URI environment variable is not set.")
        return None

    try:
        from pymongo import MongoClient
        client_kwargs = {
            "serverSelectionTimeoutMS": 5000,
            "connectTimeoutMS": 5000,
            "socketTimeoutMS": 10000,
        }
        try:
            import certifi
            client_kwargs["tlsCAFile"] = certifi.where()
        except Exception:
            pass

        _mongo_client = MongoClient(mongodb_uri, **client_kwargs)
        # URI should include /run01 database name (e.g. .../run01).
        # get_default_database() returns it; fall back to "run01" if not specified.
        _mongo_db = _mongo_client.get_default_database()
        if _mongo_db is None or _mongo_db.name in ("admin", "test"):
            _mongo_db = _mongo_client["run01"]
        return _mongo_db
    except Exception as e:
        app.logger.warning(f"Standard SSL connection failed: {e}. Trying SSL fallback...")
        try:
            from pymongo import MongoClient
            _mongo_client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000,
                                        tlsAllowInvalidCertificates=True)
            _mongo_db = _mongo_client.get_default_database()
            if _mongo_db is None or _mongo_db.name in ("admin", "test"):
                _mongo_db = _mongo_client["run01"]
            return _mongo_db
        except Exception as err2:
            app.logger.error(f"MongoDB connection error: {err2}")
            _mongo_client = None
            _mongo_db = None
            return None

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

@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user_id = session.get("user_id")
    cached_user = session.get("user")

    if not user_id and not cached_user:
        return jsonify({"authenticated": False, "user": None})

    db = get_db()
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
                    "auth_provider": user.get("auth_provider", "password")
                }
                session["user"] = user_info  # Refresh cached user in session
                return jsonify({"authenticated": True, "user": user_info})
        except Exception as exc:
            app.logger.error(f"Error fetching user in auth_me: {exc}")

    # Fallback: return the cached user from the session cookie
    if cached_user:
        return jsonify({"authenticated": True, "user": cached_user})

    return jsonify({"authenticated": False, "user": None})

@app.route("/api/auth/signup", methods=["POST"])
def auth_signup():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400
    
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    db = get_db()
    if db is None:
        return jsonify({"error": "Database connection not configured. Please ensure MONGODB_URI environment variable is set."}), 503

    try:
        existing = db.users.find_one({"email": email})
        if existing:
            return jsonify({"error": "An account with this email already exists."}), 409

        pwd_hash = generate_password_hash(password)
        user_doc = {
            "email": email,
            "password_hash": pwd_hash,
            "name": name or email.split("@")[0],
            "auth_provider": "password",
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }

        result = db.users.insert_one(user_doc)
        user_id = str(result.inserted_id)

        user_info = {
            "id": user_id,
            "email": email,
            "name": user_doc["name"],
            "picture": "",
            "auth_provider": "password"
        }

        session.permanent = True
        session["user_id"] = user_id
        session["user"] = user_info

        return jsonify({"success": True, "user": user_info})
    except Exception as exc:
        app.logger.error(f"Signup exception: {exc}")
        return jsonify({"error": f"Failed to create account: {str(exc)}"}), 500

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    db = get_db()
    if db is None:
        return jsonify({"error": "Database connection not configured. Please ensure MONGODB_URI environment variable is set."}), 503

    try:
        user = db.users.find_one({"email": email})
        if not user:
            return jsonify({"error": "Invalid email or password."}), 401

        if not user.get("password_hash"):
            return jsonify({"error": "This account was registered using Google Sign-In. Please sign in with Google."}), 400

        if not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid email or password."}), 401

        user_id = str(user["_id"])
        user_info = {
            "id": user_id,
            "email": user["email"],
            "name": user.get("name") or user["email"].split("@")[0],
            "picture": user.get("picture", ""),
            "auth_provider": user.get("auth_provider", "password")
        }

        session.permanent = True
        session["user_id"] = user_id
        session["user"] = user_info

        return jsonify({"success": True, "user": user_info})
    except Exception as exc:
        app.logger.error(f"Login exception: {exc}")
        return jsonify({"error": f"Login failed: {str(exc)}"}), 500

@app.route("/api/auth/google", methods=["POST"])
def auth_google():
    data = request.get_json() or {}
    token = data.get("credential") or data.get("token")
    
    email = (data.get("email") or "").strip().lower()
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
            
            email = idinfo.get("email", "").lower()
            name = idinfo.get("name", "")
            picture = idinfo.get("picture", "")
            google_id = idinfo.get("sub", "")
        except Exception as e:
            app.logger.warning(f"Google ID token verification warning: {e}")
            try:
                import jwt
                unverified = jwt.decode(token, options={"verify_signature": False})
                email = unverified.get("email", "").lower()
                name = unverified.get("name", "")
                picture = unverified.get("picture", "")
                google_id = unverified.get("sub", "")
            except Exception as jwt_err:
                app.logger.error(f"JWT decode fallback error: {jwt_err}")

    if not email:
        return jsonify({"error": "Google authentication failed: Email not found."}), 400

    db = get_db()
    user_info = None

    if db is not None:
        try:
            user = db.users.find_one({"email": email})
            if user:
                db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {
                        "name": name or user.get("name"),
                        "picture": picture or user.get("picture"),
                        "google_id": google_id or user.get("google_id"),
                        "last_login": datetime.datetime.now(datetime.timezone.utc)
                    }}
                )
                user_id = str(user["_id"])
            else:
                new_user = {
                    "email": email,
                    "name": name or email.split("@")[0],
                    "picture": picture,
                    "google_id": google_id,
                    "auth_provider": "google",
                    "created_at": datetime.datetime.now(datetime.timezone.utc),
                    "last_login": datetime.datetime.now(datetime.timezone.utc)
                }
                res = db.users.insert_one(new_user)
                user_id = str(res.inserted_id)

            user_info = {
                "id": user_id,
                "email": email,
                "name": name or email.split("@")[0],
                "picture": picture,
                "auth_provider": "google"
            }
            session.permanent = True
            session["user_id"] = user_id
        except Exception as exc:
            app.logger.error(f"Google auth DB error: {exc}")
            user_info = {
                "id": google_id or email,
                "email": email,
                "name": name or email.split("@")[0],
                "picture": picture,
                "auth_provider": "google"
            }
    else:
        user_info = {
            "id": google_id or email,
            "email": email,
            "name": name or email.split("@")[0],
            "picture": picture,
            "auth_provider": "google"
        }

    session.permanent = True
    session["user"] = user_info
    return jsonify({"success": True, "user": user_info})

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"success": True})

@app.route("/")
def index():
    return render_template("index.html")

# ── Service Worker — must be served from / scope ──────────────────────────────
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
# — no ticker/user input needed, so it's served as a static, downloadable
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

# ── AI Coding Assistant endpoints (Groq API — dual-key fallback) ─────────────
# Model list is sourced from console.groq.com/docs/deprecations — Aug 2026 verified.
# llama-3.3-70b-versatile and llama-3.1-8b-instant were shut down on Aug 16, 2026.
@app.route("/api/ai/models")
def ai_models():
    models = [
        {"id": "openai/gpt-oss-120b",  "name": "GPT-OSS 120B — Fastest",  "provider": "Groq"},
        {"id": "openai/gpt-oss-20b",   "name": "GPT-OSS 20B — Balanced",  "provider": "Groq"},
        {"id": "qwen/qwen3.6-27b",     "name": "Qwen 3.6 27B",            "provider": "Groq"},
        {"id": "groq/compound",        "name": "Groq Compound (Agentic)", "provider": "Groq"},
        {"id": "groq/compound-mini",   "name": "Groq Compound Mini",      "provider": "Groq"},
    ]
    return jsonify(models)


def _call_groq(api_key, model, messages, payload_extra=None):
    """Make a single (non-streaming) attempt to the Groq API.

    Returns (requests.Response, error_str).  error_str is None on success.
    """
    import requests
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "messages": messages, "stream": True}
    if payload_extra:
        payload.update(payload_extra)
    try:
        res = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
        return res, None
    except Exception as exc:
        return None, str(exc)


# Status codes that warrant an automatic fallback to the secondary key.
# 404 = model not found / no access to model on this key — try the other key.
_FALLBACK_STATUS_CODES = {404, 429, 500, 502, 503, 504}


@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    """Chat endpoint with automatic dual-key fallback.

    Env vars:
        GROQ_API_KEY   – primary key (required)
        GROQ_API_KEY_2 – secondary / backup key (optional)

    On a rate-limit (HTTP 429) or server error (5xx) from the primary key the
    request is transparently retried with the secondary key.  If the secondary
    key is also unavailable or fails, a descriptive error is returned.
    """
    try:
        import os
        from flask import Response, stream_with_context

        body     = request.get_json(force=True)
        messages = body.get("messages", [])
        model    = body.get("model", "openai/gpt-oss-120b")

        # ── Collect available keys ──────────────────────────────────────────
        key_primary   = os.environ.get("GROQ_API_KEY",   "").strip()
        key_secondary = os.environ.get("GROQ_API_KEY_2", "").strip()

        if not key_primary and not key_secondary:
            return jsonify({
                "error": "No Groq API key is configured. "
                         "Set GROQ_API_KEY (and optionally GROQ_API_KEY_2) "
                         "in your Vercel environment settings."
            }), 400

        # Build an ordered list of keys to try: primary first, then secondary.
        keys_to_try = [k for k in [key_primary, key_secondary] if k]

        # Build an ordered fallback chain of models.
        # If the requested model fails on all keys (404/429/5xx), the next model is tried.
        # All models listed here are confirmed active on Groq as of Aug 2026.
        _FALLBACK_CHAIN = [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.6-27b",
            "groq/compound-mini",
        ]
        # Always try the requested model first, then the chain (deduped, preserving order)
        models_to_try = [model] + [m for m in _FALLBACK_CHAIN if m != model]

        res = None
        last_error = None
        success = False

        for target_model in models_to_try:
            for idx, api_key in enumerate(keys_to_try):
                label = "primary" if idx == 0 else "secondary"
                res, network_err = _call_groq(api_key, target_model, messages)

                if network_err:
                    # Network-level failure — try next key
                    last_error = f"[{label} key, model {target_model}] Network error: {network_err}"
                    res = None
                    continue

                if res.status_code == 200:
                    success = True
                    break  # Success — stream this response

                # Parse error response details
                try:
                    err_data = res.json()
                    err_msg  = err_data.get("error", {}).get("message", res.text)
                except Exception:
                    err_msg = res.text

                last_error = f"[{label} key, model {target_model}] HTTP {res.status_code}: {err_msg}"

                # If this status code warrants fallback (404, 429, 5xx), try the next key/model
                if res.status_code in _FALLBACK_STATUS_CODES:
                    res = None
                    continue
                else:
                    # Non-retryable error (e.g., 400 Bad Request, etc.)
                    return jsonify({"error": f"Groq API Error ({res.status_code}): {err_msg}"}), res.status_code

            if success:
                break

        # All keys and fallback models exhausted without a successful response
        if res is None or not success:
            return jsonify({
                "error": f"Failed to connect to Groq API. All keys/models failed. Last error: {last_error}"
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
