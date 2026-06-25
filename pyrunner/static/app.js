/* ============================================================
   Run01 — app.js  (v2 — production-ready)
   Key improvements over v1:
     • Monaco + Pyodide initialise IN PARALLEL via Promise.all
     • Pyodide v0.26.4 (faster WASM JIT, better stdlib)
     • Single micropip.install([...]) call (not a sequential loop)
     • yfinance NOT installed in WASM (uses server proxy instead)
     • Streaming stdout: each print() renders immediately
     • Matplotlib plt.show() → PNG → rendered inline in output
     • Plotly fig.show() → JSON → rendered with Plotly.js inline
     • Language tabs: Python (Pyodide) / C++ / C# / Rust (Piston)
     • Service Worker caches CDN assets for near-instant repeat loads
     • Keyboard: Ctrl/Cmd+Enter=Run, Ctrl+L=Clear, Ctrl+R=Reset
   ============================================================ */

'use strict';

// ── Pyodide CDN ────────────────────────────────────────────
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

// ── Per-language starter code ──────────────────────────────
const STARTER_CODES = {

  python: `\
# ╔═══════════════════════════════════════════════════════════╗
# ║         Run01 — Full Data Science Demo                    ║
# ║  NumPy · Pandas · SciPy · Sklearn · Statsmodels          ║
# ║  Matplotlib · Seaborn · Plotly · Yahoo Finance           ║
# ╚═══════════════════════════════════════════════════════════╝
import sys, time, warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import scipy
import scipy.stats as stats
import sklearn
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
import statsmodels
import statsmodels.api as sm
import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns
import plotly
import plotly.graph_objects as go
from plotly.subplots import make_subplots

t0 = time.time()

# ── 1. Environment ─────────────────────────────────────────
print("┌─ Run01 Environment ──────────────────────────────────")
print(f"│  Python       {sys.version.split()[0]}")
print(f"│  NumPy        {np.__version__}")
print(f"│  Pandas       {pd.__version__}")
print(f"│  SciPy        {scipy.__version__}")
print(f"│  Scikit-Learn {sklearn.__version__}")
print(f"│  Statsmodels  {statsmodels.__version__}")
print(f"│  Matplotlib   {matplotlib.__version__}")
print(f"│  Seaborn      {sns.__version__}")
print(f"│  Plotly       {plotly.__version__}")
print("└──────────────────────────────────────────────────────")
print()

# ── 2. Live Stock Data (via Run01 proxy — bypasses CORS) ───
print("▶  Fetching AAPL — 3 months of data…")
df = await yf_download("AAPL", period="3mo")
print(f"   {len(df)} trading sessions  •  columns: {list(df.columns)}")
print(df.tail(3).to_string())
print()

# ── 3. NumPy + SciPy Statistics ───────────────────────────
print("▶  Statistical Analysis (NumPy + SciPy)…")
returns = df['Close'].pct_change().dropna().values
mu, sigma = returns.mean(), returns.std()
sharpe = (mu / sigma) * np.sqrt(252)
t_stat, p_val = stats.ttest_1samp(returns, 0)
skewness = float(stats.skew(returns))
excess_kurt = float(stats.kurtosis(returns))
print(f"   μ={mu*100:+.4f}%  σ={sigma*100:.4f}%  Sharpe(ann)={sharpe:.3f}")
print(f"   t-test (H₀: μ=0): t={t_stat:.3f}  p={p_val:.4f}  {'✓ reject H₀' if p_val < 0.05 else '○ fail to reject H₀'}")
print(f"   Skewness={skewness:.4f}  Excess Kurtosis={excess_kurt:.4f}")
print()

# ── 4. Scikit-Learn Linear Regression ─────────────────────
print("▶  Trend Regression (Scikit-Learn)…")
X = np.arange(len(df)).reshape(-1, 1)
y = df['Close'].values
scaler = StandardScaler()
Xs = scaler.fit_transform(X)
model = LinearRegression().fit(Xs, y)
r2 = model.score(Xs, y)
pred_y = model.predict(Xs)
trend_dir = "↑ uptrend" if model.coef_[0] > 0 else "↓ downtrend"
print(f"   R²={r2:.4f}  coef={model.coef_[0]:+.4f} (scaled)  {trend_dir}")
print()

# ── 5. Statsmodels OLS ────────────────────────────────────
print("▶  OLS Regression Summary (Statsmodels)…")
X_sm = sm.add_constant(np.arange(len(df), dtype=float))
ols  = sm.OLS(df['Close'].values, X_sm).fit()
print(ols.summary().tables[1].as_text())
print()

# ── 6. Matplotlib 4-panel chart ───────────────────────────
print("▶  Rendering 4-panel chart (Matplotlib + Seaborn)…")
sns.set_theme(style='dark', palette='muted')

fig, axes = plt.subplots(2, 2, figsize=(11, 7), facecolor='#0a0a0a')
fig.suptitle('AAPL — 3-Month Analysis', color='#e5e5e5',
             fontsize=14, fontweight='bold', y=0.99)

# Panel 1 — Price + trend (Standard Colors: Blue close, Orange trend)
ax = axes[0, 0]
ax.set_facecolor('#111')
ax.plot(df['Close'].values, color='#1f77b4', lw=1.5, label='Close')
ax.plot(pred_y, '--', color='#ff7f0e', lw=1.5, label='Trend')
ax.set_title('Price + Linear Trend', color='#aaa', fontsize=10)
ax.tick_params(colors='#555')
ax.legend(fontsize=8, facecolor='#111', labelcolor='white')
[s.set_color('#1e1e1e') for s in ax.spines.values()]

# Panel 2 — Returns distribution (Standard Colors: Cyan bars, Red 0% reference)
ax2 = axes[0, 1]
ax2.set_facecolor('#111')
sns.histplot(returns * 100, bins=22, ax=ax2, color='#17becf', edgecolor='#1e1e1e')
ax2.axvline(x=0, color='#d62728', lw=1, linestyle='--', alpha=0.9)
ax2.set_title('Daily Returns Distribution (%)', color='#aaa', fontsize=10)
ax2.tick_params(colors='#555')
[s.set_color('#1e1e1e') for s in ax2.spines.values()]

# Panel 3 — Rolling volatility (Standard Colors: Purple band and line)
ax3 = axes[1, 0]
ax3.set_facecolor('#111')
vol = pd.Series(returns).rolling(10).std() * np.sqrt(252) * 100
ax3.fill_between(range(len(vol)), vol, alpha=0.25, color='#9467bd')
ax3.plot(vol.values, color='#9467bd', lw=1.2)
ax3.set_title('Rolling 10-Day Annualised Vol (%)', color='#aaa', fontsize=10)
ax3.tick_params(colors='#555')
[s.set_color('#1e1e1e') for s in ax3.spines.values()]

# Panel 4 — Volume (Standard Colors: Green up days, Red down days)
ax4 = axes[1, 1]
ax4.set_facecolor('#111')
bar_colors = ['#2ca02c' if c >= o else '#d62728'
              for c, o in zip(df['Close'], df['Open'])]
ax4.bar(range(len(df)), df['Volume'] / 1e6, color=bar_colors, width=0.85)
ax4.set_title('Volume (M shares)', color='#aaa', fontsize=10)
ax4.tick_params(colors='#555')
[s.set_color('#1e1e1e') for s in ax4.spines.values()]

plt.tight_layout(pad=1.5)
plt.show()   # ← captured automatically, rendered as image above ↑
print()

# ── 7. Plotly Interactive Candlestick + Volume (Standard Colors: Green/Red) ──
print("▶  Rendering interactive candlestick chart (Plotly)…")
fig2 = make_subplots(
    rows=2, cols=1, shared_xaxes=True,
    row_heights=[0.72, 0.28], vertical_spacing=0.03,
)
dates = df.index.astype(str).tolist()

fig2.add_trace(go.Candlestick(
    x=dates,
    open=df['Open'], high=df['High'],
    low=df['Low'],   close=df['Close'],
    name='AAPL',
    increasing=dict(line=dict(color='#2ca02c', width=1.5), fillcolor='#2ca02c'),
    decreasing=dict(line=dict(color='#d62728', width=1.5), fillcolor='#d62728'),
), row=1, col=1)

fig2.add_trace(go.Bar(
    x=dates,
    y=df['Volume'] / 1e6,
    name='Vol (M)',
    marker_color=['#2ca02c' if c >= o else '#d62728'
                  for c, o in zip(df['Close'], df['Open'])],
), row=2, col=1)

fig2.update_layout(
    title=dict(text='AAPL — Interactive Candlestick', font=dict(size=13, color='#aaa')),
    paper_bgcolor='#0a0a0a',
    plot_bgcolor='#111111',
    font=dict(color='#777', size=11, family='JetBrains Mono, monospace'),
    xaxis=dict(gridcolor='#1a1a1a', rangeslider=dict(visible=False), showgrid=True),
    xaxis2=dict(gridcolor='#1a1a1a', showgrid=True),
    yaxis=dict(gridcolor='#1a1a1a', showgrid=True),
    yaxis2=dict(gridcolor='#1a1a1a', showgrid=True, title='Vol (M)'),
    legend=dict(bgcolor='rgba(0,0,0,0)', font=dict(color='#777')),
    margin=dict(l=4, r=4, t=36, b=4),
    height=440,
)
fig2.show()   # ← interactive chart rendered inline below ↓
print()

elapsed = time.time() - t0
print(f"✓ Completed in {elapsed:.2f}s")
`,
};

