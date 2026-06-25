from flask import Flask, render_template, jsonify, request

# Use __name__ so Flask can locate the templates/static folders correctly.
app = Flask(__name__)
# Application display name
app.name = "run01"

@app.route("/")
def index():
    return render_template("index.html")

# ── Yahoo Finance server-side proxy ───────────────────────────────────────────
# Pyodide runs inside the browser sandbox; direct HTTP requests to external
# hosts like fc.yahoo.com are blocked by CORS policy. This endpoint fetches
# stock data server-side (no CORS restrictions) and returns clean JSON to the
# browser, which Pyodide can consume via pyodide.http.pyfetch("/api/yf/...").
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

        # Convert DatetimeIndex to ISO strings so JSON serialisation works
        hist.index = hist.index.strftime("%Y-%m-%d")
        records = hist.reset_index().rename(columns={"index": "Date"}).to_dict(orient="records")
        return jsonify(records)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

if __name__ == "__main__":
    app.run(debug=True)
