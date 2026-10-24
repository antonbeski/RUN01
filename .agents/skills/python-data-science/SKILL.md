---
name: python-data-science
description: Authoritative guide for Python scientific computing, data analysis, machine learning, and visualization in RUN01's in-browser Pyodide WASM runtime.
argument-hint: "[analysis-task] [code-requirements]"
metadata:
  author: run01
  version: "2.1.0"
---

# Python Data Science & IDE Skill (Pyodide WASM)

This skill instructs the AI on generating high-performance, error-free Python data science, statistical analysis, machine learning, and visualization code inside RUN01.

---

## 1. Runtime Environment & Available Modules

RUN01 executes Python code **100% inside the user's browser** via Pyodide v0.26.4 (CPython 3.12 compiled to WebAssembly). There are zero server compute roundtrips and zero manual installs needed.

### ⛔ CRITICAL: NEVER WRITE `import yfinance`
- `yfinance` is NOT a pure WASM package and direct requests to Yahoo Finance are blocked by browser CORS.
- **NEVER** write `import yfinance` or `import yf`! Writing `import yfinance` causes `ModuleNotFoundError: No module named 'yfinance'`.
- Instead, RUN01 provides **built-in pre-injected asynchronous financial ingestion functions** that communicate with RUN01's serverless CORS proxy:

### ✅ BUILT-IN PRE-INJECTED RUN01 APIS:
These functions are already imported and available at the top level of the environment:

1. **`await yf_download(ticker, period="1mo", interval="1d")`**:
   - Fetches historical equity, crypto, ETF, index data.
   - Returns a `pd.DataFrame` with a `DatetimeIndex` and columns: `['Open', 'High', 'Low', 'Close', 'Volume']`.
   - Periods: `'1d'`, `'5d'`, `'1mo'`, `'3mo'`, `'6mo'`, `'1y'`, `'2y'`, `'5y'`, `'max'`.
   - Intervals: `'1m'`, `'5m'`, `'15m'`, `'30m'`, `'1h'`, `'1d'`, `'1wk'`, `'1mo'`.
   - Example:
     ```python
     df = await yf_download('AAPL', period='3mo', interval='1d')
     print(df.tail())
     print(f"Latest Close: ${df['Close'].iloc[-1]:.2f}")
     ```

2. **`await yf_info(ticker)`**:
   - Returns a dictionary with company metadata, market cap, P/E ratio, sector, etc.
   - Example:
     ```python
     info = await yf_info('AAPL')
     print("Company:", info.get("shortName"), "Market Cap:", info.get("marketCap"))
     ```

3. **`await yf_fetch(ticker, category)`**:
   - Fetches categories like `'financials'`, `'balance_sheet'`, `'cashflow'`, `'news'`.

4. **`show_desmos(*expressions, title="Desmos Math Graph")`** or **`desmos.plot(...)`**:
   - Renders an interactive Desmos mathematical curve directly inside the console output.
   - Example:
     ```python
     desmos.plot("y = \\sin(x)", "y = \\cos(x)", title="Trig Waves")
     ```

5. **`list_data_files()`**:
   - Returns a list of filenames stored in the in-browser `/data/` virtual filesystem.

---

### Pre-loaded Scientific Libraries (Standard Imports)
- **Numerical & Array Operations**: `import numpy as np`, `import scipy`
- **Data Manipulation**: `import pandas as pd`
- **Machine Learning**: `import sklearn`, `from sklearn.ensemble import ...`, `from sklearn.model_selection import ...`
- **Econometrics & Statistics**: `import statsmodels.api as sm`
- **Static Visualizations**: `import matplotlib.pyplot as plt`, `import seaborn as sns`
- **Interactive Visualizations**: `import plotly.graph_objects as go`, `import plotly.express as px`
- **Symbolic Math**: `import sympy as sp`

---

## 2. Output & Visualization Standards

1. **Matplotlib & Seaborn Plots**:
   - Always end plot scripts with `plt.show()`.
   - RUN01 automatically intercepts `plt.show()`, encodes the figure to a high-DPI inline PNG, and displays it seamlessly in the output pane.
   - Always set `plt.figure(figsize=(9, 4.5), dpi=100)`.
   - Always style with dark/modern palette: `plt.grid(True, alpha=0.25)`, bright lines (`#38bdf8`, `#34d399`, `#f43f5e`, `#fbbf24`).

2. **Plotly Interactive Charts**:
   - Always call `fig.show()`.
   - Always use `template="plotly_dark"` in `fig.update_layout()`.

3. **Terminal Output & Prints**:
   - Standard output via `print(...)` streams in real time to the output console.

---

## 3. Autonomous Execution & Editor Control Protocol

RUN01 has an embedded **Autonomous Repair Loop (`AutonomousRepairLoop`)**.

### How the AI Controls the Code Editor:
1. Whenever you generate Python code enclosed in ````python ... ````:
   - RUN01 **automatically extracts the code block** and injects it directly into the user's Monaco Code Editor via `monacoEditor.setValue(code)`.
   - RUN01 **immediately executes the code** in the browser Pyodide WASM runtime.
   - If any exception or runtime error occurs, RUN01 captures the exact traceback, re-prompts the AI, applies the repair, and re-executes until **0 errors** are achieved.
2. Therefore, **always provide complete, immediately runnable Python code** enclosed inside standard ````python ... ```` fences!
3. Never use placeholders like `# rest of code here` or `...`. Always write the complete, working implementation.

---

## 4. End-to-End Stock Analysis Recipe (Reference)

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# 1. Fetch live historical stock data via RUN01 built-in API
ticker = "AAPL"
df = await yf_download(ticker, period="6mo", interval="1d")

print(f"Loaded {len(df)} days of {ticker} market data.")
print(df.tail(3)[['Open', 'High', 'Low', 'Close', 'Volume']])

# 2. Compute Technical Indicators
df['SMA20'] = df['Close'].rolling(window=20).mean()
df['SMA50'] = df['Close'].rolling(window=50).mean()

# 3. Plot High-DPI Chart
plt.figure(figsize=(10, 5), dpi=100)
plt.plot(df.index, df['Close'], label=f"{ticker} Close", color="#ffffff", lw=1.8)
plt.plot(df.index, df['SMA20'], label="20-Day SMA", color="#38bdf8", lw=1.4)
plt.plot(df.index, df['SMA50'], label="50-Day SMA", color="#f43f5e", lw=1.4)
plt.title(f"{ticker} Stock Price & Moving Averages", color="#ffffff", fontsize=13)
plt.xlabel("Date", color="#a3a3a3")
plt.ylabel("Price (USD)", color="#a3a3a3")
plt.grid(True, alpha=0.2)
plt.legend(facecolor="#18181b", edgecolor="#3f3f46", labelcolor="#ffffff")
plt.tight_layout()
plt.show()
```
