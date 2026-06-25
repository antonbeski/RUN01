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
        period   = request.args.get("period",   "1mo")
        interval = request.args.get("interval", "1d")

        t    = yf.Ticker(ticker.upper())
        hist = t.history(period=period, interval=interval)

        if hist.empty:
            return jsonify({"error": f"No price data found for '{ticker}'. "
                                     f"Symbol may be delisted or invalid."}), 404

        # Strip timezone so strftime works across yfinance versions
        if hist.index.tz is not None:
            hist.index = hist.index.tz_convert(None)

        hist.index.name = "Date"
        hist.index = hist.index.strftime("%Y-%m-%d")

        # Drop non-OHLCV columns (Dividends, Stock Splits) for clean output
        ohlcv_cols = [c for c in hist.columns if c in
                      {"Open", "High", "Low", "Close", "Volume"}]
        records = hist[ohlcv_cols].reset_index().to_dict(orient="records")
        return jsonify(records)

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
