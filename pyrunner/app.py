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
        if category == "options": return jsonify(list(t.options))
        if category == "news": return jsonify(t.news)
        if category == "info": return jsonify(t.info)
        if category == "fast_info": return jsonify(dict(t.fast_info))
        if category == "calendar": return jsonify(t.calendar)

        # Dynamically get any other attribute (insider_transactions, earnings_dates, etc.)
        if not hasattr(t, category):
            return jsonify({"error": f"Unsupported or invalid category: {category}"}), 400
            
        data = getattr(t, category)
        
        if callable(data):
            # If it's a method requiring no args
            try:
                data = data()
            except Exception:
                return jsonify({"error": f"Cannot invoke method {category}() automatically."}), 400

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
            return jsonify(df.to_dict(orient="records"))
        
        elif isinstance(data, dict) or isinstance(data, list):
            return jsonify(data)
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
        return jsonify({"calls": calls, "puts": puts})
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

if __name__ == "__main__":
    app.run(debug=True)