// ── Language metadata ──────────────────────────────────────
const LANG_META = {
  python: { label: 'Python', file: 'main.py',  pill: 'PY',   pillClass: 'pill-py',  monaco: 'python' }
};

// ── Python helpers injected into Pyodide ───────────────────
const PYODIDE_SETUP = `
import io, base64, warnings
warnings.filterwarnings('ignore')
import pyodide.http
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as _mpl_plt
import plotly.io as _pio

# ── yf_download: fetch OHLCV via Run01 server proxy ────────
async def yf_download(ticker, period="1mo", interval="1d"):
    """Fetch stock OHLCV data via Run01 proxy (bypasses browser CORS).
    Args:
        ticker  : e.g. 'AAPL', 'TSLA', 'MSFT', 'GOOG'
        period  : '1d','5d','1mo','3mo','6mo','1y','2y','5y','max'
        interval: '1m','5m','15m','30m','1h','1d','1wk','1mo'
    Returns:
        pd.DataFrame  DatetimeIndex, columns: Open High Low Close Volume
    """
    url  = f"/api/yf/{ticker}?period={period}&interval={interval}"
    resp = await pyodide.http.pyfetch(url)
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    df = pd.DataFrame(data)
    df["Date"] = pd.to_datetime(df["Date"])
    return df.set_index("Date")

# ── plt.show(): capture as inline PNG ──────────────────────
def _mpl_capture(*args, **kwargs):
    buf = io.BytesIO()
    _mpl_plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                     facecolor='#0a0a0a', edgecolor='none')
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    buf.close()
    _mpl_plt.close('all')
    print(f'__RUN01_IMG__:{b64}', flush=True)

import matplotlib.pyplot as plt
plt.show = _mpl_capture

# ── fig.show(): capture as interactive Plotly chart ────────
def _plotly_capture(fig, *args, **kwargs):
    fig_json = _pio.to_json(fig)
    encoded  = base64.b64encode(fig_json.encode('utf-8')).decode('ascii')
    print(f'__RUN01_PLOTLY__:{encoded}', flush=True)

_pio.show = _plotly_capture
try:
    import plotly.graph_objects as _go
    _go.Figure.show = lambda self, *a, **kw: _plotly_capture(self, *a, **kw)
except Exception:
    pass
`;

