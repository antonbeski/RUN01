---
name: data-explorer
description: Authoritative guide for financial and macroeconomic data ingestion, time-series modeling, and analysis using Yahoo Finance and FRED APIs in RUN01.
argument-hint: "[financial-instrument-or-macro-series] [analysis-type]"
metadata:
  author: run01
  version: "2.0.0"
---

# Financial & Macroeconomic Data Explorer Skill

This skill instructs the AI on querying, transforming, and modeling live financial assets (Yahoo Finance) and over 930,000 macroeconomic time-series indicators (Federal Reserve Economic Data / FRED) inside RUN01 without CORS restrictions.

---

## 1. Built-in Ingestion APIs in Python

RUN01 pre-injects asynchronous helper functions directly into the browser Python environment:

### Yahoo Finance Ingestion (`yf_download`)
Bypasses browser CORS via RUN01 serverless proxy and returns a Pandas DataFrame with a `DatetimeIndex`:
```python
# Available parameters:
# ticker: 'AAPL', 'TSLA', 'MSFT', 'NVDA', 'BTC-USD', 'SPY', '^GSPC'
# period: '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'
# interval: '1m', '5m', '15m', '30m', '1h', '1d', '1wk', '1mo'

df = await yf_download('NVDA', period='6mo', interval='1d')
print(df.tail())
# Columns: Open, High, Low, Close, Volume
```

### Advanced Asset Fundamentals & Options (`yf_fetch`)
```python
# Fetch balance sheets, income statements, option chains, or recommendations
info = await yf_info('AAPL')
print("Market Cap:", info.get("marketCap"))

financials = await yf_fetch('AAPL', 'financials')
```

### Federal Reserve Macroeconomic Data (`FRED`)
Access normalized macroeconomic time series directly:
- `M1SL` / `M2SL`: Money Supply
- `CPIAUCSL`: Consumer Price Index (Inflation)
- `GDP`: Gross Domestic Product
- `UNRATE`: Unemployment Rate
- `FEDFUNDS`: Effective Federal Funds Rate
- `DGS10`: 10-Year Treasury Constant Maturity Rate
- `T10Y2Y`: 10-Year Treasury minus 2-Year Treasury (Yield Curve Inversion)

---

## 2. Common Financial Modeling Recipes

### Recipe A: Quantitative Volatility & Moving Average Crossover
```python
import matplotlib.pyplot as plt
import numpy as np

# Ingest 1 year of daily equity ticks
df = await yf_download("AAPL", period="1y", interval="1d")

# Rolling moving averages
df["SMA20"] = df["Close"].rolling(window=20).mean()
df["SMA50"] = df["Close"].rolling(window=50).mean()
df["Log_Ret"] = np.log(df["Close"] / df["Close"].shift(1))
annualized_vol = df["Log_Ret"].std() * np.sqrt(252)

print(f"Annualized Volatility: {annualized_vol:.2%}")

plt.figure(figsize=(10, 5))
plt.plot(df.index, df["Close"], label="Close Price", color="#ffffff", lw=1.5)
plt.plot(df.index, df["SMA20"], label="20-Day SMA", color="#38bdf8", lw=1.2)
plt.plot(df.index, df["SMA50"], label="50-Day SMA", color="#f43f5e", lw=1.2)
plt.title(f"AAPL Technical Analysis (Vol: {annualized_vol:.1%})")
plt.legend()
plt.grid(True, alpha=0.25)
plt.show()
```

### Recipe B: Macro Yield Curve & Inversion Analysis
```python
import plotly.graph_objects as go

# Fetch yield curve spread from proxy
df_yield = await yf_download("^TNX", period="2y", interval="1d")

fig = go.Figure()
fig.add_trace(go.Scatter(x=df_yield.index, y=df_yield["Close"], mode="lines", name="10Y Treasury Yield (%)", line=dict(color="#fbbf24")))
fig.update_layout(title="US 10-Year Treasury Yield Trend", template="plotly_dark")
fig.show()
```

---

## 3. WebApp Virtual File System (`/data/`)

RUN01 features an in-browser virtual file system (VFS) powered by Pyodide and backed by IndexedDB. Datasets downloaded from the Data Explorer (FRED macroeconomic series, FRED metadata, predefined screeners) are saved directly into the webapp's `/data/` directory instead of prompting an OS file download.

### Automatic Freshness & Auto-Purge
- Every time a dataset is synced or refreshed, the previous version of the file is automatically purged and deleted before saving the latest data.
- Files persist across browser reloads via IndexedDB and are automatically rehydrated into `/data/` on startup.

### Inspecting Stored Datasets in Python
Use the built-in helper `list_data_files()` to see all files stored in the webapp runtime:
```python
files = list_data_files()
print("Datasets stored in /data/:", files)
```

### Direct Analysis in the Code Panel
Datasets in `/data/` can be read directly with standard Python libraries:
```python
import pandas as pd

# Load any CSV stored in the webapp
df = pd.read_csv('/data/fed_funds_rate.csv')
print(df.head())
```

For JSON metadata:
```python
import json

with open('/data/all_releases.json', 'r', encoding='utf-8') as f:
    releases = json.load(f)
print(f"Loaded {len(releases)} releases")
```

---

## 4. Best Practices
1. Always use `await yf_download(...)` when fetching dynamic live market data because network requests are asynchronous in Pyodide.
2. For curated static datasets and macroeconomic series, load them via Data Explorer into `/data/<filename>` and analyze using standard `pd.read_csv('/data/<filename>')`.
3. Clean missing data with `df.dropna()` or `df.ffill()` before running regressions or statistical tests.
4. Combine tabular summaries with visual charts for immediate verification.
