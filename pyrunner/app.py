from flask import Flask, render_template, jsonify, request, send_from_directory
import json

# Use __name__ so Flask can locate the templates/static folders correctly.
app = Flask(__name__)
app.name = "run01"

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

# ── AI Coding Assistant endpoints (Groq & Gemini) ────────────────────────────
@app.route("/api/ai/models")
def ai_models():
    models = [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B (Groq)", "provider": "Groq"},
        {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B (Groq)", "provider": "Groq"},
        {"id": "openai/gpt-oss-120b", "name": "GPT-OSS 120B (Groq)", "provider": "Groq"},
        {"id": "openai/gpt-oss-20b", "name": "GPT-OSS 20B (Groq)", "provider": "Groq"},
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash (Google)", "provider": "Google"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro (Google)", "provider": "Google"},
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash (Google)", "provider": "Google"},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash (Google)", "provider": "Google"},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro (Google)", "provider": "Google"}
    ]
    return jsonify(models)

@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    try:
        import os
        import requests
        from flask import Response, stream_with_context

        body = request.get_json(force=True)
        messages = body.get("messages", [])
        model = body.get("model", "llama-3.3-70b-versatile")

        if model.startswith("gemini-"):
            api_key = os.environ.get("GEMINI_API_KEY", "").strip()
            if not api_key:
                return jsonify({"error": "GEMINI_API_KEY environment variable is not set. Please add it to your Vercel settings."}), 400
            url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
        else:
            api_key = os.environ.get("GROQ_API_KEY", "").strip()
            if not api_key:
                return jsonify({"error": "GROQ_API_KEY environment variable is not set. Please add it to your Vercel settings."}), 400
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }

        payload = {
            "model": model,
            "messages": messages,
            "stream": True
        }

        # Make requests call with stream enabled
        res = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
        if res.status_code != 200:
            try:
                err_data = res.json()
                err_msg = err_data.get("error", {}).get("message", res.text)
            except Exception:
                err_msg = res.text
            return jsonify({"error": f"API Error ({res.status_code}): {err_msg}"}), res.status_code

        def generate():
            for chunk in res.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk

        return Response(stream_with_context(generate()), content_type="text/event-stream")

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

if __name__ == "__main__":
    app.run(debug=True)