// ── State ─────────────────────────────────────────────────
let monacoEditor   = null;
let pyodide        = null;
let currentLang    = 'python';
let isRunning      = false;
let runCount       = 0;
let currentBlock   = null;  // { blockEl, linesEl, startTime, badgeEl, timeEl }

// ── DOM refs ──────────────────────────────────────────────
const statusDot      = document.getElementById('statusDot');
const statusLabel    = document.getElementById('statusLabel');
const btnRun         = document.getElementById('btnRun');
const btnClear       = document.getElementById('btnClear');
const btnReset       = document.getElementById('btnReset');
const outputEl       = document.getElementById('output');
const editorMeta     = document.getElementById('editorMeta');
const outputMeta     = document.getElementById('outputMeta');
const initOverlay    = document.getElementById('initOverlay');
const initProgressEl = document.getElementById('initProgressBar');
const initLabelEl    = document.getElementById('initProgressLabel');
const langTabsEl     = document.getElementById('langTabs');
const langPillEl     = document.getElementById('langPill');
const fileNameEl     = document.getElementById('fileName');

// ── Helpers: status + progress ────────────────────────────
function setStatus(state, label) {
  statusDot.className   = `status-dot ${state}`;
  statusLabel.textContent = label;
}

function setProgress(pct, label) {
  initProgressEl.style.width      = `${Math.min(100, pct)}%`;
  initLabelEl.textContent         = label;
}

