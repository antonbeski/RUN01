---
name: python-data-science
description: Authoritative guide for Python scientific computing, data analysis, machine learning, and visualization in RUN01's in-browser Pyodide WASM runtime.
argument-hint: "[analysis-task] [code-requirements]"
metadata:
  author: run01
  version: "2.0.0"
---

# Python Data Science & IDE Skill (Pyodide WASM)

This skill instructs the AI on generating high-performance, error-free Python data science, statistical analysis, machine learning, and visualization code inside RUN01.

---

## 1. Runtime Environment & Installed Libraries

RUN01 executes Python code **100% inside the user's browser** via Pyodide v0.26.4 (CPython 3.12 compiled to WebAssembly). There are zero server compute roundtrips and zero installs needed.

### Pre-loaded Scientific Libraries
- **Numerical & Array Operations**: `numpy`, `scipy`
- **Data Manipulation**: `pandas`
- **Machine Learning**: `scikit-learn` (regressors, classifiers, clustering, PCA, cross-validation)
- **Econometrics & Statistics**: `statsmodels` (OLS, time series ARIMA, hypothesis tests)
- **Static Visualizations**: `matplotlib` (using `Agg` backend), `seaborn`
- **Interactive Visualizations**: `plotly` (`plotly.graph_objects`, `plotly.express`)
- **Symbolic Math**: `sympy`

---

## 2. Output & Visualization Standards

1. **Matplotlib & Seaborn Plots**:
   - Always end plot scripts with `plt.show()`.
   - RUN01 automatically intercepts `plt.show()`, encodes the figure to a high-DPI inline PNG, and displays it seamlessly in the output pane.
   - Example:
     ```python
     import matplotlib.pyplot as plt
     import numpy as np

     x = np.linspace(0, 10, 200)
     y = np.sin(x) * np.exp(-0.1 * x)

     plt.figure(figsize=(8, 4.5), dpi=100)
     plt.plot(x, y, label="Damped Wave", color="#ffffff", lw=2)
     plt.title("Damped Harmonic Oscillation")
     plt.grid(True, alpha=0.3)
     plt.legend()
     plt.show()
     ```

2. **Plotly Interactive Charts**:
   - Always call `fig.show()`.
   - RUN01 renders the interactive Plotly JSON directly into an interactive vector canvas inside the output pane with zoom, pan, and hover tooltips.
   - Example:
     ```python
     import plotly.graph_objects as go
     import numpy as np

     t = np.linspace(0, 20, 500)
     fig = go.Figure(data=go.Scatter(x=t, y=np.cos(t), mode='lines', line=dict(color='#a78bfa', width=2)))
     fig.update_layout(title="Phase Trajectory", template="plotly_dark")
     fig.show()
     ```

3. **Terminal Output & Prints**:
   - Standard output via `print(...)` streams in real time to the output console.
   - Format tabular summaries with `print(df.head())` or `print(df.describe())`.

---

## 3. Performance & Browser Sandbox Rules

1. **Vectorized Operations**: Avoid large pure-Python `for` loops. Utilize vectorized NumPy array operations and Pandas vectorized methods.
2. **Memory Awareness**: Datasets up to several hundred megabytes run smoothly in browser memory; avoid creating redundant full-array copies.
3. **No Direct Socket Networking**: Pure browser sandbox blocks arbitrary TCP sockets; network access is handled via Pyodide's `pyfetch` or RUN01 server proxies (`yf_download`, `yf_fetch`).

---

## 4. Code Generation Format

- Always enclose Python code in markdown fences:
  ````markdown
  ```python
  # Runnable code
  ```
  ````
- Ensure the code is **immediately executable** without placeholders or missing imports.
- Be concise and focused on high-signal code edits.

---

## 5. Autonomous Self-Healing & Surgical Edits

When operating inside RUN01's autonomous self-healing loop or fixing an existing script:
1. **Targeted Surgical Edits**:
   - For bug fixes, optimizations, or line adjustments in existing code, output a precise surgical edit block:
     ```text
     <<<SURGICAL_EDIT>>>
     <<<FIND>>>
     exact lines currently in user's editor
     <<<REPLACE>>>
     corrected, working replacement lines
     <<<END_EDIT>>>
     ```
   - The `<<<FIND>>>` block must match exact characters from the existing code (including indentation).
2. **Context & Variable Preservation (Immutable Context Preservation)**:
   - Never delete or overwrite unrelated user helper functions, imports, comments, or data structures.
   - Fix the root error directly (e.g. correct dictionary keys, check for None, fix shape mismatches, add missing imports).
3. **Deterministic Full Scripts & Zero-Error Execution Guarantee**:
   - If generating an entirely new program or if the architecture requires a full rebuild, provide a single, complete, immediately runnable ` ```python ` block guaranteed to execute cleanly with zero errors.

