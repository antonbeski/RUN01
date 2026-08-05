# RUN01 IDE — Capabilities, Limitations & AI Coding Guidelines

This document outlines the exact runtime environment, constraints, built-in helpers, and code generation guidelines for **RUN01** (browser-based Python IDE).

---

## 1. Core Architecture & Limitations

| Feature / Aspect | Implementation / Limitation |
|---|---|
| **Python Engine** | **Pyodide v0.26.4** running inside WebAssembly (WASM) directly in the browser. |
| **Network & Sockets** | Raw TCP/UDP sockets and un-proxied HTTP requests to arbitrary domains are **blocked** by browser CORS sandbox rules. |
| **yfinance Direct Import** | `import yfinance as yf` **DOES NOT WORK** in the browser sandbox. You MUST use the pre-injected async helpers listed below instead. |
| **Top-Level `await`** | Top-level `await` is **natively supported** in Pyodide's `runPythonAsync`. You can write `df = await yf_download(...)` directly without `asyncio.run()`. |
| **Pre-Installed Packages** | `numpy`, `pandas`, `scipy`, `scikit-learn`, `statsmodels`, `matplotlib`, `seaborn`, `plotly`. Third-party C-extension binaries that are not compiled into Pyodide cannot be dynamically installed via pip. |
| **Multi-Language Support** | Python runs client-side in Pyodide WASM. C++, C#, and Rust run server-side via Piston API proxy (`/api/run`). |

---

## 2. Pre-Injected Async Data Helpers

All yfinance and FRED requests are proxied server-side by the RUN01 Flask backend to bypass browser CORS restrictions. The following helpers are pre-injected into Pyodide's global scope:

### Stock & Financial Data (yfinance proxy)

```python
# 1. Fetch OHLCV Price History
df = await yf_download(ticker="AAPL", period="3mo", interval="1d")
# Returns: pandas DataFrame indexed by 'Date' with columns [Open, High, Low, Close, Volume]

# 2. Company Info & Metadata
info = await yf_info("AAPL")  # Returns dict with company summary, sector, P/E, market cap, etc.

# 3. Financial Statements
financials = await yf_financials("AAPL", category="financials")  # Income statement
balance = await yf_balance_sheet("AAPL", category="balance_sheet")  # Balance sheet
cashflow = await yf_cashflow("AAPL", category="cashflow")  # Cash flow statement

# 4. Dividends & Corporate Actions
actions = await yf_actions("AAPL")
dividends = await yf_dividends("AAPL")
splits = await yf_splits("AAPL")

# 5. Analyst Recommendations & Holders
recs = await yf_recommendations("AAPL")
holders = await yf_holders("AAPL", category="institutional_holders")

# 6. Options Chain
expiries = await yf_options("AAPL")  # Returns list of available expiration dates
chain = await yf_option_chain("AAPL", expiry="2026-08-20")  # Returns {"calls": DataFrame, "puts": DataFrame}

# 7. Sector, Industry & Market Metrics
tech_sector = await yf_sector(key="technology", category="overview")
software_ind = await yf_industry(key="software-infrastructure", category="overview")
market_status = await yf_market(category="status", market_id="US")

# 8. Tickers, Search & News
tickers_data = await yf_tickers(symbols="AAPL MSFT GOOG")
search_res = await yf_search(query="apple")
news_articles = await yf_news("AAPL")
```

### Macroeconomic Data (FRED proxy)

```python
# Fetch FRED Economic Series (e.g. GDP, CPIAUCSL, FEDFUNDS, UNRATE)
gdp_data = await fred_download(series_id="GDP", limit=100, sort_order="desc")
# Returns: dict containing 'series_id', 'title', 'units', 'frequency', and 'df' (DataFrame indexed by date)
```

---

## 3. Plotting & Chart Interception

RUN01 automatically intercepts plot outputs and renders them directly inside the console:

- **Matplotlib & Seaborn**:
  - `plt.show()` is automatically overridden to capture figures as PNG images and render them inline in the output panel.
  - **Rule**: Always call `plt.show()` after creating Matplotlib or Seaborn plots.

- **Plotly**:
  - `fig.show()` is automatically overridden to serialize Plotly figures as JSON and render interactive Plotly.js charts inline in the output panel.
  - **Rule**: Always call `fig.show()` after creating Plotly figures.

---

## 4. Antigravity / Cursor AI Interactive Code Workflow

When an AI model generates Python code:
1. Every code block inside ````python ... ```` fences is rendered with:
   - **`▶ Apply`**: Replaces or inserts the code directly into the Monaco Editor.
   - **`⚡ Agree & Run`**: Replaces the editor code AND immediately executes it inside the Pyodide WASM runtime (`triggerRun()`).
   - **`Copy`**: Copies code to clipboard.
2. The AI assistant system prompt automatically includes these guidelines and the current editor code + console output context on every message.