function markPillLoaded(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('loaded');
}

function hideOverlay() {
  initOverlay.classList.add('hiding');
  // Remove from DOM after transition so it doesn't intercept events
  setTimeout(() => initOverlay.style.display = 'none', 750);
}

// ── Monaco initialisation ─────────────────────────────────
// Started immediately (parallel with Pyodide init below)
const monacoReady = new Promise((resolve) => {
  require(['vs/editor/editor.main'], function () {

    monaco.editor.defineTheme('run01', {
      base: 'vs-dark',
      inherit: true,
      rules: [], // Empty rules to inherit standard VS Code dark syntax coloring
      colors: {
        'editor.background':              '#00000000',
        'editor.foreground':              '#D4D4D4',
        'editor.lineHighlightBackground': '#ffffff08',
        'editor.selectionBackground':     '#ffffff18',
        'editor.inactiveSelectionBackground': '#ffffff0c',
        'editorLineNumber.foreground':    '#858585',
        'editorLineNumber.activeForeground': '#C6C6C6',
        'editorCursor.foreground':        '#AEAFAD',
        'editorIndentGuide.background1': '#1e1e1e',
        'editorIndentGuide.activeBackground1': '#333333',
        'editorWidget.background':        '#1e1e1e',
        'editorWidget.border':            '#454545',
        'input.background':               '#3c3c3c',
        'input.foreground':               '#cccccc',
        'scrollbarSlider.background':     '#79797933',
        'scrollbarSlider.hoverBackground':'#79797955',
      },
    });

    monacoEditor = monaco.editor.create(document.getElementById('editor'), {
      value:            STARTER_CODES.python,
      language:         'python',
      theme:            'run01',
      fontSize:         13.5,
      fontFamily:       "'JetBrains Mono', 'Fira Code', monospace",
      fontLigatures:    true,
      lineHeight:       22,
      minimap:          { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap:         'on',
      automaticLayout:  true,
      padding:          { top: 18, bottom: 18 },
      renderLineHighlight: 'gutter',
      cursorBlinking:   'phase',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling:  true,
      tabSize:          4,
      insertSpaces:     true,
      folding:          true,
      suggest:          { preview: true },
      quickSuggestions: true,
      bracketPairColorization: { enabled: false },
    });

    // Show cursor position
    monacoEditor.onDidChangeCursorPosition((e) => {
      const p = e.position;
      editorMeta.textContent = `ln ${p.lineNumber}, col ${p.column}`;
    });

    // Cmd/Ctrl+Enter → Run
    monacoEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => { if (!isRunning && pyodide) triggerRun(); }
    );

    resolve();
  });
});

