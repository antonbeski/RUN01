# RUN01 

> **A zero-install, browser-native Python IDE** — edit, execute, and visualise data science workloads entirely client-side via WebAssembly, with server-side proxies for market data and compiled languages.

```
 ██████╗ ██╗   ██╗███╗   ██╗ ██████╗  ██╗
 ██╔══██╗██║   ██║████╗  ██║██╔═══██╗███║
 ██████╔╝██║   ██║██╔██╗ ██║██║   ██║╚██║
 ██╔══██╗██║   ██║██║╚██╗██║██║   ██║ ██║
 ██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝ ██║
 ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝  ╚═╝
```

[![Python](https://img.shields.io/badge/Python-3.11_WASM-3776AB?style=flat-square&logo=python&logoColor=white)](https://pyodide.org)
[![Pyodide](https://img.shields.io/badge/Pyodide-v0.26.4-FFDD00?style=flat-square)](https://pyodide.org/en/stable/usage/api/js-api.html)
[![Monaco](https://img.shields.io/badge/Monaco_Editor-v0.52.0-0078D4?style=flat-square&logo=visual-studio-code&logoColor=white)](https://microsoft.github.io/monaco-editor/)
[![Flask](https://img.shields.io/badge/Flask-3.0.3-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Feature Matrix](#feature-matrix)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Flow](#data-flow)
- [Runtime Execution Model](#runtime-execution-model)
- [Proxy API Reference](#proxy-api-reference)
- [Package Support](#package-support)
- [Service Worker & Caching](#service-worker--caching)
- [Theme System](#theme-system)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Local Development](#local-development)
- [Vercel Deployment](#vercel-deployment)
- [Environment Variables](#environment-variables)
- [Security Considerations](#security-considerations)
- [Performance Tuning](#performance-tuning)
- [Extending Run01](#extending-run01)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## Overview

Run01 is a **premium browser-based Python sandbox** that merges a production-grade code editor with a full scientific Python stack — all executing inside your browser via WebAssembly. There is no backend compute, no container spin-up, and no per-execution billing. The Python runtime boots once per session and stays warm.

The server layer (Flask / Vercel) is intentionally thin: it serves static assets, proxies financial data from Yahoo Finance (bypassing browser CORS), and routes compiled-language jobs (C++, C#, Rust) to the Piston execution engine.

### Design philosophy

| Principle | Implementation |
|-----------|---------------|
| **Zero cold-start** | Pyodide + packages cached via Service Worker on first visit |
| **Privacy-first** | Code never leaves the browser; only `yf_download()` and Piston routes touch the network |
| **Streaming output** | `stdout` lines render immediately as they arrive — no waiting for the run to complete |
| **Visual-first data science** | Matplotlib PNGs and interactive Plotly charts render inline in the console |
| **Monochrome glassmorphic** | Single coherent design language across light and dark modes |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          BROWSER (CLIENT)                            │
│                                                                      │
│  ┌─────────────────────┐    ┌──────────────────────────────────────┐ │
│  │   Monaco Editor     │    │          Output Console              │ │
│  │  (AMD, CDN-loaded)  │    │  ┌─────────┐ ┌────────┐ ┌────────┐  │ │
│  │                     │    │  │ stdout  │ │  PNG   │ │Plotly  │  │ │
│  │  Python / C++ / C#  │    │  │ stream  │ │ chart  │ │ chart  │  │ │
│  │  / Rust source      │    │  └─────────┘ └────────┘ └────────┘  │ │
│  └──────────┬──────────┘    └──────────────────────────────────────┘ │
│             │ getValue()                         ▲                   │
│             ▼                                    │                   │
│  ┌──────────────────────────────────────────┐    │ render            │
│  │         Pyodide (WebAssembly)            │────┘                   │
│  │                                          │                        │
│  │  runPythonAsync(code)                    │                        │
│  │  ├─ stdout → batched callback            │                        │
│  │  │   ├─ __RUN01_IMG__:<b64>  → PNG       │                        │
│  │  │   └─ __RUN01_PLOTLY__:<b64> → JSON    │                        │
│  │  └─ stderr → batched callback            │                        │
│  │                                          │                        │
│  │  Packages (WASM):                        │                        │
│  │  numpy · pandas · scipy · scikit-learn   │                        │
│  │  matplotlib · statsmodels · seaborn      │                        │
│  │  plotly                                  │                        │
│  └────────────┬─────────────────────────────┘                        │
│               │ pyfetch("/api/yf/...")                                │
│               │ (yfinance CORS bypass)                                │
└───────────────┼──────────────────────────────────────────────────────┘
                │ HTTP
┌───────────────┼──────────────────────────────────────────────────────┐
│               ▼            FLASK / VERCEL                            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  GET  /api/yf/<ticker>?period=&interval=   →  yfinance (PyPI)  │ │
│  │  POST /api/run  {language, code}           →  Piston API       │ │
│  │  GET  /sw.js                               →  Service Worker   │ │
│  │  GET  /                                    →  index.html       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                │
                ▼ external
    ┌───────────────────────┐    ┌──────────────────────────┐
    │  Yahoo Finance API    │    │  Piston API (emkc.org)   │
    │  finance.yahoo.com    │    │  C++ · C# · Rust · more  │
    └───────────────────────┘    └──────────────────────────┘
```

---

## Feature Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Python (Pyodide WASM) | ✅ | No server round-trip for execution |
| NumPy / Pandas / SciPy | ✅ | Pre-loaded at startup |
| Scikit-Learn | ✅ | Pre-loaded |
| Statsmodels | ✅ | Pre-loaded |
| Matplotlib inline PNG | ✅ | `plt.show()` patched to emit base64 |
| Seaborn | ✅ | Installed via micropip |
| Plotly interactive charts | ✅ | `fig.show()` patched to emit JSON → rendered with Plotly.js |
| Yahoo Finance (live data) | ✅ | `await yf_download(ticker)` via server proxy |
| Streaming stdout | ✅ | Each `print()` renders immediately |
| C++ / C# / Rust | ✅ | Via `/api/run` → Piston |
| Dark / Light theme | ✅ | Persisted in `localStorage` |
| Service Worker caching | ✅ | Pyodide WASM, Monaco, Plotly cached after first load |
| Draggable split pane | ✅ | Mouse and keyboard (Arrow keys) |
| Download output `.txt` | ✅ | `Ctrl+D` |
| Reset to starter code | ✅ | `Ctrl+R` |
| Cursor position in status bar | ✅ | `ln N, col N` |
| `stdin` support | 🔜 | Roadmap Q3 |
| Multi-file editor | 🔜 | Roadmap Q4 |
| Share snippet via URL | 🔜 | Roadmap Q4 |

---

## Tech Stack

```
Layer            Library / Service           Version       Where it runs
──────────────── ─────────────────────────── ───────────── ──────────────
Python runtime   Pyodide                     0.26.4        Browser (WASM)
Code editor      Monaco Editor               0.52.0        Browser (CDN)
Charts (static)  Matplotlib + Seaborn        latest        Browser (WASM)
Charts (interac) Plotly.js                   2.35.2        Browser (CDN)
ML               Scikit-Learn                latest        Browser (WASM)
Stats            Statsmodels                 latest        Browser (WASM)
Market data      yfinance                    ≥1.4.1        Server (Flask)
Compiled langs   Piston API (emkc.org)       v2            External API
Web server       Flask                       3.0.3         Server
Deployment       Vercel (@vercel/python)     latest        Edge / Lambda
Fonts            Outfit, JetBrains Mono,     variable      Google Fonts CDN
                 Pixelify Sans
SW caching       Service Worker (Cache API)  —             Browser
```

---

## Project Structure

```
run01/
├── api/
│   └── index.py                  # Vercel WSGI entrypoint — imports pyrunner.app
│
├── pyrunner/
│   ├── __init__.py               # Package marker
│   ├── app.py                    # Flask app: routes, yf proxy, Piston proxy
│   ├── requirements.txt          # flask, yfinance
│   │
│   ├── static/
│   │   ├── app.js                # Monaco + Pyodide bootstrap, run loop, output renderer
│   │   ├── style.css             # Monochrome glassmorphic design system
│   │   └── sw.js                 # Service Worker: cache-first CDN strategy
│   │
│   └── templates/
│       └── index.html            # Shell HTML: nav, split panes, init overlay
│
├── vercel.json                   # Build + routing config for Vercel
├── requirements.txt              # Root-level (mirrors pyrunner/requirements.txt)
├── .gitignore
└── README.md                     ← you are here
```

### Key file responsibilities

#### `pyrunner/app.py`
Three distinct responsibilities on a single Flask app object:

1. **Static serving** — `GET /` renders `index.html`; `GET /sw.js` serves the Service Worker with correct `Service-Worker-Allowed: /` header (required for full-origin scope)
2. **Yahoo Finance proxy** — `GET /api/yf/<ticker>` calls `yfinance.Ticker.history()` server-side and returns clean OHLCV JSON. Strips timezone info so `strftime` works across yfinance versions.
3. **Piston proxy** — `POST /api/run` forwards `{language, code}` to `https://emkc.org/api/v2/piston/execute` and relays the result. Timeout: 30 s.

#### `pyrunner/static/app.js`
The heaviest file. Key sections:

- **`PYODIDE_SETUP`** — Python bootstrap string injected into the WASM runtime at startup. Patches `plt.show()` and `fig.show()` to emit `__RUN01_IMG__:` and `__RUN01_PLOTLY__:` sentinel lines on stdout rather than attempting to open a GUI window.
- **`monacoReady`** — Promise that resolves when the AMD loader has finished and the editor is mounted. 30 s timeout (extended from the original 5 s to handle CDN cold-starts).
- **`pyodideReady`** — Calls `loadPyodide()`, then a single `pyodide.loadPackage([...])` to batch-download all stdlib packages in parallel, then `micropip.install(['seaborn', 'plotly'])`.
- **`processOutput()`** — Per-line stdout router: detects sentinels and delegates to `renderImage()` or `renderPlotly()`; everything else goes to `appendLine()`.
- **`getPlotly()`** — Polls `window.Plotly` with exponential back-off, falling back to a dynamic `<script>` inject if the synchronous CDN load raced ahead.

#### `pyrunner/static/sw.js`
Cache-first Service Worker with a versioned cache (`run01-v2`). Only caches `GET` responses from four CDN origins: `cdn.jsdelivr.net`, `cdn.plot.ly`, `fonts.googleapis.com`, `fonts.gstatic.com`. All other requests (including the Flask API routes) pass through uncached.

---

## Data Flow

### Python execution (happy path)

```
User clicks ▶ Run
     │
     ▼
monacoEditor.getValue()  →  raw source string
     │
     ▼
pyodide.setStdout({ batched: processOutput })
pyodide.setStderr({ batched: processOutput })
     │
     ▼
pyodide.runPythonAsync(code)          ← awaited; non-blocking
     │
     ├─ print("hello")
     │       └─→ processOutput("hello", false, block)
     │                └─→ appendLine(...)
     │
     ├─ plt.show()
     │       └─→ _mpl_capture() in WASM
     │                └─→ savefig → base64 PNG
     │                └─→ print("__RUN01_IMG__:<b64>")
     │                         └─→ processOutput detects prefix
     │                                  └─→ renderImage(b64, block)
     │
     ├─ fig.show()
     │       └─→ _plotly_capture() in WASM
     │                └─→ pio.to_json(fig) → base64 UTF-8
     │                └─→ print("__RUN01_PLOTLY__:<b64>")
     │                         └─→ processOutput detects prefix
     │                                  └─→ renderPlotly(b64, block)
     │
     └─ return / raise
              └─→ finishOutputBlock(block, success)
```

### Yahoo Finance proxy flow

```
Python code:  df = await yf_download("AAPL", period="3mo")
                    │
                    ▼ (inside Pyodide)
              pyodide.http.pyfetch("/api/yf/AAPL?period=3mo")
                    │
                    ▼ HTTP GET (same origin — no CORS issue)
              Flask /api/yf/AAPL
                    │
                    ▼
              yfinance.Ticker("AAPL").history(period="3mo", interval="1d")
                    │
                    ▼
              pd.DataFrame → JSON records → jsonify(records)
                    │
                    ▼ HTTP 200 JSON
              resp.json() inside pyfetch
                    │
                    ▼
              pd.DataFrame(data).set_index("Date")   ← returned to caller
```

---

## Runtime Execution Model

### Parallel initialisation

Monaco and Pyodide initialise in parallel via `Promise.all([monacoReady, pyodideReady])`. Neither blocks the other. The UI is unlocked only after both resolve.

```
t=0ms ──► loadPyodide()          ─────────────────────────────────► ✓ (~4-8s cold)
t=0ms ──► require(['vs/editor.main']) ──────────────► ✓ (~1-2s cold)
                                                               │
                                                     Promise.all resolves
                                                               │
                                                    hideOverlay() + btnRun.enable()
```

### Package loading strategy

```python
# Single call — Pyodide resolves the full dependency graph internally
# and downloads all wheels in parallel. Much faster than sequential awaits.
await pyodide.loadPackage([
    'numpy', 'pandas', 'scipy', 'scikit-learn',
    'matplotlib', 'statsmodels', 'micropip',
])

# Pure-Python packages not in Pyodide's package index
micropip = pyodide.pyimport('micropip')
await micropip.install(['seaborn', 'plotly'], keep_going=True)
```

`keep_going=True` means a single package failure (e.g. a transient CDN error) doesn't abort the entire install.

### `plt.show()` interception

```python
# Injected at startup — replaces Matplotlib's GUI backend
def _mpl_capture(*args, **kwargs):
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='#0a0a0a', edgecolor='none')
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    buf.close()
    plt.close('all')
    print(f'__RUN01_IMG__:{b64}', flush=True)   # ← sentinel on stdout

plt.show = _mpl_capture
```

### `fig.show()` interception

```python
import plotly.io as _pio

def _plotly_capture(fig, *args, **kwargs):
    fig_json = _pio.to_json(fig)                           # full Plotly JSON spec
    encoded  = base64.b64encode(fig_json.encode()).decode()
    print(f'__RUN01_PLOTLY__:{encoded}', flush=True)       # ← sentinel on stdout

_pio.show = _plotly_capture
go.Figure.show = lambda self, *a, **kw: _plotly_capture(self, *a, **kw)
```

On the JS side, `renderPlotly()` decodes the base64, parses the JSON, and calls `Plotly.newPlot()` with layout overrides to match the current theme.

---

## Proxy API Reference

### `GET /api/yf/<ticker>`

Fetches OHLCV price history for a given ticker from Yahoo Finance.

**Path parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `ticker` | string | Case-insensitive. Uppercased internally. E.g. `AAPL`, `TSLA`, `BTC-USD` |

**Query parameters**

| Parameter | Default | Valid values |
|-----------|---------|-------------|
| `period` | `1mo` | `1d` `5d` `1mo` `3mo` `6mo` `1y` `2y` `5y` `10y` `ytd` `max` |
| `interval` | `1d` | `1m` `2m` `5m` `15m` `30m` `60m` `90m` `1h` `1d` `5d` `1wk` `1mo` `3mo` |

**Response (200)**

```json
[
  {
    "Date": "2024-01-02",
    "Open": 185.25,
    "High": 186.10,
    "Low": 183.92,
    "Close": 185.64,
    "Volume": 71628400
  }
]
```

**Response (404)** — symbol not found or delisted

```json
{ "error": "No price data found for 'XYZ'. Symbol may be delisted or invalid." }
```

**Response (500)** — upstream failure

```json
{ "error": "<exception message>" }
```

**Usage in Python (inside Run01)**

```python
# Async — must be awaited at top level or inside an async function
df = await yf_download("AAPL", period="6mo", interval="1d")

# df is a pd.DataFrame with DatetimeIndex and columns:
# Open  High  Low  Close  Volume
print(df.tail())
```

---

### `POST /api/run`

Compiles and executes code in a compiled language via the Piston API.

**Request body (JSON)**

```json
{
  "language": "cpp",
  "code": "#include <iostream>\nint main() { std::cout << \"hello\"; }"
}
```

| Field | Type | Valid values |
|-------|------|-------------|
| `language` | string | `cpp` · `csharp` · `rust` |

**Response** — passes through the Piston response shape:

```json
{
  "run": {
    "stdout": "hello",
    "stderr": "",
    "code": 0,
    "signal": null,
    "output": "hello"
  },
  "language": "c++",
  "version": "10.2.0"
}
```

---

## Package Support

### Pre-loaded at startup (Pyodide native wheels)

| Package | Use case |
|---------|----------|
| `numpy` | Numerical arrays, linear algebra, FFT |
| `pandas` | DataFrames, time-series, CSV/JSON I/O |
| `scipy` | Stats, signal processing, optimization |
| `scikit-learn` | ML: regression, classification, clustering, preprocessing |
| `statsmodels` | OLS, GLM, ARIMA, VAR, hypothesis tests |
| `matplotlib` | Static charts (rendered as inline PNG) |
| `micropip` | Pure-Python package installer |

### Installed via micropip at startup

| Package | Use case |
|---------|----------|
| `seaborn` | Statistical visualisation built on Matplotlib |
| `plotly` | Interactive charts (rendered inline via Plotly.js) |

### Available via `micropip.install()` at runtime

Any pure-Python package on PyPI that has no compiled C/Fortran extensions. Examples:

```python
import micropip
await micropip.install('sympy')       # symbolic mathematics
await micropip.install('networkx')    # graph algorithms
await micropip.install('faker')       # test data generation
```

### Not available in WASM

Packages with native extensions that haven't been compiled for Emscripten/WASM:

- `yfinance` — use `await yf_download()` instead
- `tensorflow`, `torch` — too large / not WASM-compiled
- `psycopg2`, `pymysql` — no socket access in browser

---

## Service Worker & Caching

The Service Worker (`/sw.js`) implements a **cache-first strategy** for CDN assets. This means repeat visits load in under 500 ms regardless of network speed — Pyodide's ~12 MB WASM bundle is served from the browser cache.

### Cache scope

| Origin | What's cached |
|--------|--------------|
| `cdn.jsdelivr.net` | Pyodide WASM + wheels, Monaco editor |
| `cdn.plot.ly` | Plotly.js dist |
| `fonts.googleapis.com` | Font CSS |
| `fonts.gstatic.com` | Font files (woff2) |

All Flask routes (`/`, `/api/*`, `/sw.js`) bypass the cache intentionally.

### Cache versioning

The cache is keyed by `CACHE_VERSION = 'run01-v2'`. On SW activation, all caches with a different key are deleted. To bust the cache on a new release, increment this constant in `sw.js`.

```javascript
const CACHE_VERSION = 'run01-v3';  // ← bump on CDN library upgrades
```

### Registering the SW

The SW is registered at the end of `index.html`:

```javascript
navigator.serviceWorker.register('/sw.js')
```

The `/sw.js` route sets `Service-Worker-Allowed: /` so the worker can control the full origin (not just `/static/*`).

---

## Theme System

Run01 ships with two complete themes driven by a single `data-theme` attribute on `<html>`.

### CSS custom properties

| Variable | Dark | Light | Role |
|----------|------|-------|------|
| `--bg` | `#050505` | `#F2F2F7` | Page background |
| `--glass-bg` | `rgba(255,255,255,0.02)` | `rgba(255,255,255,0.75)` | Panel fill |
| `--glass-border` | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.08)` | Panel stroke |
| `--text` | `#F5F5F7` | `#1D1D1F` | Primary text |
| `--text-muted` | `#8E8E93` | `#6E6E73` | Secondary text |
| `--text-dim` | `#48484A` | `#A1A1A6` | Tertiary / disabled |
| `--white` | `#FFFFFF` | `#000000` | Accent / CTA fill |
| `--black` | `#000000` | `#FFFFFF` | Accent / CTA text |

### Monaco theme mapping

| App theme | Monaco theme |
|-----------|-------------|
| `dark` | `run01-dark` (base: `vs-dark`, transparent background) |
| `light` | `run01-light` (base: `vs`, transparent background) |

Both themes use `editor.background: #00000000` so the editor's glass panel shows through.

### Persistence

```javascript
localStorage.setItem('run01-theme', 'dark' | 'light')
```

The saved theme is applied before first paint to avoid flash-of-wrong-theme (FOWT).

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + Enter` | Run code |
| `Ctrl/⌘ + D` | Download output as `.txt` |
| `Ctrl/⌘ + R` | Reset editor to starter code |
| `Ctrl/⌘ + Z` | Undo (Monaco native) |
| `Ctrl/⌘ + Shift + Z` | Redo (Monaco native) |
| `Ctrl/⌘ + /` | Toggle line comment (Monaco native) |
| `Alt + ←/→` | Navigate word (Monaco native) |
| `Tab` on resize handle | Focus the resize handle |
| `←/→` on resize handle | Move divider 20 px |
| `Shift + ←/→` on handle | Move divider 50 px |

---

## Local Development

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| Python | 3.10 |
| pip | 23.x |
| A modern browser | Chrome 115+, Firefox 116+, Safari 16.4+ |

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/run01.git
cd run01

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the development server
python pyrunner/app.py
```

Open [http://localhost:5000](http://localhost:5000). Flask runs in debug mode (`debug=True`) so the server reloads on file changes.

### First-run experience

On first load, the browser fetches ~15 MB of CDN assets (Pyodide WASM, Monaco, Plotly). This takes 5–20 s depending on connection speed. All assets are cached by the Service Worker; subsequent loads take under 500 ms.

---

## Vercel Deployment

### How it works

`vercel.json` routes all traffic to `api/index.py`, which imports the Flask `app` object from `pyrunner.app`. Vercel's `@vercel/python` builder wraps it as a serverless WSGI function.

```json
{
  "builds": [{ "src": "api/index.py", "use": "@vercel/python" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.py" }]
}
```

```python
# api/index.py — Vercel detects the `app` name automatically
from pyrunner.app import app
```

### Deploy steps

```bash
# Install Vercel CLI (one-time)
npm i -g vercel

# Link and deploy
vercel --prod
```

Or push to GitHub and connect the repository in the [Vercel dashboard](https://vercel.com/new) — Vercel will auto-deploy on every push to `main`.

### Limitations on Vercel

| Constraint | Value | Impact |
|------------|-------|--------|
| Function timeout | 60 s (Pro) / 10 s (Hobby) | Piston proxy: fine; yf proxy: fine for most tickers |
| Function memory | 1024 MB | yfinance + pandas fit comfortably |
| Payload size | 4.5 MB request / 4.5 MB response | Chart JSON from Piston is well under limit |
| Cold-start | ~300 ms | Flask import is fast; no heavy ML imports server-side |

---

## Environment Variables

Run01 has no required environment variables for its core functionality. The following are optional:

| Variable | Default | Purpose |
|----------|---------|---------|
| `FLASK_ENV` | `production` | Set to `development` locally for debug mode |
| `FLASK_DEBUG` | `0` | Set to `1` to enable auto-reloader |
| `PISTON_URL` | `https://emkc.org/api/v2/piston/execute` | Override Piston endpoint (e.g. self-hosted) |

Set these in a `.env` file locally (never commit) or as Vercel environment variables in the dashboard.

---

## Security Considerations

### What executes where

| Code | Where it runs | Isolation |
|------|--------------|-----------|
| Python (user code) | Browser WASM sandbox | Full browser sandbox; no file system, no raw sockets |
| C++ / C# / Rust | Piston API (emkc.org) | Piston uses isolated containers with CPU/memory limits |
| Flask (yf proxy) | Vercel serverless | Receives only a ticker string; no user code touches the server |

### CORS

The yf proxy exists specifically because `finance.yahoo.com` blocks cross-origin requests from browsers. By routing through the same-origin Flask endpoint, Pyodide's `pyfetch` works without any CORS headers.

### Input sanitisation

The yf proxy passes `ticker` through `yfinance.Ticker(ticker.upper())` — yfinance validates the symbol upstream. Malformed tickers return a 404 with an error message; they never reach the shell.

The Piston proxy only forwards `language` (validated against an allowlist) and `code` (opaque string forwarded as-is). Piston handles sandboxing.

### Service Worker

The SW only caches CDN `GET` responses. It never intercepts Flask API calls (`/api/*`) or the SW file itself (`/sw.js`), preventing stale proxy responses.

---

## Performance Tuning

### Reduce startup time

1. **Cache hit** — After first load, the SW serves Pyodide from the browser cache. No action needed.
2. **Preload hints** — `index.html` has `<link rel="preload">` for Pyodide, Monaco loader, and Plotly. The browser starts fetching them before the parser hits the `<script>` tags.
3. **Parallel package load** — The single `pyodide.loadPackage([...])` call downloads all wheels in parallel. Avoid splitting this into multiple sequential calls.
4. **`micropip.install` last** — Pure-Python packages (seaborn, plotly) via micropip run after the heavier WASM packages, so they don't block the critical path.

### Reduce chart render time

- Matplotlib: use `dpi=100` instead of `150` for faster PNG encoding at the cost of resolution.
- Plotly: use `plotly.graph_objects` (JSON-serialisable) rather than `plotly.express` figures backed by large DataFrames — `pio.to_json` is faster on simpler traces.

### Service Worker cache eviction

Browsers cap the Cache Storage quota (typically 20–80% of available disk). If the quota is exceeded, the oldest caches are evicted. Pyodide's 12 MB WASM file is the largest single asset; on devices with very limited storage, the SW may fail to cache it. The SW handles this gracefully — failed cache writes are non-blocking.

---

## Extending Run01

### Adding a new server-side language (Piston)

1. Look up the language slug at [Piston runtimes](https://emkc.org/api/v2/piston/runtimes).
2. Add an entry to `PISTON_LANGS` in `app.py`:
   ```python
   PISTON_LANGS = {
       "cpp":    "c++",
       "csharp": "csharp",
       "rust":   "rust",
       "go":     "go",      # ← new
   }
   ```
3. Add a `<button class="lang-tab" data-lang="go">` in `index.html`.
4. Add a `go` entry to `STARTER_CODES` and `LANG_META` in `app.js`.
5. Wire the tab click handler in `app.js`.

### Adding a new Python package

**If it's in Pyodide's package index** (compiled wheel available):
```javascript
// In initPyodide() in app.js:
await pyodide.loadPackage(['numpy', 'pandas', ..., 'sympy']);  // add here
```

**If it's pure Python** (no C extensions):
```javascript
// In initPyodide() in app.js:
await micropip.install(['seaborn', 'plotly', 'your-package']);
```

**If neither works** — the package requires C extensions not in Pyodide's index. Consider a server-side proxy pattern (like the yf proxy) or a separate Piston route.

### Customising the theme

All design tokens live in `:root` and `[data-theme="light"]` in `style.css`. The entire system is driven by 7 CSS custom properties; changing them updates every component simultaneously.

```css
:root {
  --bg:           #050505;   /* page background */
  --glass-bg:     rgba(255,255,255,0.02);
  --glass-border: rgba(255,255,255,0.07);
  --text:         #F5F5F7;
  --text-muted:   #8E8E93;
  --white:        #FFFFFF;   /* primary accent */
  --black:        #000000;   /* inverse accent */
}
```

---

## Troubleshooting

### Pyodide fails to load

**Symptoms:** Overlay stays visible; status shows "Python init failed".

**Causes & fixes:**
- **CDN blocked** by a corporate firewall or ad-blocker. Whitelist `cdn.jsdelivr.net`.
- **Browser too old.** Pyodide requires `SharedArrayBuffer`. Check `crossOriginIsolated` in DevTools console. If `false`, the server is missing `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers (not required on Vercel / localhost, but required on some custom servers).
- **Low memory device.** Pyodide + packages consume ~300 MB of heap. On devices with < 2 GB RAM, the WASM instantiation may fail.

### `yf_download` returns 404

**Symptoms:** `ValueError: No price data found for 'XYZ'.`

**Causes:** Invalid ticker, weekend/holiday (no `1d` data), or intraday interval requested for a period > 60 days (Yahoo Finance limitation).

```python
# Fine — 3 months of daily data
df = await yf_download("AAPL", period="3mo", interval="1d")

# Error — intraday data is only available for the last 60 days
df = await yf_download("AAPL", period="1y", interval="1h")  # ← will fail
```

### `ModuleNotFoundError: No module named 'yfinance'`

You imported `yfinance` directly in your code. `yfinance` cannot run inside the browser WASM sandbox. Use the proxy helper instead:

```python
# ✗ Wrong
import yfinance as yf
df = yf.Ticker("AAPL").history(period="3mo")

# ✓ Correct
df = await yf_download("AAPL", period="3mo")
```

### Monaco editor blank / not loading

**Symptom:** Editor area is blank; no syntax highlighting.

**Fix:** The AMD loader (`loader.js`) must be available before `app.js` runs. The script tags are ordered: Monaco loader (sync) → Pyodide (defer) → app.js (defer). If the CDN is slow, the 30 s timeout in `monacoReady` will resolve gracefully without the editor, so Run01 still works (you can paste code into a textarea fallback).

### Charts not rendering after `plt.show()` or `fig.show()`

**Cause:** `PYODIDE_SETUP` was not executed at startup (e.g. a previous error aborted initialisation).

**Fix:** Open DevTools → Console and look for errors from `initPyodide()`. Re-run the page.

### Piston proxy 500 errors

**Cause:** The Piston API at `emkc.org` is a free community service with occasional downtime.

**Fix:** Self-host Piston: [https://github.com/engineer-man/piston](https://github.com/engineer-man/piston) and set `PISTON_URL` to your instance.

---

## Roadmap

### Q3 2025
- [ ] `stdin` support via a modal prompt interceptor
- [ ] Keyboard-accessible theme toggle

### Q4 2025
- [ ] Multi-file editor (virtual filesystem backed by `pyodide.FS`)
- [ ] Snippet sharing via URL (code encoded in fragment hash, no server storage)
- [ ] `pip install` UI: type a package name, micropip installs it into the running session

### 2026
- [ ] Collaborative editing (WebRTC or Liveblocks)
- [ ] Jupyter notebook import (.ipynb → Run01 cells)
- [ ] Export to Colab / Kaggle

---

## Contributing

Contributions are welcome. Please open an issue first for non-trivial changes.

### Branch conventions

| Branch | Purpose |
|--------|---------|
| `main` | Production; auto-deploys to Vercel |
| `dev` | Integration branch for feature PRs |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |

### Commit style

```
feat: add stdin modal interceptor
fix: extend Monaco AMD timeout from 5s to 30s
docs: add Piston proxy API reference
perf: batch all pyodide.loadPackage() calls into single await
```

### Local linting

```bash
# Python
pip install ruff
ruff check pyrunner/

# JavaScript (optional — no bundler, so ESLint runs standalone)
npx eslint pyrunner/static/app.js
```

---

## License

MIT © Run01 Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

---

<div align="center">
  <sub>Built with Pyodide · Monaco · Flask · Vercel</sub>
</div>