// ── Pyodide initialisation ────────────────────────────────
// Started immediately (parallel with Monaco above)
async function initPyodide() {
  setStatus('loading', 'Loading Python runtime…');
  setProgress(5, 'Loading Pyodide v0.26.4…');

  // Load core runtime
  pyodide = await loadPyodide({
    indexURL: PYODIDE_CDN,
    // Progress callback shows package names as they load
    packageCacheDir: undefined,
  });

  setProgress(18, 'Loading NumPy + Pandas…');
  await pyodide.loadPackage(['numpy', 'pandas']);
  markPillLoaded('ip-numpy');
  markPillLoaded('ip-pandas');

  setProgress(34, 'Loading SciPy…');
  await pyodide.loadPackage(['scipy']);
  markPillLoaded('ip-scipy');

  setProgress(48, 'Loading Scikit-Learn…');
  await pyodide.loadPackage(['scikit-learn']);
  markPillLoaded('ip-sklearn');

  setProgress(60, 'Loading Matplotlib + Statsmodels…');
  await pyodide.loadPackage(['matplotlib', 'statsmodels']);
  markPillLoaded('ip-mpl');
  markPillLoaded('ip-sm');

  setProgress(72, 'Installing Seaborn + Plotly via micropip…');
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');

  // Single install call — resolves dependencies once (faster than looping)
  // Note: yfinance is NOT installed in WASM. yf_download() calls
  // our Flask /api/yf/<ticker> proxy, which fetches server-side.
  await micropip.install(['seaborn', 'plotly'], { keep_going: true });
  markPillLoaded('ip-sns');
  markPillLoaded('ip-plotly');

  setProgress(90, 'Setting up environment helpers…');
  await pyodide.runPythonAsync(PYODIDE_SETUP);

  setProgress(100, 'Ready!');
}

const pyodideReady = initPyodide().catch((err) => {
  console.error('Pyodide init failed:', err);
  setStatus('error', 'Python init failed — check console');
  appendToOutput(`⚠ Failed to initialise Python:\n${err.message ?? err}`, 'err');
});

// ── Plotly.js initialisation check ────────────────────────
const plotlyReady = new Promise((resolve) => {
  if (typeof Plotly !== 'undefined') {
    resolve();
  } else {
    const script = document.querySelector('script[src*="plotly.min.js"]');
    if (script) {
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => resolve());
    } else {
      resolve();
    }
  }
});

// ── Wait for Monaco + Pyodide + Plotly.js, then unlock UI ──
Promise.all([monacoReady, pyodideReady, plotlyReady]).then(() => {
  setStatus('ready', 'Ready — all packages loaded');
  btnRun.disabled = false;
  hideOverlay();
  clearOutput();
  appendWelcome();
}).catch((err) => {
  console.error('Startup error:', err);
});

// ── Language tabs (Simplified, Python only) ───────────────
langTabsEl.addEventListener('click', (e) => {
  // Python is only language now, clicking it returns early.
});

// ── Trigger run ───────────────────────────────────────────
function triggerRun() {
  if (isRunning) return;
  if (!pyodide) return;
  runPython();
}

// ── Run: Python (Pyodide, client-side) ───────────────────
async function runPython() {
  if (!pyodide || isRunning) return;

  const code = monacoEditor.getValue();
  if (!code.trim()) return;

  isRunning = true;
  runCount++;
  btnRun.disabled = true;
  setStatus('running', 'Running…');
  outputMeta.textContent = 'running…';

  const block = startOutputBlock();

  // Streaming stdout: each print() renders immediately
  pyodide.setStdout({
    batched: (line) => processOutput(line, false, block),
  });
  pyodide.setStderr({
    batched: (line) => processOutput(line, true, block),
  });

  let success = false;
  try {
    await pyodide.runPythonAsync(code);
    success = true;
  } catch (err) {
    const msg = err?.message ?? String(err);
    processOutput(msg, true, block);
  }

  finishOutputBlock(block, success);
  isRunning = false;
  btnRun.disabled = false;
  setStatus(success ? 'ready' : 'error', success ? `Done in ${block.elapsed()}s` : 'Error');
}

// ── Output block management ───────────────────────────────
function startOutputBlock() {
  const startTime = performance.now();

  const blockEl = document.createElement('div');
  blockEl.className = 'out-block';

  // Header row
  const headerEl = document.createElement('div');
  headerEl.className = 'out-run-header';

  const numEl = document.createElement('span');
  numEl.className = 'out-run-num';
  numEl.textContent = `Run #${runCount}`;

  const langBadgeEl = document.createElement('span');
  langBadgeEl.className = 'out-lang-badge';
  langBadgeEl.textContent = LANG_META[currentLang].pill;

  const badgeEl = document.createElement('span');

  const timeEl = document.createElement('span');
  timeEl.className = 'out-run-time';

  headerEl.appendChild(numEl);
  headerEl.appendChild(langBadgeEl);
  headerEl.appendChild(badgeEl);
  headerEl.appendChild(timeEl);
  blockEl.appendChild(headerEl);

  const linesEl = document.createElement('div');
  blockEl.appendChild(linesEl);
  outputEl.appendChild(blockEl);

  outputEl.scrollTop = outputEl.scrollHeight;

  return {
    blockEl,
    linesEl,
    badgeEl,
    timeEl,
    startTime,
    elapsed: () => ((performance.now() - startTime) / 1000).toFixed(3),
  };
}

function finishOutputBlock(block, success) {
  const t = block.elapsed();

  if (block.linesEl.children.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'out-line out-empty';
    empty.textContent = '(no output)';
    block.linesEl.appendChild(empty);
  }

  block.badgeEl.className   = success ? 'out-success-badge' : 'out-error-badge';
  block.badgeEl.textContent = success ? '✓ success' : '✗ error';
  block.timeEl.textContent  = `${t}s`;

  outputMeta.textContent = `run #${runCount} · ${t}s`;
  outputEl.scrollTop = outputEl.scrollHeight;
}

// ── Output line processor ─────────────────────────────────
function processOutput(text, isErr, block) {
  if (!text) return;

  // Split on newlines so multi-line strings are handled correctly
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line && lines.length > 1) continue; // skip blank inter-lines

    if (line.startsWith('__RUN01_IMG__:')) {
      renderImage(line.slice('__RUN01_IMG__:'.length), block);
    } else if (line.startsWith('__RUN01_PLOTLY__:')) {
      renderPlotly(line.slice('__RUN01_PLOTLY__:'.length), block);
    } else {
      appendLine(line, isErr ? 'err' : '', block);
    }
  }
}

function appendLine(text, cls, block) {
  const span = document.createElement('span');
  span.className = `out-line${cls ? ' ' + cls : ''}`;
  span.textContent = text;
  block.linesEl.appendChild(span);
  outputEl.scrollTop = outputEl.scrollHeight;
}

// ── Matplotlib inline image ───────────────────────────────
function renderImage(b64, block) {
  const wrap = document.createElement('div');
  wrap.className = 'out-plot-wrap';

  const img = document.createElement('img');
  img.className = 'out-plot-img';
  img.alt = 'matplotlib chart';
  img.src = `data:image/png;base64,${b64}`;

  // Dim initially, fade in when loaded
  img.style.opacity = '0';
  img.style.transition = 'opacity 0.4s ease';
  img.onload = () => { img.style.opacity = '1'; };

  wrap.appendChild(img);
  block.linesEl.appendChild(wrap);
  outputEl.scrollTop = outputEl.scrollHeight;
}

// ── Plotly inline interactive chart ──────────────────────
function renderPlotly(encoded, block) {
  const wrap = document.createElement('div');
  wrap.className = 'out-plotly-wrap';
  block.linesEl.appendChild(wrap);

  // Decode base64 → UTF-8 string → JSON
  try {
    const bytes   = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const jsonStr = new TextDecoder('utf-8').decode(bytes);
    const fig     = JSON.parse(jsonStr);

    if (typeof Plotly !== 'undefined') {
      Plotly.react(wrap, fig.data, {
        ...fig.layout,
        paper_bgcolor: 'transparent',
        plot_bgcolor:  '#111111',
        font: { ...(fig.layout?.font ?? {}), color: '#777', family: 'JetBrains Mono, monospace' },
        margin: fig.layout?.margin ?? { l: 4, r: 4, t: 36, b: 4 },
      }, {
        responsive:     true,
        displaylogo:    false,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'sendDataToCloud'],
      });
    } else {
      // Plotly.js still loading (edge case on very fast machines)
      wrap.innerHTML = '<span class="out-line sys">[ Plotly.js loading — run again in a moment ]</span>';
    }
  } catch (err) {
    console.error('Plotly render error:', err);
    const msg = document.createElement('span');
    msg.className = 'out-line err';
    msg.textContent = `⚠ Chart render failed: ${err.message}`;
    wrap.appendChild(msg);
  }

  outputEl.scrollTop = outputEl.scrollHeight;
}

// ── Output helpers ────────────────────────────────────────
function clearOutput() {
  outputEl.innerHTML = '';
  runCount = 0;
  outputMeta.textContent = 'ready';
}

function appendWelcome() {
  outputEl.innerHTML = `
    <div class="output-welcome">
      <div class="welcome-prompt">
        <span class="prompt-caret">❯</span>
        Run01 ready — press <strong style="color:var(--white)">▶ Run</strong>
        or <kbd style="font-family:var(--font-mono);font-size:11px;
                       background:var(--glass-bg-hover);padding:1px 5px;
                       border-radius:4px;border:1px solid var(--glass-border)">⌘↵</kbd>
        to execute.
      </div>
    </div>
  `;
}

function appendToOutput(text, cls) {
  const span = document.createElement('span');
  span.className = `out-line${cls ? ' ' + cls : ''}`;
  span.textContent = text;
  outputEl.appendChild(span);
}

// ── Button handlers ───────────────────────────────────────
btnRun.addEventListener('click', () => {
  if (!isRunning) triggerRun();
});

btnClear.addEventListener('click', () => {
  clearOutput();
  if (pyodide) appendWelcome();
  setStatus('ready', 'Ready');
});

btnReset.addEventListener('click', () => {
  if (monacoEditor) monacoEditor.setValue(STARTER_CODES[currentLang]);
  clearOutput();
  appendWelcome();
  setStatus('ready', 'Ready');
});

// ── Global keyboard shortcuts ─────────────────────────────
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;

  if (e.key === 'l' || e.key === 'L') {         // Ctrl+L — clear
    e.preventDefault();
    btnClear.click();
  } else if (e.key === 'r' || e.key === 'R') {  // Ctrl+R — reset
    e.preventDefault();
    btnReset.click();
  }
});

// ── Resize handle (drag to resize panes) ─────────────────
(function initResize() {
  const handle     = document.getElementById('resizeHandle');
  const workspace  = document.querySelector('.workspace');
  const editorPane = document.querySelector('.pane-editor');
  const outputPane = document.querySelector('.pane-output');

  let dragging = false, startX = 0, startW = 0, totalW = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX   = e.clientX;
    startW   = editorPane.getBoundingClientRect().width;
    totalW   = workspace.getBoundingClientRect().width - handle.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta  = e.clientX - startX;
    const newW   = Math.min(Math.max(startW + delta, 220), totalW - 220);
    const pct    = (newW / totalW * 100).toFixed(2);
    editorPane.style.flex = `0 0 ${pct}%`;
    outputPane.style.flex = '1 1 0';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });

  // Keyboard resize (arrow keys when handle is focused)
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 50 : 20;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -step : step;
      const curW = editorPane.getBoundingClientRect().width;
      const tot  = workspace.getBoundingClientRect().width - handle.offsetWidth;
      const newW = Math.min(Math.max(curW + dir, 220), tot - 220);
      editorPane.style.flex = `0 0 ${(newW / tot * 100).toFixed(2)}%`;
      outputPane.style.flex = '1 1 0';
    }
  });
})();
