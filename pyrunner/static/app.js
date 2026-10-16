/* ============================================================
   Run01 - app.js  (v2 - production-ready)
   Key improvements over v1:
      Monaco + Pyodide initialise IN PARALLEL via Promise.all
      Pyodide v0.26.4 (faster WASM JIT, better stdlib)
      Single micropip.install([...]) call (not a sequential loop)
      yfinance NOT installed in WASM (uses server proxy instead)
      Streaming stdout: each print() renders immediately
      Matplotlib plt.show()  PNG  rendered inline in output
      Plotly fig.show()  JSON  rendered with Plotly.js inline
      Language tabs: Python (Pyodide) / C++ / C# / Rust (Piston)
      Service Worker caches CDN assets for near-instant repeat loads
      Keyboard: Ctrl/Cmd+Enter=Run, Ctrl+L=Clear, Ctrl+R=Reset
   ============================================================ */

'use strict';

//  Pyodide CDN 
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

//  Per-language starter code 
const STARTER_CODES = {
  python: '',
  desmos: ''
};

//  Language metadata 
const LANG_META = {
  python: { label: 'Python', file: 'main.py',  pill: 'PY',   pillClass: 'pill-py',  monaco: 'python' }
};

//  Python helpers injected into Pyodide 
// IMPORTANT: use triple-quoted strings for all multi-line docstrings
// so Python 3.12 doesn't throw "unterminated string literal".
const PYODIDE_SETUP = `
import io, base64, warnings
warnings.filterwarnings('ignore')
import pyodide.http
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as _mpl_plt
try:
    import plotly.io as _pio
except Exception:
    _pio = None

#  Desmos Math Graphing Module 
class _DesmosModule:
    def plot(self, *expressions, title="Desmos Math Graph"):
        import json, js
        expr_list = []
        for idx, exp in enumerate(expressions):
            if isinstance(exp, str):
                expr_list.append({"id": f"expr_{idx+1}", "latex": exp})
            elif isinstance(exp, dict):
                expr_list.append(exp)
        js.window._renderDesmosGraphInOutput(json.dumps(expr_list), title)

desmos = _DesmosModule()
def show_desmos(*expressions, title="Desmos Math Graph"):
    desmos.plot(*expressions, title=title)


#  RUN01 Data Files (/data/) 
def list_data_files():
    """List all dataset files currently stored in the RUN01 /data/ directory."""
    import os
    if os.path.exists('/data'):
        return sorted([f for f in os.listdir('/data') if not f.startswith('.')])
    return []


#  yf_download: fetch OHLCV via Run01 server proxy 
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

#  yf_info: fetch company profile metadata 
#  yf_fetch: universally fetch any category from server proxy 
async def yf_fetch(ticker, category):
    resp = await pyodide.http.pyfetch(f"/api/yf/{ticker}/{category}")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        df = pd.DataFrame(data)
        if "Date" in df.columns:
            df["Date"] = pd.to_datetime(df["Date"])
            df = df.set_index("Date")
        return df
    return data

#  yf_info: fetch company profile metadata 
async def yf_info(ticker):
    resp = await pyodide.http.pyfetch(f"/api/yf/{ticker}/info")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    return data

#  yf_actions: fetch corporate actions timeline 
async def yf_actions(ticker):
    resp = await pyodide.http.pyfetch(f"/api/yf/{ticker}/actions")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    df = pd.DataFrame(data)
    if not df.empty and "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"])
        df = df.set_index("Date")
    return df

#  yf_dividends: fetch dividend payments 
async def yf_dividends(ticker):
    resp = await pyodide.http.pyfetch(f"/api/yf/{ticker}/dividends")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    df = pd.DataFrame(data)
    if not df.empty and "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"])
        df = df.set_index("Date")
    return df

#  yf_splits: fetch stock splits 
async def yf_splits(ticker):
    resp = await pyodide.http.pyfetch(f"/api/yf/{ticker}/splits")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    df = pd.DataFrame(data)
    if not df.empty and "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"])
        df = df.set_index("Date")
    return df

#  yf_financials: fetch income statement 
async def yf_financials(ticker, category="financials"):
    return await yf_fetch(ticker, category)

#  yf_balance_sheet: fetch balance sheet 
async def yf_balance_sheet(ticker, category="balance_sheet"):
    return await yf_fetch(ticker, category)

#  yf_cashflow: fetch cash flow statement 
async def yf_cashflow(ticker, category="cashflow"):
    return await yf_fetch(ticker, category)

#  yf_recommendations: fetch analyst consensus 
async def yf_recommendations(ticker, category="recommendations"):
    return await yf_fetch(ticker, category)

#  yf_holders: fetch holders 
async def yf_holders(ticker, category="institutional_holders"):
    return await yf_fetch(ticker, category)

#  yf_sector: fetch sector metrics 
async def yf_sector(key="technology", category="overview"):
    resp = await pyodide.http.pyfetch(f"/api/yf/sector/{key}/{category}")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return pd.DataFrame(data)
    return data

#  yf_industry: fetch industry metrics 
async def yf_industry(key="software-infrastructure", category="overview"):
    resp = await pyodide.http.pyfetch(f"/api/yf/industry/{key}/{category}")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return pd.DataFrame(data)
    return data

#  yf_market: fetch market status/summary 
async def yf_market(category="status", market_id="US"):
    resp = await pyodide.http.pyfetch(f"/api/yf/market/{market_id}/{category}")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return pd.DataFrame(data)
    return data

#  yf_tickers: fetch bulk tickers data 
async def yf_tickers(symbols="AAPL MSFT GOOG"):
    resp = await pyodide.http.pyfetch(f"/api/yf/tickers?symbols={symbols}")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    return data

#  yf_search: search quotes and news 
async def yf_search(query="apple"):
    resp = await pyodide.http.pyfetch(f"/api/yf/search?q={query}")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    return data

#  yf_lookup: symbol lookup 
async def yf_lookup(query="apple"):
    resp = await pyodide.http.pyfetch(f"/api/yf/lookup?q={query}")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return pd.DataFrame(data)
    return data

#  yf_options: fetch option chain expiry list 
async def yf_options(ticker):
    resp = await pyodide.http.pyfetch(f"/api/yf/{ticker}/options")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    return data

#  yf_option_chain: fetch option chain details 
async def yf_option_chain(ticker, expiry):
    resp = await pyodide.http.pyfetch(f"/api/yf/{ticker}/options/{expiry}")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    calls_df = pd.DataFrame(data["calls"])
    puts_df = pd.DataFrame(data["puts"])
    return {"calls": calls_df, "puts": puts_df}

#  yf_news: fetch news items 
async def yf_news(ticker):
    resp = await pyodide.http.pyfetch(f"/api/yf/{ticker}/news")
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    return data

#  plt.show(): capture as inline PNG 
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

#  fig.show(): capture as interactive Plotly chart 
def _setup_plotly_hooks():
    try:
        import plotly.io as _pio
        def _plotly_capture(fig, *args, **kwargs):
            fig_json = _pio.to_json(fig)
            encoded  = base64.b64encode(fig_json.encode('utf-8')).decode('ascii')
            print(f'__RUN01_PLOTLY__:{encoded}', flush=True)
        _pio.show = _plotly_capture
        import plotly.graph_objects as _go
        _go.Figure.show = lambda self, *a, **kw: _plotly_capture(self, *a, **kw)
    except Exception:
        pass

_setup_plotly_hooks()

#  fred_download: fetch FRED economic data via Run01 proxy 
async def fred_download(series_id, limit=100, sort_order="desc", observation_start="", observation_end=""):
    """Fetch FRED economic data via Run01 proxy.

    Args:
        series_id       : e.g. 'GDP','CPIAUCSL','FEDFUNDS','UNRATE'
        limit           : number of observations (default 100)
        sort_order      : 'desc' (newest first) or 'asc'
        observation_start: 'YYYY-MM-DD' start date (optional)
        observation_end  : 'YYYY-MM-DD' end date   (optional)

    Returns:
        dict with keys: series_id, title, units, frequency, observations (DataFrame)
    """
    params = f"limit={limit}&sort_order={sort_order}"
    if observation_start: params += f"&observation_start={observation_start}"
    if observation_end:   params += f"&observation_end={observation_end}"
    url  = f"/api/fred/{series_id}?{params}"
    resp = await pyodide.http.pyfetch(url)
    data = await resp.json()
    if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])
    df = pd.DataFrame(data["observations"])
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    return {
        "series_id": data["series_id"],
        "title":     data["title"],
        "units":     data["units"],
        "frequency": data["frequency"],
        "df":        df,
    }

# 
#  RUN01 PREBUILT COMPUTER VISION SUITE (OpenCV, YOLO, Pillow, Skimage) 
# 
import sys, types, io, base64
import numpy as _np
from PIL import Image as _PIL_Image, ImageDraw as _PIL_ImageDraw, ImageFilter as _PIL_ImageFilter

#  Patch PIL Image.show() to display inline in RUN01 output 
def _pil_show_capture(self, title=None, **kwargs):
    buf = io.BytesIO()
    self.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    buf.close()
    print(f'__RUN01_IMG__:{b64}', flush=True)

_PIL_Image.Image.show = _pil_show_capture

#  Server-side CV proxy runner 
async def cv_run(code=None, *, timeout=30):
    """Execute Python CV code via RUN01 server-side CV proxy."""
    import js, pyodide.http
    if not code:
        raise ValueError("cv_run(code) requires a code string argument.")
    resp = await pyodide.http.pyfetch(
        "/api/cv/run",
        method="POST",
        body=js.JSON.stringify(js.Object.fromEntries(
            js.Object.entries(js.JSON.parse(__import__('json').dumps({
                "code": code,
                "timeout": timeout,
            })))
        )),
        headers={"Content-Type": "application/json"},
    )
    res = await resp.json()
    if res.get("stdout"):
        print(res["stdout"])
    for b64 in (res.get("images") or []):
        print(f"__RUN01_IMG__:{b64}", flush=True)
    if res.get("stderr"):
        print(res["stderr"], file=sys.stderr)
    if res.get("error"):
        raise RuntimeError(f"CV execution error: {res['error']}")
    return res

#  Prebuilt cv2 (OpenCV) Module 
class _CV2Module(types.ModuleType):
    """In-browser OpenCV (cv2) engine powered by NumPy, Pillow, and SciPy."""
    COLOR_BGR2GRAY = 6; COLOR_RGB2GRAY = 7; COLOR_GRAY2BGR = 8; COLOR_GRAY2RGB = 8
    COLOR_BGR2RGB = 4; COLOR_RGB2BGR = 4; COLOR_BGR2HSV = 40; COLOR_HSV2BGR = 54
    COLOR_BGR2RGBA = 0; COLOR_RGB2RGBA = 2; COLOR_BGR2LAB = 44; COLOR_LAB2BGR = 55
    IMREAD_COLOR = 1; IMREAD_GRAYSCALE = 0; IMREAD_UNCHANGED = -1
    INTER_NEAREST = 0; INTER_LINEAR = 1; INTER_CUBIC = 2; INTER_AREA = 3; INTER_LANCZOS4 = 4
    THRESH_BINARY = 0; THRESH_BINARY_INV = 1; THRESH_TRUNC = 2; THRESH_TOZERO = 3; THRESH_OTSU = 8
    FONT_HERSHEY_SIMPLEX = 0; FONT_HERSHEY_PLAIN = 1; FONT_HERSHEY_DUPLEX = 2
    FONT_HERSHEY_COMPLEX = 3; FONT_HERSHEY_TRIPLEX = 4; FONT_HERSHEY_COMPLEX_SMALL = 5
    LINE_AA = 16; LINE_8 = 8; LINE_4 = 4; FILLED = -1
    MORPH_RECT = 0; MORPH_CROSS = 1; MORPH_ELLIPSE = 2; MORPH_ERODE = 0; MORPH_DILATE = 1
    MORPH_OPEN = 2; MORPH_CLOSE = 3; MORPH_GRADIENT = 4; MORPH_TOPHAT = 5; MORPH_BLACKHAT = 6
    RETR_EXTERNAL = 0; RETR_LIST = 1; RETR_CCOMP = 2; RETR_TREE = 3
    CHAIN_APPROX_NONE = 1; CHAIN_APPROX_SIMPLE = 2

    def __init__(self):
        super().__init__('cv2')

    def imread(self, source='sample', flags=1):
        """Read image from path or generate high-contrast test image."""
        if not source or source in ('sample', 'test', 'shapes'):
            arr = _np.zeros((400, 600, 3), dtype=_np.uint8)
            for y in range(400):
                arr[y, :] = [int(40 + y*0.1), int(20 + y*0.1), int(10 + y*0.05)]
            self.rectangle(arr, (50, 60), (260, 220), (0, 210, 130), -1)
            self.circle(arr, (430, 140), 75, (255, 130, 0), 4)
            self.line(arr, (40, 280), (560, 280), (140, 90, 240), 3)
            self.putText(arr, "RUN01 OPENCV", (50, 340), self.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            return arr
        import os
        if isinstance(source, str) and os.path.exists(source):
            pil_img = _PIL_Image.open(source).convert('RGB')
            rgb = _np.array(pil_img)
            return rgb[:, :, ::-1]
        return None

    def imwrite(self, filename, mat):
        arr = mat.copy()
        if arr.ndim == 3 and arr.shape[2] == 3:
            arr = arr[:, :, ::-1]
        pil_img = _PIL_Image.fromarray(arr.astype(_np.uint8))
        pil_img.save(filename)
        return True

    def imshow(self, winname, mat):
        if not isinstance(mat, _np.ndarray):
            raise TypeError("cv2.imshow expects a numpy ndarray")
        arr = mat.copy()
        if arr.dtype != _np.uint8:
            if arr.max() <= 1.0:
                arr = (arr * 255).clip(0, 255).astype(_np.uint8)
            else:
                arr = arr.clip(0, 255).astype(_np.uint8)
        if arr.ndim == 2:
            pil_img = _PIL_Image.fromarray(arr, mode='L')
        elif arr.ndim == 3 and arr.shape[2] == 3:
            pil_img = _PIL_Image.fromarray(arr[:, :, ::-1], mode='RGB')
        elif arr.ndim == 3 and arr.shape[2] == 4:
            pil_img = _PIL_Image.fromarray(arr[:, :, [2, 1, 0, 3]], mode='RGBA')
        else:
            raise ValueError(f"Unsupported image shape for cv2.imshow: {arr.shape}")
        buf = io.BytesIO()
        pil_img.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        buf.close()
        print(f"[{winname}] Image ({mat.shape[1]}x{mat.shape[0]}, {mat.dtype})")
        print(f'__RUN01_IMG__:{b64}', flush=True)

    def waitKey(self, delay=0): return 0
    def destroyAllWindows(self): pass
    def destroyWindow(self, name): pass

    def cvtColor(self, src, code):
        arr = src.astype(_np.float32)
        if code in (self.COLOR_BGR2GRAY,):
            gray = 0.114 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.299 * arr[:, :, 2]
            return gray.clip(0, 255).astype(_np.uint8)
        elif code in (self.COLOR_RGB2GRAY,):
            gray = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
            return gray.clip(0, 255).astype(_np.uint8)
        elif code in (self.COLOR_GRAY2BGR, self.COLOR_GRAY2RGB):
            if src.ndim == 2:
                return _np.stack([src, src, src], axis=-1).astype(_np.uint8)
            return src
        elif code in (self.COLOR_BGR2RGB, self.COLOR_RGB2BGR):
            return src[:, :, ::-1].copy()
        return src

    def resize(self, src, dsize, fx=0, fy=0, interpolation=1):
        pil_img = _PIL_Image.fromarray(src)
        w, h = dsize if dsize else (int(src.shape[1] * fx), int(src.shape[0] * fy))
        res = pil_img.resize((max(1, w), max(1, h)), resample=_PIL_Image.Resampling.BILINEAR)
        return _np.array(res)

    def GaussianBlur(self, src, ksize, sigmaX, sigmaY=0):
        import scipy.ndimage
        s = sigmaX if sigmaX > 0 else (ksize[0] - 1) / 6.0
        if src.ndim == 2:
            return scipy.ndimage.gaussian_filter(src, sigma=s).astype(src.dtype)
        out = src.copy()
        for c in range(src.shape[2]):
            out[:, :, c] = scipy.ndimage.gaussian_filter(src[:, :, c], sigma=s)
        return out

    def Canny(self, image, threshold1, threshold2, apertureSize=3, L2gradient=False):
        import skimage.feature
        gray = self.cvtColor(image, self.COLOR_BGR2GRAY) if image.ndim == 3 else image
        edges = skimage.feature.canny(gray / 255.0, low_threshold=threshold1 / 255.0, high_threshold=threshold2 / 255.0)
        return (edges * 255).astype(_np.uint8)

    def threshold(self, src, thresh, maxval, type):
        gray = self.cvtColor(src, self.COLOR_BGR2GRAY) if src.ndim == 3 else src.copy()
        if type & self.THRESH_OTSU:
            import skimage.filters
            thresh = skimage.filters.threshold_otsu(gray)
        dst = _np.zeros_like(gray)
        if type & self.THRESH_BINARY_INV:
            dst[gray <= thresh] = maxval
        else:
            dst[gray > thresh] = maxval
        return float(thresh), dst

    def rectangle(self, img, pt1, pt2, color, thickness=1, lineType=8):
        x1, y1 = max(0, min(pt1[0], pt2[0])), max(0, min(pt1[1], pt2[1]))
        x2, y2 = min(img.shape[1] - 1, max(pt1[0], pt2[0])), min(img.shape[0] - 1, max(pt1[1], pt2[1]))
        col = _np.array(color[:img.shape[2] if img.ndim==3 else 1], dtype=img.dtype)
        if thickness == -1 or thickness == self.FILLED:
            img[y1:y2+1, x1:x2+1] = col
        else:
            t = max(1, thickness)
            img[y1:min(y1+t, img.shape[0]), x1:x2+1] = col
            img[max(0, y2-t+1):y2+1, x1:x2+1] = col
            img[y1:y2+1, x1:min(x1+t, img.shape[1])] = col
            img[y1:y2+1, max(0, x2-t+1):x2+1] = col
        return img

    def circle(self, img, center, radius, color, thickness=1, lineType=8):
        pil_img = _PIL_Image.fromarray(img)
        draw = _PIL_ImageDraw.Draw(pil_img)
        cx, cy = center; r = radius
        col = tuple(int(c) for c in color)
        if thickness == -1 or thickness == self.FILLED:
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
        else:
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=col, width=max(1, thickness))
        img[:] = _np.array(pil_img)
        return img

    def line(self, img, pt1, pt2, color, thickness=1, lineType=8):
        pil_img = _PIL_Image.fromarray(img)
        draw = _PIL_ImageDraw.Draw(pil_img)
        col = tuple(int(c) for c in color)
        draw.line([pt1, pt2], fill=col, width=max(1, thickness))
        img[:] = _np.array(pil_img)
        return img

    def putText(self, img, text, org, fontFace, fontScale, color, thickness=1, lineType=8):
        pil_img = _PIL_Image.fromarray(img)
        draw = _PIL_ImageDraw.Draw(pil_img)
        col = tuple(int(c) for c in color)
        draw.text(org, str(text), fill=col)
        img[:] = _np.array(pil_img)
        return img

    def findContours(self, image, mode, method):
        import skimage.measure
        gray = self.cvtColor(image, self.COLOR_BGR2GRAY) if image.ndim == 3 else image
        contours = skimage.measure.find_contours(gray, 127)
        pts_list = [c[:, ::-1].astype(_np.int32) for c in contours]
        return pts_list, None

    def drawContours(self, image, contours, contourIdx, color, thickness=1):
        col = tuple(int(c) for c in color)
        target = contours if contourIdx < 0 else [contours[contourIdx]]
        for pts in target:
            if len(pts) > 1:
                for i in range(len(pts) - 1):
                    self.line(image, tuple(pts[i]), tuple(pts[i+1]), col, thickness)
        return image

_cv2_inst = _CV2Module()
sys.modules['cv2'] = _cv2_inst
cv2 = _cv2_inst

#  Prebuilt ultralytics Module (YOLO) 
class _YOLOBoxes:
    def __init__(self, data):
        self.data = _np.array(data, dtype=_np.float32) if len(data) else _np.zeros((0, 6), dtype=_np.float32)
        self.xyxy = self.data[:, :4] if len(self.data) else _np.zeros((0, 4), dtype=_np.float32)
        self.conf = self.data[:, 4] if len(self.data) else _np.zeros((0,), dtype=_np.float32)
        self.cls  = self.data[:, 5] if len(self.data) else _np.zeros((0,), dtype=_np.float32)
        if len(self.data):
            w = self.xyxy[:, 2] - self.xyxy[:, 0]
            h = self.xyxy[:, 3] - self.xyxy[:, 1]
            cx = self.xyxy[:, 0] + w / 2
            cy = self.xyxy[:, 1] + h / 2
            self.xywh = _np.stack([cx, cy, w, h], axis=-1)
        else:
            self.xywh = _np.zeros((0, 4), dtype=_np.float32)

    def __len__(self): return len(self.data)
    def __iter__(self):
        for i in range(len(self.data)):
            yield _YOLOBoxes([self.data[i]])
    def __repr__(self):
        return f"ultralytics.engine.results.Boxes object with {len(self.data)} detections"

class _YOLOResults:
    def __init__(self, orig_img, boxes_data, names, speed=None):
        self.orig_img = orig_img
        self.names = names
        self.boxes = _YOLOBoxes(boxes_data)
        self.speed = speed or {"preprocess": 1.5, "inference": 32.0, "postprocess": 1.2}

    def plot(self):
        img = self.orig_img.copy() if self.orig_img is not None else _np.zeros((480, 640, 3), dtype=_np.uint8)
        colors = [(235, 92, 155), (22, 115, 249), (180, 80, 250), (30, 200, 100), (250, 180, 20), (20, 200, 240)]
        for i, box in enumerate(self.boxes):
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0]]
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            name = self.names.get(cls_id, f"obj_{cls_id}")
            color = colors[cls_id % len(colors)]
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            label = f"{name} {conf:.2f}"
            cv2.rectangle(img, (x1, max(0, y1 - 20)), (x1 + len(label)*9, y1), color, -1)
            cv2.putText(img, label, (x1 + 2, max(14, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        return img

    def show(self):
        annotated = self.plot()
        cv2.imshow("YOLOv8 Detections", annotated)

    def __repr__(self):
        counts = {}
        for b in self.boxes:
            cname = self.names.get(int(b.cls[0]), "obj")
            counts[cname] = counts.get(cname, 0) + 1
        summary = ", ".join(f"{v} {k}" for k, v in counts.items()) or "(no detections)"
        h, w = (self.orig_img.shape[0], self.orig_img.shape[1]) if self.orig_img is not None else (640, 640)
        return f"image 1/1: {h}x{w} {summary}, {self.speed['inference']:.1f}ms"

class _YOLOModel:
    COCO_CLASSES = {
        0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane', 5: 'bus',
        6: 'train', 7: 'truck', 8: 'boat', 9: 'traffic light', 10: 'fire hydrant',
        11: 'stop sign', 12: 'parking meter', 13: 'bench', 14: 'bird', 15: 'cat',
        16: 'dog', 17: 'horse', 18: 'sheep', 19: 'cow', 20: 'elephant', 21: 'bear',
        22: 'zebra', 23: 'giraffe', 24: 'backpack', 25: 'umbrella', 26: 'handbag',
        27: 'tie', 28: 'suitcase', 29: 'frisbee', 30: 'skis', 31: 'snowboard',
        32: 'sports ball', 33: 'kite', 34: 'baseball bat', 35: 'baseball glove',
        36: 'skateboard', 37: 'surfboard', 38: 'tennis racket', 39: 'bottle',
        40: 'wine glass', 41: 'cup', 42: 'fork', 43: 'knife', 44: 'spoon',
        45: 'bowl', 46: 'banana', 47: 'apple', 48: 'sandwich', 49: 'orange',
        50: 'broccoli', 51: 'carrot', 52: 'hot dog', 53: 'pizza', 54: 'donut',
        55: 'cake', 56: 'chair', 57: 'couch', 58: 'potted plant', 59: 'bed',
        60: 'dining table', 61: 'toilet', 62: 'tv', 63: 'laptop', 64: 'mouse',
        65: 'remote', 66: 'keyboard', 67: 'cell phone', 68: 'microwave', 69: 'oven',
        70: 'toaster', 71: 'sink', 72: 'refrigerator', 73: 'book', 74: 'clock',
        75: 'vase', 76: 'scissors', 77: 'teddy bear', 78: 'hair drier', 79: 'toothbrush'
    }

    def __init__(self, model='yolov8n.pt'):
        self.model_name = str(model)
        self.names = self.COCO_CLASSES

    async def __call__(self, source, conf=0.25, **kwargs):
        return await self.predict(source, conf=conf, **kwargs)

    async def predict(self, source, conf=0.25, **kwargs):
        import js, json
        img_b64 = None; orig_img = None
        if isinstance(source, _np.ndarray):
            orig_img = source.copy()
            rgb = orig_img[:, :, ::-1] if (orig_img.ndim == 3 and orig_img.shape[2] == 3) else orig_img
            pil_img = _PIL_Image.fromarray(rgb.astype(_np.uint8))
            buf = io.BytesIO()
            pil_img.save(buf, format='JPEG', quality=90)
            img_b64 = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
            buf.close()
        elif isinstance(source, _PIL_Image.Image):
            orig_img = _np.array(source)[:, :, ::-1]
            buf = io.BytesIO()
            source.save(buf, format='JPEG', quality=90)
            img_b64 = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
            buf.close()
        elif isinstance(source, str):
            img_b64 = source
            if source in ('sample', 'test'):
                img_b64 = 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=640'

        try:
            res_str = await js.window.runVisionInferenceOnImage(img_b64, float(conf))
            res = json.loads(str(res_str))
            dets = res.get("detections", [])
            w = res.get("width", 640); h = res.get("height", 480)
            if orig_img is None: orig_img = _np.zeros((h, w, 3), dtype=_np.uint8)
            boxes_data = []
            for d in dets:
                x1, y1, bw, bh = d["bbox"]
                boxes_data.append([x1, y1, x1 + bw, y1 + bh, d["confidence"], d["classId"]])
            return [_YOLOResults(orig_img, boxes_data, self.names)]
        except Exception as err:
            print(f"[YOLO Bridge Warning] Browser inference fallback: {err}", file=sys.stderr)
            return [_YOLOResults(orig_img or _np.zeros((480, 640, 3), dtype=_np.uint8), [], self.names)]

class _UltralyticsModule(types.ModuleType):
    def __init__(self):
        super().__init__('ultralytics')
        self.YOLO = _YOLOModel

_ultra_inst = _UltralyticsModule()
sys.modules['ultralytics'] = _ultra_inst

class _SupervisionModule(types.ModuleType):
    def __init__(self): super().__init__('supervision')
    class Detections:
        @classmethod
        def from_ultralytics(cls, result): return result

_sv_inst = _SupervisionModule()
sys.modules['supervision'] = _sv_inst

`;

//  Data Source Example Codes 
const DATA_SOURCE_CODES = {
  vision: `\\
# 
#         RUN01 Computer Vision Tour  OpenCV & YOLOv8       
#   cv2  YOLOv8  Pillow  Canny  Contour  Detection      
# 
import cv2
import numpy as np
from PIL import Image, ImageFilter
from ultralytics import YOLO

print("  1. Testing OpenCV Drawing & Edge Detection")
img = np.zeros((400, 600, 3), dtype=np.uint8)
for y in range(400):
    img[y, :] = [int(40 + y*0.1), int(20 + y*0.1), int(10 + y*0.05)]

cv2.rectangle(img, (50, 60), (260, 220), (0, 210, 130), -1)
cv2.circle(img, (430, 140), 75, (255, 130, 0), 4)
cv2.line(img, (40, 280), (560, 280), (140, 90, 240), 3)
cv2.putText(img, "RUN01 COMPUTER VISION", (50, 340), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
edges = cv2.Canny(gray, 50, 150)

cv2.imshow("OpenCV Art Canvas", img)
cv2.imshow("Canny Edges", edges)
print("[DONE] OpenCV rendering complete!\\n")

print("  2. Testing YOLOv8 AI Object Detection")
model = YOLO('yolov8n.pt')
test_url = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=640"
print(f"   Analyzing: {test_url}")
results = await model(test_url)

for r in results:
    print(r)
    for box in r.boxes:
        cls_name = r.names.get(int(box.cls[0]), "obj")
        conf = float(box.conf[0])
        print(f"    {cls_name.upper()} ({conf*100:.1f}%) at {box.xyxy[0].astype(int).tolist()}")
    r.show()

print("\\n[DONE] Computer Vision & YOLOv8 demo complete!")
`,


yfinance: `\
# 
#           Yahoo Finance - Full Data Tour                  
#   OHLCV  Info  Financials  Options  Holders          
# 
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

ticker = "AAPL"

#  1. OHLCV Price History 
print(f"  Fetching {ticker} - 6 months of daily OHLCV")
df = await yf_download(ticker, period="6mo", interval="1d")
print(f"   {len(df)} sessions  |  columns: {list(df.columns)}")
print(df.tail(5).to_string())
print()

#  2. Interactive Candlestick + Volume 
print("  Rendering interactive candlestick chart")
dates = df.index.astype(str).tolist()
fig = make_subplots(
    rows=2, cols=1, shared_xaxes=True,
    row_heights=[0.72, 0.28], vertical_spacing=0.03,
)
fig.add_trace(go.Candlestick(
    x=dates, open=df["Open"], high=df["High"],
    low=df["Low"], close=df["Close"], name=ticker,
    increasing=dict(line=dict(color="#22c55e", width=1.5), fillcolor="#22c55e"),
    decreasing=dict(line=dict(color="#ef4444", width=1.5), fillcolor="#ef4444"),
), row=1, col=1)
fig.add_trace(go.Bar(
    x=dates, y=df["Volume"] / 1e6, name="Vol (M)",
    marker_color=["#22c55e" if c >= o else "#ef4444"
                  for c, o in zip(df["Close"], df["Open"])],
), row=2, col=1)
fig.update_layout(
    title=dict(text=f"{ticker} - 6-Month Candlestick", font=dict(size=13)),
    paper_bgcolor="#0a0a0a", plot_bgcolor="#111",
    font=dict(color="#aaa", family="JetBrains Mono"),
    xaxis=dict(rangeslider=dict(visible=False), gridcolor="#1a1a1a"),
    yaxis=dict(gridcolor="#1a1a1a"),
    xaxis2=dict(gridcolor="#1a1a1a"),
    yaxis2=dict(gridcolor="#1a1a1a", title="Vol (M)"),
    margin=dict(l=4, r=4, t=36, b=4), height=440,
)
fig.show()
print()

#  3. Returns Summary 
import numpy as np
print("  Returns Summary")
returns = df["Close"].pct_change().dropna()
print(f"   Mean daily return : {returns.mean()*100:+.4f}%")
print(f"   Daily volatility  : {returns.std()*100:.4f}%")
print(f"   Annualised Sharpe : {(returns.mean()/returns.std())*np.sqrt(252):.3f}")
print(f"   Max Drawdown      : {((df['Close']/df['Close'].cummax())-1).min()*100:.2f}%")
print()
print("[DONE] Done - try changing ticker to 'TSLA', 'MSFT', 'BTC-USD', 'GC=F'")
`,

fred: `\
# 
#    FRED - Federal Reserve Economic Data Tour              
#    GDP  CPI  Fed Funds Rate  Unemployment             
# 
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

#  1. GDP (Gross Domestic Product) 
print("  Fetching GDP (quarterly, last 40 quarters)")
gdp = await fred_download("GDP", limit=40, sort_order="asc")
print(f"   Series : {gdp['series_id']} - {gdp['title']}")
print(f"   Units  : {gdp['units']}  |  Freq: {gdp['frequency']}")
print(gdp['df'].tail(5).to_string())
print()

#  2. CPI - Consumer Price Index 
print("  Fetching CPI (monthly, last 60 months)")
cpi = await fred_download("CPIAUCSL", limit=60, sort_order="asc")
print(f"   Series : {cpi['series_id']} - {cpi['title']}")
print(cpi['df'].tail(5).to_string())
print()

#  3. Fed Funds Rate 
print("  Fetching Federal Funds Rate (monthly, last 60 months)")
ffr = await fred_download("FEDFUNDS", limit=60, sort_order="asc")
print(f"   Series : {ffr['series_id']} - {ffr['title']}")
print(ffr['df'].tail(5).to_string())
print()

#  4. Unemployment Rate 
print("  Fetching Unemployment Rate (monthly, last 60 months)")
unrate = await fred_download("UNRATE", limit=60, sort_order="asc")
print(f"   Series : {unrate['series_id']} - {unrate['title']}")
print(unrate['df'].tail(5).to_string())
print()

#  5. Dashboard - 4-panel economic overview 
print("  Rendering economic dashboard")
fig = make_subplots(
    rows=2, cols=2,
    subplot_titles=['GDP', 'CPI', 'Fed Funds', 'Unemployment'],
    vertical_spacing=0.15, horizontal_spacing=0.1,
)
fig.add_trace(go.Scatter(
    x=gdp['df'].index.astype(str), y=gdp['df']['value'],
    mode='lines', line=dict(color='#7aa4ff', width=2), name='GDP',
), row=1, col=1)
fig.add_trace(go.Scatter(
    x=cpi['df'].index.astype(str), y=cpi['df']['value'],
    mode='lines', line=dict(color='#50c878', width=2), name='CPI',
), row=1, col=2)
fig.add_trace(go.Scatter(
    x=ffr['df'].index.astype(str), y=ffr['df']['value'],
    mode='lines', line=dict(color='#f59e0b', width=2), name='Fed Funds',
), row=2, col=1)
fig.add_trace(go.Scatter(
    x=unrate['df'].index.astype(str), y=unrate['df']['value'],
    mode='lines', line=dict(color='#ef4444', width=2), fill='tozeroy',
    fillcolor='rgba(239,68,68,0.08)', name='Unemployment',
), row=2, col=2)
fig.update_layout(
    paper_bgcolor='#0a0a0a', plot_bgcolor='#111',
    font=dict(color='#aaa', family='JetBrains Mono', size=10),
    showlegend=False, height=480,
    margin=dict(l=4, r=4, t=48, b=4),
)
for axis in ['xaxis','xaxis2','xaxis3','xaxis4','yaxis','yaxis2','yaxis3','yaxis4']:
    fig.update_layout(**{axis: dict(gridcolor='#1a1a1a', showgrid=True)})
fig.show()
print()
print("[DONE] Done - try series: 'M2SL' (Money Supply), 'T10Y2Y' (Yield Curve), 'DCOILWTICO' (Oil Price)")
`,

};

//  State 
let monacoEditor   = null;
let pyodide        = null;
let currentLang    = 'python';
let isRunning      = false;
let runCount       = 0;

//  DOM refs 
const statusDot      = document.getElementById('statusDot');
const statusLabel    = document.getElementById('statusLabel');
const btnRun         = document.getElementById('btnRun');
const btnDownload    = document.getElementById('btnDownload');
const btnReset       = document.getElementById('btnReset');
const btnTheme       = document.getElementById('btnTheme');
const outputEl       = document.getElementById('output');
const editorMeta     = document.getElementById('editorMeta');
const outputMeta     = document.getElementById('outputMeta');
const initOverlay    = document.getElementById('initOverlay');
const initProgressEl = document.getElementById('initProgressBar');
const initLabelEl    = document.getElementById('initProgressLabel');
const langTabsEl     = document.getElementById('langTabs');
const langPillEl     = document.getElementById('langPill');
const fileNameEl     = document.getElementById('fileName');

//  Helpers: status + progress 
function setStatus(state, label) {
  statusDot.className     = `status-dot ${state}`;
  statusLabel.textContent = label;
}

function setProgress(pct, label) {
  initProgressEl.style.width = `${Math.min(100, pct)}%`;
  initLabelEl.textContent    = label;
}

function markPillLoaded(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('loaded');
}

function hideOverlay() {
  if (!initOverlay) return;
  initOverlay.classList.add('hiding');
  setTimeout(() => { initOverlay.style.display = 'none'; }, 750);
}
window.hideOverlay = hideOverlay;

//  Monaco initialisation 
// FIX: increased timeout from 5 s to 30 s so large CDN fetches don't
// race-lose on slow connections; resolved after editor.main loads.
const monacoReady = new Promise((resolve) => {
  const timeout = setTimeout(() => {
    console.warn('[Monaco] Loading timed out (30s) - continuing without editor');
    resolve();
  }, 30000); // was 5000 - too short for CDN cold-starts

  function tryInit() {
    if (typeof require === 'undefined') {
      // loader.js not yet parsed - retry in 50 ms
      setTimeout(tryInit, 50);
      return;
    }

    require(['vs/editor/editor.main'], function () {
      clearTimeout(timeout);

      // Guard against the "Duplicate definition" warning from hot-reloads
      if (monacoEditor) { resolve(); return; }

      monaco.editor.defineTheme('run01-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background':                   '#00000000',
          'editor.foreground':                   '#E5E5E7',
          'editor.lineHighlightBackground':      '#ffffff07',
          'editor.selectionBackground':          '#ffffff16',
          'editor.inactiveSelectionBackground':  '#ffffff0a',
          'editorLineNumber.foreground':         '#48484A',
          'editorLineNumber.activeForeground':   '#8E8E93',
          'editorCursor.foreground':             '#A1A1A6',
          'editorIndentGuide.background1':       '#1C1C1E',
          'editorIndentGuide.activeBackground1': '#2C2C2E',
          'editorWidget.background':             '#1C1C1E',
          'editorWidget.border':                 '#3A3A3C',
          'input.background':                    '#2C2C2E',
          'input.foreground':                    '#E5E5E7',
          'scrollbarSlider.background':          '#48484A33',
          'scrollbarSlider.hoverBackground':     '#48484A55',
        },
      });

      monaco.editor.defineTheme('run01-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background':                   '#00000000',
          'editor.foreground':                   '#1D1D1F',
          'editor.lineHighlightBackground':      '#00000006',
          'editor.selectionBackground':          '#00000012',
          'editor.inactiveSelectionBackground':  '#00000008',
          'editorLineNumber.foreground':         '#C7C7CC',
          'editorLineNumber.activeForeground':   '#6E6E73',
          'editorCursor.foreground':             '#6E6E73',
          'editorIndentGuide.background1':       '#F2F2F7',
          'editorIndentGuide.activeBackground1': '#D1D1D6',
          'editorWidget.background':             '#FFFFFF',
          'editorWidget.border':                 '#C7C7CC',
          'input.background':                    '#F2F2F7',
          'input.foreground':                    '#1D1D1F',
          'scrollbarSlider.background':          '#C7C7CC44',
          'scrollbarSlider.hoverBackground':     '#C7C7CC88',
        },
      });

      const initialTheme = (localStorage.getItem('run01-theme') || 'dark') === 'light' ? 'run01-light' : 'run01-dark';

      monacoEditor = monaco.editor.create(document.getElementById('editor'), {
        value:            STARTER_CODES.python,
        language:         'python',
        theme:            initialTheme,
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

      monacoEditor.onDidChangeCursorPosition((e) => {
        const p = e.position;
        editorMeta.textContent = `ln ${p.lineNumber}, col ${p.column}`;
      });

      monacoEditor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => { if (!isRunning && pyodide) triggerRun(); }
      );

      // Force remeasure fonts once custom font loads, preventing line overlaps
      if (document.fonts) {
        document.fonts.ready.then(() => {
          setTimeout(() => {
            if (monaco && monaco.editor) {
              monaco.editor.remeasureFonts();
            }
          }, 100);
          setTimeout(() => {
            if (monaco && monaco.editor) {
              monaco.editor.remeasureFonts();
            }
          }, 1000);
        });
      }

      resolve();
    }, function (err) {
      clearTimeout(timeout);
      console.error('[Monaco] Load failed:', err);
      resolve(); // don't block Pyodide
    });
  }

  tryInit();
});

//  RUN01 Virtual File System (/data/) 
const VFS_DB_NAME = 'run01_vfs';
const VFS_STORE_NAME = 'data_files';

function openVfsDb() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const req = indexedDB.open(VFS_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(VFS_STORE_NAME)) {
        db.createObjectStore(VFS_STORE_NAME, { keyPath: 'filename' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = (err) => {
      console.warn('[VFS] IndexedDB open error:', err);
      resolve(null);
    };
  });
}

function ensurePyodideDataDir() {
  if (!pyodide || !pyodide.FS) return;
  try {
    pyodide.FS.stat('/data');
  } catch (e) {
    try {
      pyodide.FS.mkdir('/data');
    } catch (err) {
      // ignore
    }
  }
}

function removePyodideFile(path) {
  if (!pyodide || !pyodide.FS) return;
  try {
    pyodide.FS.unlink(path);
  } catch (e) {
    // ignore
  }
}

function writePyodideFile(path, content) {
  if (!pyodide || !pyodide.FS) return;
  ensurePyodideDataDir();
  removePyodideFile(path);
  try {
    pyodide.FS.writeFile(path, content);
  } catch (err) {
    console.warn('[VFS] writePyodideFile error:', err);
  }
}

async function saveRun01File(filename, content, meta = {}) {
  const path = `/data/${filename}`;
  writePyodideFile(path, content);

  try {
    const db = await openVfsDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(VFS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(VFS_STORE_NAME);
        store.put({
          filename,
          content,
          updatedAt: new Date().toISOString(),
          size: typeof content === 'string' ? content.length : (content.byteLength || 0),
          category: meta.category || '',
          desc: meta.desc || '',
          sourceName: meta.sourceName || ''
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  } catch (err) {
    console.warn('[VFS] saveRun01File IndexedDB error:', err);
  }
}

async function getRun01File(filename) {
  try {
    const db = await openVfsDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(VFS_STORE_NAME, 'readonly');
      const store = tx.objectStore(VFS_STORE_NAME);
      const req = store.get(filename);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[VFS] getRun01File error:', err);
    return null;
  }
}

async function getAllRun01Files() {
  try {
    const db = await openVfsDb();
    if (!db) return [];
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(VFS_STORE_NAME, 'readonly');
      const store = tx.objectStore(VFS_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[VFS] getAllRun01Files error:', err);
    return [];
  }
}

async function deleteRun01File(filename) {
  const path = `/data/${filename}`;
  removePyodideFile(path);
  try {
    const db = await openVfsDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(VFS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(VFS_STORE_NAME);
        const req = store.delete(filename);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  } catch (err) {
    console.warn('[VFS] deleteRun01File error:', err);
  }
}

// Aliases for compatibility
const saveWebappFile = saveRun01File;
const getWebappFile = getRun01File;
const getAllWebappFiles = getAllRun01Files;
const deleteWebappFile = deleteRun01File;

async function rehydratePyodideVfs() {
  if (!pyodide || !pyodide.FS) return;
  ensurePyodideDataDir();
  try {
    const records = await getAllRun01Files();
    for (const rec of records) {
      const path = `/data/${rec.filename}`;
      removePyodideFile(path);
      pyodide.FS.writeFile(path, rec.content);
    }
    if (records.length > 0) {
      console.log(`[VFS] Rehydrated ${records.length} datasets into Pyodide /data/`);
    }
  } catch (err) {
    console.warn('[VFS] Rehydration error:', err);
  }
}

//  Pyodide initialisation 
let extendedPackagesPromise = null;

async function loadExtendedPackagesInBackground() {
  if (!pyodide || extendedPackagesPromise) return extendedPackagesPromise;
  extendedPackagesPromise = (async () => {
    try {
      // Tier A: Pillow & SciPy
      await pyodide.loadPackage(['pillow', 'scipy']);
      markPillLoaded('ip-pillow');
      markPillLoaded('ip-scipy');

      // Tier B: Scikit-learn, Statsmodels, Scikit-image
      await pyodide.loadPackage(['scikit-learn', 'statsmodels', 'scikit-image']);
      markPillLoaded('ip-sklearn');
      markPillLoaded('ip-sm');
      markPillLoaded('ip-skimage');
      markPillLoaded('ip-cv2');
      markPillLoaded('ip-yolo');

      // Tier C: Seaborn & Plotly via micropip
      try {
        const micropip = pyodide.pyimport('micropip');
        await micropip.install(['seaborn', 'plotly'], { keep_going: true });
        markPillLoaded('ip-sns');
        markPillLoaded('ip-plotly');
        await pyodide.runPythonAsync('_setup_plotly_hooks()');
      } catch (pipErr) {
        console.warn('[Pyodide] Background micropip install notice:', pipErr);
      }
      console.log('[Pyodide] All background packages loaded.');
    } catch (err) {
      console.warn('[Pyodide] Background package load notice:', err);
    }
  })();
  return extendedPackagesPromise;
}

async function initPyodide() {
  setStatus('loading', 'Loading Python runtime');
  setProgress(10, 'Loading Pyodide v0.26.4');

  pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });

  // Core packages: numpy, pandas, matplotlib, micropip (fast sub-3s startup)
  setProgress(40, 'Loading core packages');
  await pyodide.loadPackage([
    'numpy', 'pandas', 'matplotlib', 'micropip',
  ]);
  markPillLoaded('ip-numpy');
  markPillLoaded('ip-pandas');
  markPillLoaded('ip-mpl');

  setProgress(80, 'Setting up environment helpers');
  // runPythonAsync correctly handles docstrings inside PYODIDE_SETUP
  await pyodide.runPythonAsync(PYODIDE_SETUP);

  // Rehydrate RUN01 files from IndexedDB into /data/ in Pyodide VFS
  try {
    await rehydratePyodideVfs();
  } catch (vfsErr) {
    console.warn('[VFS] Rehydration warning:', vfsErr);
  }

  setProgress(100, 'Ready!');

  // Trigger non-blocking background load for heavier extended packages
  loadExtendedPackagesInBackground();
}

let pyodideInitPromise = null;
function startPyodideInit() {
  if (pyodideInitPromise) return pyodideInitPromise;

  // Show skip button after 2.5s if network is slow
  setTimeout(() => {
    const btnSkip = document.getElementById('btnSkipInitOverlay');
    if (btnSkip && initOverlay && initOverlay.style.display !== 'none' && !initOverlay.classList.contains('hiding')) {
      btnSkip.style.display = 'inline-block';
    }
  }, 2500);

  // Safety fallback: ensure overlay never traps user for longer than 6 seconds
  const safetyTimer = setTimeout(() => {
    hideOverlay();
    if (!pyodide) {
      setStatus('loading', 'Loading Python runtime in background...');
    }
  }, 6000);

  pyodideInitPromise = initPyodide().then(() => {
    clearTimeout(safetyTimer);
    return true;
  }).catch((err) => {
    clearTimeout(safetyTimer);
    console.error('Pyodide init failed:', err);
    setStatus('error', 'Python init notice - check console');
    appendToOutput(` Failed to initialise Python:\n${err.message ?? err}`, 'err');
    return false;
  });

  Promise.all([monacoReady, pyodideInitPromise]).then(([_, pySuccess]) => {
    if (pySuccess) {
      setStatus('ready', 'Ready');
      btnRun.disabled = false;
    }
    hideOverlay();
    clearOutput();
    appendWelcome();
  }).catch((err) => {
    console.error('Startup error:', err);
    hideOverlay();
    setStatus('ready', 'Ready');
  });

  return pyodideInitPromise;
}

// Automatically start Pyodide if #ide is active, or warm up quickly during idle time
if (window.location.hash === '#ide') {
  startPyodideInit();
} else {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => { setTimeout(startPyodideInit, 250); }, { timeout: 1500 });
  } else {
    setTimeout(startPyodideInit, 500);
  }
}

// Hover intent: pre-warm Pyodide the instant user moves towards any launch CTA
document.addEventListener('pointerenter', (e) => {
  const btn = e.target && e.target.closest && e.target.closest('.btn-launch-ide, #btnLandingLaunchIDE, #btnHeroLaunchIDE, #btnProofLaunchIDE, #btnFounderLaunchIDE');
  if (btn && typeof startPyodideInit === 'function') {
    startPyodideInit();
  }
}, { capture: true, passive: true });

//  Language tabs 
langTabsEl.addEventListener('click', () => { /* Python only */ });

//  Trigger run 
function triggerRun() {
  if (isRunning) return;
  if (!pyodide)  return;
  return runPython();
}

//  Execute and Verify Code (Structured Result Promise) 
async function executeAndVerifyCode(codeToRun) {
  if (!pyodide && typeof pyodideInitPromise !== 'undefined' && pyodideInitPromise) {
    try {
      await pyodideInitPromise;
    } catch (_) {}
  }
  if (!pyodide) {
    return {
      success: false,
      error: 'Pyodide WASM runtime is not initialized.',
      errorType: 'RuntimeNotReady',
      errorLine: null,
      stdout: '',
      stderr: '',
      elapsed: 0
    };
  }
  if (isRunning) {
    return {
      success: false,
      error: 'An execution is already in progress.',
      errorType: 'ConcurrentExecutionError',
      errorLine: null,
      stdout: '',
      stderr: '',
      elapsed: 0
    };
  }

  const code = (typeof codeToRun === 'string' && codeToRun.length > 0)
    ? codeToRun
    : (monacoEditor ? monacoEditor.getValue() : '');

  if (!code.trim()) {
    return {
      success: false,
      error: 'No code to execute.',
      errorType: 'EmptyCodeError',
      errorLine: null,
      stdout: '',
      stderr: '',
      elapsed: 0
    };
  }

  isRunning = true;
  runCount++;
  if (btnRun) btnRun.disabled = true;
  setStatus('running', 'Running');
  if (outputMeta) outputMeta.textContent = 'running';

  const block = startOutputBlock();
  const stdoutLines = [];
  const stderrLines = [];

  pyodide.setStdout({ batched: (line) => {
    stdoutLines.push(line);
    processOutput(line, false, block);
  }});
  pyodide.setStderr({ batched: (line) => {
    stderrLines.push(line);
    processOutput(line, true, block);
  }});

  let success = false;
  let rawError = null;
  const startTime = performance.now();

  try {
    if (pyodide && typeof pyodide.loadPackagesFromImports === 'function') {
      try {
        await pyodide.loadPackagesFromImports(code);
      } catch (pkgErr) {
        console.warn('[Pyodide] loadPackagesFromImports notice:', pkgErr);
      }
    }
    await pyodide.runPythonAsync(code);
    success = true;
  } catch (err) {
    success = false;
    let msg = err?.message ?? String(err);
    // Friendly hint for the most common mistake: importing yfinance directly in WASM
    if (msg.includes("No module named 'yfinance'") || msg.includes('No module named "yfinance"')) {
      msg = `ModuleNotFoundError: No module named 'yfinance'\n\n`
          + `yfinance cannot run inside the browser (no network access from WASM).\n`
          + `Use the built-in async helper instead:\n\n`
          + `  df = await yf_download("AAPL", period="3mo")\n\n`
          + `yf_download() fetches data via the Run01 server proxy and returns\n`
          + `a standard pandas DataFrame - no import needed.`;
    }
    rawError = msg;
    stderrLines.push(msg);
    processOutput(msg, true, block);
  }

  const elapsed = parseFloat(((performance.now() - startTime) / 1000).toFixed(3));
  finishOutputBlock(block, success);
  isRunning = false;
  if (btnRun) btnRun.disabled = false;
  setStatus(success ? 'ready' : 'error',
            success ? `Done in ${elapsed}s` : 'Error');

  // Parse structured error details
  let errorType = null;
  let errorLine = null;
  if (!success && rawError) {
    const lineMatches = [...rawError.matchAll(/line\s+(\d+)/gi)];
    if (lineMatches.length > 0) {
      const lastMatch = lineMatches[lineMatches.length - 1];
      errorLine = parseInt(lastMatch[1], 10);
    }

    const typeMatch = rawError.match(/([A-Za-z_]+(?:Error|Exception|Warning|Interrupt)):\s*(.*)/);
    if (typeMatch) {
      errorType = typeMatch[1];
    } else {
      errorType = 'RuntimeError';
    }
  }

  const result = {
    success,
    error: rawError,
    errorType,
    errorLine,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    elapsed
  };

  return result;
}
window.executeAndVerifyCode = executeAndVerifyCode;

//  Run: Python (Pyodide, client-side) 
async function runPython() {
  return await executeAndVerifyCode();
}

//  Output block management 
function startOutputBlock() {
  const startTime = performance.now();
  const blockEl   = document.createElement('div');
  blockEl.className = 'out-block';

  const headerEl = document.createElement('div');
  headerEl.className = 'out-run-header';

  const numEl = document.createElement('span');
  numEl.className   = 'out-run-num';
  numEl.textContent = `Run #${runCount}`;

  const langBadgeEl = document.createElement('span');
  langBadgeEl.className   = 'out-lang-badge';
  langBadgeEl.textContent = LANG_META[currentLang].pill;

  const badgeEl = document.createElement('span');
  const timeEl  = document.createElement('span');
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
    blockEl, linesEl, badgeEl, timeEl, startTime,
    elapsed: () => ((performance.now() - startTime) / 1000).toFixed(3),
  };
}

function finishOutputBlock(block, success) {
  const t = block.elapsed();
  if (block.linesEl.children.length === 0) {
    const empty = document.createElement('span');
    empty.className   = 'out-line out-empty';
    empty.textContent = '(no output)';
    block.linesEl.appendChild(empty);
  }
  block.badgeEl.className   = success ? 'out-success-badge' : 'out-error-badge';
  block.badgeEl.textContent = success ? '[DONE] success' : ' error';
  block.timeEl.textContent  = `${t}s`;
  outputMeta.textContent    = `run #${runCount}  ${t}s`;
  outputEl.scrollTop = outputEl.scrollHeight;
}

//  Output line processor 
function processOutput(text, isErr, block) {
  if (!text) return;
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line && lines.length > 1) continue;
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
  span.className   = `out-line${cls ? ' ' + cls : ''}`;
  span.textContent = text;
  block.linesEl.appendChild(span);
  outputEl.scrollTop = outputEl.scrollHeight;
}

//  Matplotlib inline image 
function renderImage(b64, block) {
  const wrap = document.createElement('div');
  wrap.className = 'out-plot-wrap';
  const img = document.createElement('img');
  img.className = 'out-plot-img';
  img.alt = 'matplotlib chart';
  img.src = `data:image/png;base64,${b64}`;
  img.style.opacity    = '0';
  img.style.transition = 'opacity 0.4s ease';
  img.onload = () => { img.style.opacity = '1'; };
  wrap.appendChild(img);
  block.linesEl.appendChild(wrap);
  outputEl.scrollTop = outputEl.scrollHeight;
}

//  Plotly loader 
// Polls until window.Plotly.newPlot is available (the UMD build sets it
// synchronously, but the script tag is sync-before-defer so there can still
// be a brief gap on slow connections). Falls back to injecting the full UMD
// build if polling times out.
function waitForPlotly(timeoutMs) {
  return new Promise((resolve, reject) => {
    if (window.Plotly && typeof window.Plotly.newPlot === 'function') {
      return resolve(window.Plotly);
    }
    const deadline = Date.now() + timeoutMs;
    const iv = setInterval(() => {
      if (window.Plotly && typeof window.Plotly.newPlot === 'function') {
        clearInterval(iv);
        resolve(window.Plotly);
      } else if (Date.now() > deadline) {
        clearInterval(iv);
        reject(new Error('Plotly did not become ready in time'));
      }
    }, 50);
  });
}

function loadPlotlyFallback() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/plotly.js@2.35.2/dist/plotly.min.js';
    s.crossOrigin = 'anonymous';
    s.onload  = () => waitForPlotly(3000).then(resolve).catch(reject);
    s.onerror = () => reject(new Error('Plotly.js CDN load failed'));
    document.head.appendChild(s);
  });
}

function getPlotly() {
  return waitForPlotly(8000).catch(() => loadPlotlyFallback());
}

//  Plotly interactive chart 
async function renderPlotly(encoded, block) {
  const wrap = document.createElement('div');
  wrap.className = 'out-plotly-wrap';
  block.linesEl.appendChild(wrap);
  outputEl.scrollTop = outputEl.scrollHeight;

  // Placeholder while library resolves
  if (!window.Plotly || typeof window.Plotly.newPlot !== 'function') {
    wrap.innerHTML = '<span class="out-line sys" style="padding:12px;display:block">[ Loading chart ]</span>';
  }

  try {
    const bytes   = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const jsonStr = new TextDecoder('utf-8').decode(bytes);
    const fig     = JSON.parse(jsonStr);

    const PlotlyLib = await getPlotly();
    wrap.innerHTML  = '';

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    const layout = Object.assign({}, fig.layout ?? {}, {
      paper_bgcolor: 'transparent',
      plot_bgcolor:  isDark ? '#111111' : '#ffffff',
      font: Object.assign({}, fig.layout?.font ?? {},
            { color: '#aaaaaa', family: 'JetBrains Mono, monospace', size: 11 }),
      xaxis:  Object.assign({ gridcolor: isDark ? '#222' : '#e5e5e5', zerolinecolor: isDark ? '#333' : '#ccc', rangeslider: { visible: false } }, fig.layout?.xaxis  ?? {}),
      yaxis:  Object.assign({ gridcolor: isDark ? '#222' : '#e5e5e5', zerolinecolor: isDark ? '#333' : '#ccc' }, fig.layout?.yaxis  ?? {}),
      xaxis2: Object.assign({ gridcolor: isDark ? '#222' : '#e5e5e5', zerolinecolor: isDark ? '#333' : '#ccc' }, fig.layout?.xaxis2 ?? {}),
      yaxis2: Object.assign({ gridcolor: isDark ? '#222' : '#e5e5e5', zerolinecolor: isDark ? '#333' : '#ccc' }, fig.layout?.yaxis2 ?? {}),
      legend: Object.assign({ bgcolor: 'rgba(0,0,0,0)', font: { color: '#aaa' } }, fig.layout?.legend ?? {}),
      margin: fig.layout?.margin ?? { l: 50, r: 20, t: 40, b: 40 },
      height: fig.layout?.height ?? 440,
    });

    PlotlyLib.newPlot(wrap, fig.data ?? [], layout, {
      responsive:     true,
      displaylogo:    false,
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d', 'sendDataToCloud'],
    });

  } catch (err) {
    console.error('Plotly render error:', err);
    wrap.innerHTML = '';
    const msg = document.createElement('span');
    msg.className   = 'out-line err';
    msg.textContent = ' Chart render failed: ' + (err.message ?? String(err));
    wrap.appendChild(msg);
  }

  outputEl.scrollTop = outputEl.scrollHeight;
}

//  Output helpers 
function clearOutput() {
  outputEl.innerHTML     = '';
  runCount               = 0;
  outputMeta.textContent = 'ready';
}

function appendWelcome() {
  outputEl.innerHTML = `
    <div class="output-welcome">
      <div class="welcome-prompt">
        <span class="prompt-caret"></span>
        Run01 ready - press <strong style="color:var(--white)"> Run</strong>
        or <kbd class="welcome-kbd"></kbd>
        to execute.
      </div>
    </div>
  `;
}

function appendToOutput(text, cls) {
  const span = document.createElement('span');
  span.className   = `out-line${cls ? ' ' + cls : ''}`;
  span.textContent = text;
  outputEl.appendChild(span);
}

//  Theme management 
const THEME_KEY = 'run01-theme';

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  if (monacoEditor) {
    monaco.editor.setTheme(theme === 'light' ? 'run01-light' : 'run01-dark');
  }
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// Apply saved theme immediately
applyTheme(getTheme());

//  Download output as .txt 
function downloadOutput() {
  const lines = outputEl.querySelectorAll('.out-line');
  if (lines.length === 0) return;
  const parts = [];
  lines.forEach(line => {
    if (!line.classList.contains('out-empty')) parts.push(line.textContent);
  });
  const content = parts.join('\n');
  const blob    = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  const ts      = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  a.href        = url;
  a.download    = `run01-output-${ts}.txt`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

//  Button handlers 
btnRun.addEventListener('click', () => { if (!isRunning) triggerRun(); });

btnDownload.addEventListener('click', downloadOutput);

btnTheme.addEventListener('click', toggleTheme);

btnReset.addEventListener('click', () => {
  if (monacoEditor) monacoEditor.setValue(STARTER_CODES[currentLang]);
  clearOutput();
  appendWelcome();
  setStatus('ready', 'Ready');
});

//  Data Explorer bottom panel 
const btnData         = document.getElementById('btnData');
const dataDropdown    = document.getElementById('dataDropdown');
const dsYFinance      = document.getElementById('dsYFinance');
const dsFRED          = document.getElementById('dsFRED');

const dexPanel        = document.getElementById('dexPanel');
const resizeHandleH   = document.getElementById('resizeHandleH');
const dexCloseBtn     = document.getElementById('dexCloseBtn');
const fsBottomBtn     = document.getElementById('fsBottomBtn');
const workspaceOuter  = document.getElementById('workspaceOuter');

const DEX_DEFAULT_H = 320; // px - initial height when first opened

function openDataExplorer() {
  // Show the horizontal resize handle and the panel
  resizeHandleH.style.display = 'block';
  dexPanel.style.display      = 'flex';
  if (!dexPanel.style.height) dexPanel.style.height = DEX_DEFAULT_H + 'px';
  closeDataDropdown();
  switchTab(activeSource);
}

function closeDataExplorer() {
  resizeHandleH.style.display = 'none';
  dexPanel.style.display      = 'none';
  // Also exit bottom-fullscreen if active
  if (workspaceOuter) workspaceOuter.classList.remove('bottom-fullscreen');
}

btnData.addEventListener('click', (e) => {
  e.stopPropagation();
  openDataExplorer();
});

dexCloseBtn.addEventListener('click', closeDataExplorer);

// Bottom fullscreen toggle
if (fsBottomBtn && workspaceOuter) {
  fsBottomBtn.addEventListener('click', () => {
    workspaceOuter.classList.toggle('bottom-fullscreen');
    if (monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
  });
}

function closeDataDropdown() {
  dataDropdown.classList.remove('open');
  btnData.setAttribute('aria-expanded', 'false');
}

// Close when clicking outside dropdown wrap
document.addEventListener('click', (e) => {
  if (!e.target.closest('#dataDropdownWrap')) closeDataDropdown();
});

// Dropdown click shortcuts
dsYFinance.addEventListener('click', () => {
  openDataExplorer();
  switchTab('yf');
});
dsFRED.addEventListener('click', () => {
  openDataExplorer();
  switchTab('fred');
});

  const dsVision = document.getElementById('dsVision');
  if (dsVision) {
    dsVision.addEventListener('click', () => {
      if (monacoEditor && DATA_SOURCE_CODES.vision) {
        monacoEditor.setValue(DATA_SOURCE_CODES.vision);
        dataDropdown.classList.remove('open');
        btnData.setAttribute('aria-expanded', 'false');
        clearOutput();
        appendWelcome();
        setStatus('ready', 'Loaded Computer Vision sample');
      }
    });
  }


//  DATA INVENTORY STRUCTURES 
const YF_TREE = {
  name: "DATA/YFINANCE",
  type: "root",
  children: [
    {
      name: "TICKER",
      type: "folder",
      children: [
        {
          name: "01_price_history",
          type: "folder",
          children: [
            { name: "ohlcv_1d.csv", type: "file", category: "history", params: { interval: "1d" }, desc: "Open,High,Low,Close,Volume,Dividends,Splits" },
            { name: "ohlcv_1wk.csv", type: "file", category: "history", params: { interval: "1wk" }, desc: "" },
            { name: "ohlcv_1mo.csv", type: "file", category: "history", params: { interval: "1mo" }, desc: "" },
            { name: "ohlcv_3mo.csv", type: "file", category: "history", params: { interval: "3mo" }, desc: "" },
            { name: "ohlcv_1m.csv", type: "file", category: "history", params: { interval: "1m" }, desc: "intraday, last 7 days only" },
            { name: "ohlcv_2m_5m_15m_30m.csv", type: "file", category: "history", params: { interval: "5m" }, desc: "last 60 days only" },
            { name: "ohlcv_1h_90m.csv", type: "file", category: "history", params: { interval: "1h" }, desc: "~730 days" },
            { name: "ohlcv_max_period.csv", type: "file", category: "history", params: { period: "max" }, desc: "full available history" },
            { name: "prepost_market.csv", type: "file", category: "history", params: { prepost: true }, desc: "pre/post-market bars" },
            { name: "auto_adjusted.csv", type: "file", category: "history", params: { auto_adjust: true }, desc: "default, split+div adjusted" },
            { name: "raw_unadjusted.csv", type: "file", category: "history", params: { auto_adjust: false }, desc: "raw close, no adjustment" },
            { name: "back_adjusted.csv", type: "file", category: "history", params: { back_adjust: true }, desc: "" },
            { name: "history_metadata.json", type: "file", category: "history_metadata", desc: "exchange,timezone,gmtoffset,currency,firstTradeDate" },
            { name: "isin.txt", type: "file", category: "isin", desc: "isin / get_isin()" }
          ]
        },
        {
          name: "02_corporate_actions",
          type: "folder",
          children: [
            { name: "dividends.csv", type: "file", category: "dividends", desc: "dividends / get_dividends()" },
            { name: "splits.csv", type: "file", category: "splits", desc: "splits / get_splits()" },
            { name: "capital_gains.csv", type: "file", category: "capital_gains", desc: "capital_gains / get_capital_gains() (funds only)" },
            { name: "actions_combined.csv", type: "file", category: "actions", desc: "actions / get_actions() dividends+splits merged timeline" },
            { name: "shares_outstanding_history.csv", type: "file", category: "shares_full", desc: "get_shares_full(start,end) granular share-count history" }
          ]
        },
        {
          name: "03_financial_statements",
          type: "folder",
          children: [
            { name: "income_statement_annual.csv", type: "file", category: "financials", desc: "income_stmt / financials" },
            { name: "income_statement_quarterly.csv", type: "file", category: "quarterly_financials", desc: "quarterly_income_stmt / quarterly_financials" },
            { name: "income_statement_ttm.csv", type: "file", category: "ttm_financials", desc: "ttm_income_stmt / ttm_financials" },
            { name: "balance_sheet_annual.csv", type: "file", category: "balance_sheet", desc: "balance_sheet / balancesheet" },
            { name: "balance_sheet_quarterly.csv", type: "file", category: "quarterly_balance_sheet", desc: "quarterly_balance_sheet" },
            { name: "cashflow_annual.csv", type: "file", category: "cashflow", desc: "cashflow / cash_flow" },
            { name: "cashflow_quarterly.csv", type: "file", category: "quarterly_cashflow", desc: "quarterly_cashflow" },
            { name: "cashflow_ttm.csv", type: "file", category: "ttm_cashflow", desc: "ttm_cashflow" },
            { name: "earnings_legacy.csv", type: "file", category: "earnings", desc: "earnings / quarterly_earnings (deprecated, kept for compat)" }
          ]
        },
        {
          name: "04_earnings_and_estimates",
          type: "folder",
          children: [
            { name: "earnings_dates.csv", type: "file", category: "earnings_dates", desc: "earnings_dates / get_earnings_dates() past+upcoming, EPS est vs actual" },
            { name: "earnings_history.csv", type: "file", category: "earnings_history", desc: "earnings_history epsEstimate, epsActual, epsDifference, surprisePercent" },
            { name: "earnings_estimate.csv", type: "file", category: "earnings_estimate", desc: "earnings_estimate analyst count + avg/low/high EPS est (0q,+1q,0y,+1y)" },
            { name: "revenue_estimate.csv", type: "file", category: "revenue_estimate", desc: "revenue_estimate analyst revenue estimates, same periods" },
            { name: "eps_trend.csv", type: "file", category: "eps_trend", desc: "eps_trend estimate trend at current/7/30/60/90 days ago" },
            { name: "eps_revisions.csv", type: "file", category: "eps_revisions", desc: "eps_revisions # analysts revising up/down in last 7/30 days" },
            { name: "growth_estimates.csv", type: "file", category: "growth_estimates", desc: "growth_estimates stock vs industry/sector/index growth (incl. +5y,-5y)" },
            { name: "calendar.json", type: "file", category: "calendar", desc: "calendar / get_calendar() next earnings date, ex-div date & amount" }
          ]
        },
        {
          name: "05_analyst_coverage",
          type: "folder",
          children: [
            { name: "recommendations.csv", type: "file", category: "recommendations", desc: "recommendations strongBuy/buy/hold/sell/strongSell counts by month" },
            { name: "recommendations_summary.csv", type: "file", category: "recommendations_summary", desc: "recommendations_summary" },
            { name: "upgrades_downgrades.csv", type: "file", category: "upgrades_downgrades", desc: "upgrades_downgrades date, firm, fromGrade, toGrade, action" },
            { name: "analyst_price_targets.json", type: "file", category: "analyst_price_targets", desc: "analyst_price_targets current/low/high/mean/median target" }
          ]
        },
        {
          name: "06_ownership_and_holders",
          type: "folder",
          children: [
            { name: "major_holders.csv", type: "file", category: "major_holders", desc: "major_holders % held by insiders / institutions, # institutions" },
            { name: "institutional_holders.csv", type: "file", category: "institutional_holders", desc: "institutional_holders top holders, shares held, value, % out" },
            { name: "mutualfund_holders.csv", type: "file", category: "mutualfund_holders", desc: "mutualfund_holders top mutual-fund holders" },
            { name: "insider_transactions.csv", type: "file", category: "insider_transactions", desc: "insider_transactions individual insider buy/sell trades" },
            { name: "insider_purchases.csv", type: "file", category: "insider_purchases", desc: "insider_purchases aggregated purchase/sale summary" },
            { name: "insider_roster_holders.csv", type: "file", category: "insider_roster_holders", desc: "insider_roster_holders named insiders + position/title" }
          ]
        },
        {
          name: "07_company_profile",
          type: "folder",
          children: [
            { name: "info_full.json", type: "file", category: "info", desc: "info / get_info() 150+ fields" },
            { name: "fast_info.json", type: "file", category: "fast_info", desc: "fast_info / get_fast_info() quick snapshot (fewer fields, faster)" },
            { name: "sec_filings.json", type: "file", category: "sec_filings", desc: "sec_filings / get_sec_filings() 10-K/10-Q/8-K list + links + dates" },
            { name: "sustainability_esg.csv", type: "file", category: "sustainability", desc: "sustainability / get_sustainability() E/S/G scores, controversy level" },
            { name: "shares_basic.csv", type: "file", category: "shares", desc: "shares / get_shares()" },
            { name: "valuation_measures_history.csv", type: "file", category: "valuation", desc: "valuation / get_valuation_measures(freq,periods) market cap, trailing/forward P/E, P/S, P/B, EV/EBITDA, EV/Revenue" }
          ]
        },
        {
          name: "08_options",
          type: "folder",
          children: [
            { name: "expiration_dates.txt", type: "file", category: "options", desc: "options tuple of every available expiry date" },
            { name: "calls_<EXPIRY>.csv", type: "file", category: "option_chain", desc: "option_chain(date).calls strike,bid,ask,lastPrice,volume,openInterest,impliedVolatility,inTheMoney" },
            { name: "puts_<EXPIRY>.csv", type: "file", category: "option_chain", desc: "option_chain(date).puts same columns" },
            { name: "underlying_<EXPIRY>.json", type: "file", category: "option_chain", desc: "option_chain(date).underlying underlying snapshot at fetch time" }
          ]
        },
        {
          name: "09_news",
          type: "folder",
          children: [
            { name: "news.json", type: "file", category: "news", desc: "news / get_news(count, tab) headline, publisher, link, time, thumbnail" }
          ]
        },
        {
          name: "10_funds_data",
          type: "folder",
          children: [
            { name: "description.txt", type: "file", category: "funds_description", desc: ".description fund objective/strategy text" },
            { name: "fund_overview.json", type: "file", category: "funds_fund_overview", desc: ".fund_overview category, family, legal type, inception" },
            { name: "fund_operations.csv", type: "file", category: "funds_fund_operations", desc: ".fund_operations net expense ratio, turnover, vs. category avg" },
            { name: "asset_classes.csv", type: "file", category: "funds_asset_classes", desc: ".asset_classes % cash / stock / bond / other" },
            { name: "top_holdings.csv", type: "file", category: "funds_top_holdings", desc: ".top_holdings top ~10 holdings + % weight" },
            { name: "equity_holdings.csv", type: "file", category: "funds_equity_holdings", desc: ".equity_holdings avg P/E, P/B, P/CF, P/S, growth vs category" },
            { name: "bond_holdings.csv", type: "file", category: "funds_bond_holdings", desc: ".bond_holdings duration, maturity vs category" },
            { name: "bond_ratings.csv", type: "file", category: "funds_bond_ratings", desc: ".bond_ratings % AAA/AA/A/BBB/BB/B/below-B/other" },
            { name: "sector_weightings.csv", type: "file", category: "funds_sector_weightings", desc: ".sector_weightings % allocation by GICS sector" }
          ]
        }
      ]
    },
    {
      name: "MULTI_TICKER",
      type: "folder",
      children: [
        { name: "batch_download_ohlcv.csv", type: "file", category: "batch_download", desc: "yf.download([tickers], start, end, group_by, threads) many tickers, one call" },
        { name: "tickers_bulk_object.json", type: "file", category: "tickers", desc: "yf.Tickers('AAPL MSFT GOOG') dict of Ticker objects, one request each" }
      ]
    },
    {
      name: "MARKET",
      type: "folder",
      children: [
        { name: "market_status.json", type: "file", category: "status", desc: ".status open/closed, session start/end, timezone" },
        { name: "market_summary.json", type: "file", category: "summary", desc: ".summary snapshot of major indices (^GSPC,^DJI,^IXIC,^RUT,^VIX,)" }
      ]
    },
    {
      name: "SECTOR_AND_INDUSTRY",
      type: "folder",
      children: [
        { name: "sector_overview.json", type: "file", category: "sector_overview", desc: "Sector.overview description, market cap, # companies/employees" },
        { name: "sector_top_companies.csv", type: "file", category: "sector_top_companies", desc: "Sector.top_companies ranked by market cap within the sector" },
        { name: "sector_top_etfs.csv", type: "file", category: "sector_top_etfs", desc: "Sector.top_etfs largest ETFs tracking the sector" },
        { name: "sector_top_mutual_funds.csv", type: "file", category: "sector_top_mutual_funds", desc: "Sector.top_mutual_funds" },
        { name: "sector_industries_breakdown.csv", type: "file", category: "sector_industries", desc: "Sector.industries market weight of each industry in sector" },
        { name: "sector_research_reports.json", type: "file", category: "sector_research_reports", desc: "Sector.research_reports" },
        { name: "industry_overview.json", type: "file", category: "industry_overview", desc: "Industry.overview" },
        { name: "industry_top_performing_companies.csv", type: "file", category: "industry_top_performing_companies", desc: "Industry.top_performing_companies by price return" },
        { name: "industry_top_growth_companies.csv", type: "file", category: "industry_top_growth_companies", desc: "Industry.top_growth_companies by growth metrics" }
      ]
    },
    {
      name: "SCREENER",
      type: "folder",
      children: [
        { name: "predefined_screens.csv", type: "file", category: "predefined_screens", desc: "screen('day_gainers') - static preset, no ticker required. Downloads directly." }
      ]
    },
    {
      name: "SEARCH_AND_LOOKUP",
      type: "folder",
      children: [
        { name: "search_results.json", type: "file", category: "search", desc: "Search(query) matching quotes, news, research for free-text search" },
        { name: "lookup_results.csv", type: "file", category: "lookup", desc: "Lookup(query) symbol lookup filtered by type (stock/etf/fund/index/future/crypto)" }
      ]
    },
    {
      name: "CALENDARS",
      type: "folder",
      children: [
        { name: "calendar_events.csv", type: "file", category: "calendar", desc: "broader economic/earnings calendar events across the market" }
      ]
    }
  ]
};

const FRED_TREE = {
  name: "DATA/FRED",
  type: "root",
  children: [
    {
      name: "01_MONEY_BANKING_FINANCE",
      type: "folder",
      children: [
        {
          name: "interest_rates",
          type: "folder",
          children: [
            { name: "fed_funds_rate.csv", type: "file", category: "fred", series_id: "FEDFUNDS", desc: "FEDFUNDS (monthly), DFF (daily)" },
            { name: "treasury_yields_all_maturities.csv", type: "file", category: "fred", series_id: "DGS10", desc: "DGS1MO,DGS3MO,DGS1,DGS2,DGS5,DGS10,DGS30" },
            { name: "yield_curve_spreads.csv", type: "file", category: "fred", series_id: "T10Y2Y", desc: "T10Y2Y, T10Y3M" },
            { name: "sofr.csv", type: "file", category: "fred", series_id: "SOFR", desc: "SOFR" },
            { name: "prime_rate.csv", type: "file", category: "fred", series_id: "DPRIME", desc: "DPRIME" },
            { name: "tips_real_yield.csv", type: "file", category: "fred", series_id: "DFII10", desc: "DFII10" },
            { name: "mortgage_rates_30yr_15yr.csv", type: "file", category: "fred", series_id: "MORTGAGE30US", desc: "MORTGAGE30US, MORTGAGE15US" }
          ]
        },
        {
          name: "exchange_rates",
          type: "folder",
          children: [
            { name: "usd_vs_major_currencies.csv", type: "file", category: "fred", series_id: "DEXUSEU", desc: "DEXUSEU,DEXJPUS,DEXCHUS,DEXUSUK,DTWEXBGS(broad $ index)" }
          ]
        },
        {
          name: "monetary_data",
          type: "folder",
          children: [
            { name: "money_supply_m1_m2.csv", type: "file", category: "fred", series_id: "M2SL", desc: "M1SL, M2SL" },
            { name: "monetary_base.csv", type: "file", category: "fred", series_id: "BOGMBASE", desc: "BOGMBASE" },
            { name: "fed_balance_sheet_assets.csv", type: "file", category: "fred", series_id: "WALCL", desc: "WALCL" }
          ]
        },
        {
          name: "financial_indicators",
          type: "folder",
          children: [
            { name: "vix_volatility_index.csv", type: "file", category: "fred", series_id: "VIXCLS", desc: "VIXCLS" },
            { name: "sp500_index.csv", type: "file", category: "fred", series_id: "SP500", desc: "SP500" },
            { name: "corporate_bond_yields_spreads.csv", type: "file", category: "fred", series_id: "BAMLH0A0HYM2", desc: "AAA, BAA, BAA10Y" },
            { name: "high_yield_spread.csv", type: "file", category: "fred", series_id: "BAMLH0A0HYM2", desc: "BAMLH0A0HYM2" }
          ]
        },
        {
          name: "banking",
          type: "folder",
          children: [
            { name: "bank_credit_all_commercial.csv", type: "file", category: "fred", series_id: "TOTBKCR", desc: "TOTBKCR" },
            { name: "commercial_industrial_loans.csv", type: "file", category: "fred", series_id: "BUSLOANS", desc: "BUSLOANS" },
            { name: "bank_reserves.csv", type: "file", category: "fred", series_id: "TOTRESNS", desc: "TOTRESNS" }
          ]
        },
        {
          name: "business_lending",
          type: "folder",
          children: [
            { name: "business_lending_detail.csv", type: "file", category: "fred", series_id: "BUSLOANS", desc: "" }
          ]
        },
        {
          name: "foreign_exchange_intervention",
          type: "folder",
          children: [
            { name: "fx_intervention.csv", type: "file", category: "fred", series_id: "DEXUSEU", desc: "" }
          ]
        }
      ]
    },
    {
      name: "02_POPULATION_EMPLOYMENT_LABOR_MARKETS",
      type: "folder",
      children: [
        {
          name: "current_population_survey",
          type: "folder",
          children: [
            { name: "unemployment_rate_national.csv", type: "file", category: "fred", series_id: "UNRATE", desc: "UNRATE" },
            { name: "unemployment_rate_by_state.csv", type: "file", category: "fred", series_id: "CAUR", desc: "e.g. CAUR, TXUR, NYUR (one code per state)" },
            { name: "labor_force_participation.csv", type: "file", category: "fred", series_id: "CIVPART", desc: "CIVPART" }
          ]
        },
        {
          name: "current_employment_statistics",
          type: "folder",
          children: [
            { name: "nonfarm_payrolls.csv", type: "file", category: "fred", series_id: "PAYEMS", desc: "PAYEMS" },
            { name: "avg_hourly_earnings.csv", type: "file", category: "fred", series_id: "CES0500000003", desc: "CES0500000003" }
          ]
        },
        {
          name: "adp_employment",
          type: "folder",
          children: [
            { name: "adp_employment.csv", type: "file", category: "fred", series_id: "ADPMNUSNERSA", desc: "ADPMNUSNERSA" }
          ]
        },
        {
          name: "jolts",
          type: "folder",
          children: [
            { name: "job_openings.csv", type: "file", category: "fred", series_id: "JTSJOL", desc: "JTSJOL" },
            { name: "hires.csv", type: "file", category: "fred", series_id: "JTSHIL", desc: "JTSHIL" },
            { name: "quits.csv", type: "file", category: "fred", series_id: "JTSQUL", desc: "JTSQUL" }
          ]
        },
        {
          name: "weekly_initial_claims",
          type: "folder",
          children: [
            { name: "initial_claims.csv", type: "file", category: "fred", series_id: "ICSA", desc: "ICSA" }
          ]
        },
        {
          name: "population",
          type: "folder",
          children: [
            { name: "population.csv", type: "file", category: "fred", series_id: "POPTHM", desc: "POPTHM" }
          ]
        },
        {
          name: "productivity_and_costs",
          type: "folder",
          children: [
            { name: "productivity.csv", type: "file", category: "fred", series_id: "OPHNFB", desc: "OPHNFB (nonfarm labor productivity)" }
          ]
        },
        {
          name: "minimum_wage",
          type: "folder",
          children: [
            { name: "minimum_wage.csv", type: "file", category: "fred", series_id: "FEDMINNFRWG", desc: "FEDMINNFRWG" }
          ]
        }
      ]
    },
    {
      name: "03_NATIONAL_ACCOUNTS",
      type: "folder",
      children: [
        {
          name: "national_income_product_accounts",
          type: "folder",
          children: [
            { name: "gdp_nominal.csv", type: "file", category: "fred", series_id: "GDP", desc: "GDP" },
            { name: "gdp_real_chained.csv", type: "file", category: "fred", series_id: "GDPC1", desc: "GDPC1" },
            { name: "gdp_per_capita.csv", type: "file", category: "fred", series_id: "A939RX0Q048SBEA", desc: "A939RX0Q048SBEA" },
            { name: "gnp.csv", type: "file", category: "fred", series_id: "GNP", desc: "GNP" },
            { name: "personal_consumption_expenditures.csv", type: "file", category: "fred", series_id: "PCE", desc: "PCE" },
            { name: "gross_private_investment.csv", type: "file", category: "fred", series_id: "GPDI", desc: "GPDI" },
            { name: "govt_consumption_investment.csv", type: "file", category: "fred", series_id: "GCE", desc: "GCE" },
            { name: "net_exports.csv", type: "file", category: "fred", series_id: "NETEXP", desc: "NETEXP" }
          ]
        },
        {
          name: "federal_government_debt",
          type: "folder",
          children: [
            { name: "total_public_debt.csv", type: "file", category: "fred", series_id: "GFDEBTN", desc: "GFDEBTN" },
            { name: "debt_held_by_public.csv", type: "file", category: "fred", series_id: "FYGFDPUN", desc: "FYGFDPUN" }
          ]
        },
        {
          name: "flow_of_funds",
          type: "folder",
          children: [
            { name: "flow_of_funds.csv", type: "file", category: "fred", series_id: "BOGZ1FL192090005Q", desc: "household/sector balance sheets, by instrument" }
          ]
        },
        {
          name: "us_trade_international_transactions",
          type: "folder",
          children: [
            { name: "trade_balance_goods_services.csv", type: "file", category: "fred", series_id: "BOPGSTB", desc: "BOPGSTB" },
            { name: "exports.csv", type: "file", category: "fred", series_id: "EXPGS", desc: "EXPGS" },
            { name: "imports.csv", type: "file", category: "fred", series_id: "IMPGS", desc: "IMPGS" },
            { name: "current_account_balance.csv", type: "file", category: "fred", series_id: "IEABC", desc: "IEABC" }
          ]
        }
      ]
    },
    {
      name: "04_PRODUCTION_AND_BUSINESS_ACTIVITY",
      type: "folder",
      children: [
        {
          name: "housing",
          type: "folder",
          children: [
            { name: "case_shiller_home_price_index.csv", type: "file", category: "fred", series_id: "CSUSHPISA", desc: "CSUSHPISA" },
            { name: "housing_starts.csv", type: "file", category: "fred", series_id: "HOUST", desc: "HOUST" },
            { name: "building_permits.csv", type: "file", category: "fred", series_id: "PERMIT", desc: "PERMIT" },
            { name: "existing_home_sales.csv", type: "file", category: "fred", series_id: "EXHOSLUSM495S", desc: "EXHOSLUSM495S" },
            { name: "new_home_sales.csv", type: "file", category: "fred", series_id: "HSN1F", desc: "HSN1F" },
            { name: "median_home_sale_price.csv", type: "file", category: "fred", series_id: "MSPUS", desc: "MSPUS" }
          ]
        },
        {
          name: "industrial_production_capacity",
          type: "folder",
          children: [
            { name: "industrial_production_index.csv", type: "file", category: "fred", series_id: "INDPRO", desc: "INDPRO" },
            { name: "capacity_utilization.csv", type: "file", category: "fred", series_id: "TCU", desc: "TCU" }
          ]
        },
        {
          name: "retail_trade",
          type: "folder",
          children: [
            { name: "retail_trade.csv", type: "file", category: "fred", series_id: "RSXFS", desc: "RSXFS / RSAFS" }
          ]
        },
        {
          name: "business_cycle_expansions_contractions",
          type: "folder",
          children: [
            { name: "business_cycle.csv", type: "file", category: "fred", series_id: "USREC", desc: "USREC (NBER recession indicator)" }
          ]
        }
      ]
    },
    {
      name: "05_PRICES",
      type: "folder",
      children: [
        {
          name: "consumer_price_indexes_cpi_pce",
          type: "folder",
          children: [
            { name: "cpi_all_urban_consumers.csv", type: "file", category: "fred", series_id: "CPIAUCSL", desc: "CPIAUCSL" },
            { name: "core_cpi_ex_food_energy.csv", type: "file", category: "fred", series_id: "CPILFESL", desc: "CPILFESL" },
            { name: "pce_price_index.csv", type: "file", category: "fred", series_id: "PCEPI", desc: "PCEPI" },
            { name: "core_pce_price_index.csv", type: "file", category: "fred", series_id: "PCEPILFE", desc: "PCEPILFE (the Fed's preferred inflation gauge)" }
          ]
        },
        {
          name: "producer_price_indexes_ppi",
          type: "folder",
          children: [
            { name: "ppi.csv", type: "file", category: "fred", series_id: "PPIFIS", desc: "PPIFIS" }
          ]
        },
        {
          name: "house_price_indexes",
          type: "folder",
          children: [
            { name: "house_price_index.csv", type: "file", category: "fred", series_id: "HPIPONM226S", desc: "HPIPONM226S" }
          ]
        },
        {
          name: "commodities",
          type: "folder",
          children: [
            { name: "wti_crude_oil.csv", type: "file", category: "fred", series_id: "DCOILWTICO", desc: "DCOILWTICO" },
            { name: "brent_crude_oil.csv", type: "file", category: "fred", series_id: "DCOILBRENTEU", desc: "DCOILBRENTEU" },
            { name: "gold_price.csv", type: "file", category: "fred", series_id: "GOLDAMGBD228NLBM", desc: "GOLDAMGBD228NLBM" },
            { name: "henry_hub_natural_gas.csv", type: "file", category: "fred", series_id: "DHHNGSP", desc: "DHHNGSP" }
          ]
        },
        {
          name: "cryptocurrencies",
          type: "folder",
          children: [
            { name: "crypto.csv", type: "file", category: "fred", series_id: "CBBTCUSD", desc: "CBBTCUSD, CBETHUSD" }
          ]
        }
      ]
    },
    {
      name: "08_ACADEMIC_DATA",
      type: "folder",
      children: [
        { name: "banking_monetary_statistics_1914_1941.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "nber_macrohistory_database.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "penn_world_table_7_1.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "penn_world_table_11_0.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "economic_policy_uncertainty_index.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "recession_probabilities.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "daily_fed_funds_rate_1928_1954.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "millennium_macro_data_uk.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "historical_federal_reserve_data.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "holc_redlining_maps_effects.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "survey_working_arrangements_attitudes.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" },
        { name: "weekly_bond_prices_1855_1865.csv", type: "file", category: "fred", series_id: "M1SL", desc: "" }
      ]
    },
    {
      name: "09_API_METADATA_ENDPOINTS",
      type: "folder",
      children: [
        {
          name: "categories",
          type: "folder",
          children: [
            { name: "category_related_tags.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/category/related_tags" }
          ]
        },
        {
          name: "releases",
          type: "folder",
          children: [
            { name: "all_releases.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/releases (~300 scheduled data releases)" },
            { name: "all_release_dates.csv", type: "file", category: "fred", series_id: "M1SL", desc: "fred/releases/dates" },
            { name: "release_by_id.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/release" },
            { name: "release_dates.csv", type: "file", category: "fred", series_id: "M1SL", desc: "fred/release/dates" },
            { name: "release_series.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/release/series" },
            { name: "release_sources.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/release/sources" },
            { name: "release_tags.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/release/tags" },
            { name: "release_related_tags.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/release/related_tags" },
            { name: "release_tables.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/release/tables" }
          ]
        },
        {
          name: "series",
          type: "folder",
          children: [
            { name: "series_metadata.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series title,units,freq,seasonal adj,notes,dates" },
            { name: "series_categories.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/categories" },
            { name: "series_OBSERVATIONS.csv", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/observations <-- the actual data VALUES, use this" },
            { name: "series_release.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/release" },
            { name: "series_search_results.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/search keyword search across all 930k+ series" },
            { name: "series_search_tags.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/search/tags" },
            { name: "series_search_related_tags.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/search/related_tags" },
            { name: "series_tags.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/tags" },
            { name: "series_updates_feed.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/updates recently updated series" },
            { name: "series_vintage_dates.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/series/vintagedates ALFRED revision-history dates" }
          ]
        },
        {
          name: "sources",
          type: "folder",
          children: [
            { name: "all_sources.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/sources every provider (BLS, BEA, Census, Fed Board, etc.)" },
            { name: "source_by_id.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/source" },
            { name: "source_releases.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/source/releases" }
          ]
        },
        {
          name: "tags",
          type: "folder",
          children: [
            { name: "all_tags.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/tags every topical tag ('gdp','monthly','nsa','usa',)" },
            { name: "related_tags.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/related_tags" },
            { name: "tags_matching_series.json", type: "file", category: "fred", series_id: "M1SL", desc: "fred/tags/series" }
          ]
        },
        {
          name: "geofred_maps",
          type: "folder",
          children: [
            { name: "shape_files.geojson", type: "file", category: "fred", series_id: "M1SL", desc: "geofred/shapes" },
            { name: "series_group_metadata.json", type: "file", category: "fred", series_id: "M1SL", desc: "geofred/series_group" },
            { name: "series_regional_data.json", type: "file", category: "fred", series_id: "M1SL", desc: "geofred/series_data" },
            { name: "regional_data_by_date.json", type: "file", category: "fred", series_id: "M1SL", desc: "geofred/regional_data" }
          ]
        }
      ]
    }
  ]
};


//  SIDE PANEL LOGIC 
let activeSource = 'yf';

function switchTab(source) {
  activeSource = source;
  const tabYF = document.getElementById('dexTabYF');
  const tabFRED = document.getElementById('dexTabFRED');
  const tabVFS = document.getElementById('dexTabVFS');
  const searchInput = document.getElementById('dexSearch');

  if (tabYF) {
    tabYF.classList.toggle('active', source === 'yf');
    tabYF.setAttribute('aria-selected', source === 'yf' ? 'true' : 'false');
  }
  if (tabFRED) {
    tabFRED.classList.toggle('active', source === 'fred');
    tabFRED.setAttribute('aria-selected', source === 'fred' ? 'true' : 'false');
  }
  if (tabVFS) {
    tabVFS.classList.toggle('active', source === 'vfs');
    tabVFS.setAttribute('aria-selected', source === 'vfs' ? 'true' : 'false');
  }

  if (source === 'yf') {
    renderTree(YF_TREE, searchInput ? searchInput.value : '');
  } else if (source === 'fred') {
    renderTree(FRED_TREE, searchInput ? searchInput.value : '');
  } else if (source === 'vfs') {
    renderVfsTree(searchInput ? searchInput.value : '');
  }
}

document.getElementById('dexTabYF').addEventListener('click', () => switchTab('yf'));
document.getElementById('dexTabFRED').addEventListener('click', () => switchTab('fred'));
const tabVFSEl = document.getElementById('dexTabVFS');
if (tabVFSEl) tabVFSEl.addEventListener('click', () => switchTab('vfs'));

document.getElementById('dexSearch').addEventListener('input', (e) => {
  if (activeSource === 'vfs') {
    renderVfsTree(e.target.value);
  } else {
    const currentTree = activeSource === 'yf' ? YF_TREE : FRED_TREE;
    renderTree(currentTree, e.target.value);
  }
});

function countFiles(node) {
  if (node.type === 'file') return 1;
  if (!node.children) return 0;
  return node.children.reduce((acc, child) => acc + countFiles(child), 0);
}

function filterTree(node, query) {
  if (!query) return node;
  const isMatch = node.name.toLowerCase().includes(query.toLowerCase());

  if (node.type === 'file') {
    return isMatch ? node : null;
  }

  if (node.children) {
    const matchedChildren = node.children
      .map(child => filterTree(child, query))
      .filter(child => child !== null);

    if (matchedChildren.length > 0) {
      return { ...node, children: matchedChildren };
    }
  }

  return isMatch ? { ...node, children: [] } : null;
}

function renderTree(treeData, searchQuery = '') {
  const treePane = document.getElementById('dexTreePane');
  treePane.innerHTML = '';

  let dataToRender = treeData;
  if (searchQuery) {
    const filtered = filterTree(treeData, searchQuery);
    if (!filtered) {
      treePane.innerHTML = `<div class="dex-no-results">No datasets match "${searchQuery}"</div>`;
      return;
    }
    dataToRender = filtered;
  }

  const renderedNode = renderNode(dataToRender, 0, searchQuery);
  if (searchQuery) {
    expandAllNodes(renderedNode);
  } else {
    renderedNode.setAttribute('aria-expanded', 'true');
  }
  treePane.appendChild(renderedNode);
}

function expandAllNodes(element) {
  if (element.classList.contains('dex-node')) {
    element.setAttribute('aria-expanded', 'true');
    const children = element.querySelectorAll('.dex-node');
    children.forEach(child => child.setAttribute('aria-expanded', 'true'));
  }
}

function highlightText(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<span class="dex-hl">$1</span>');
}

function renderNode(node, depth = 0, searchQuery = '') {
  const nodeEl = document.createElement('div');

  if (node.type === 'file') {
    nodeEl.className = `dex-file dex-l${depth}`;
    nodeEl.setAttribute('role', 'treeitem');
    const displayName = highlightText(node.name, searchQuery);
    nodeEl.innerHTML = `
      <svg class="dex-file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="dex-file-name">${displayName}</span>
      <span class="dex-file-ext">${node.name.split('.').pop().toUpperCase()}</span>
    `;
    nodeEl.addEventListener('click', () => selectFileNode(node, nodeEl));
  } else {
    const isRoot = node.type === 'root';
    nodeEl.className = isRoot ? 'dex-node' : 'dex-folder-node dex-node';
    nodeEl.setAttribute('role', 'treeitem');
    nodeEl.setAttribute('aria-expanded', 'false');

    const headerEl = document.createElement('div');
    headerEl.className = isRoot ? 'dex-cat-header' : `dex-folder dex-l${depth}`;

    const chevronSvg = `
      <svg class="${isRoot ? 'dex-cat-chevron' : 'dex-folder-chevron'}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    `;

    const folderIconSvg = isRoot ? '' : `
      <svg class="dex-folder-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    `;

    const displayName = highlightText(node.name, searchQuery);
    const label = isRoot ? `<span class="dex-cat-label">${displayName}</span>` : `<span>${displayName}</span>`;
    const count = isRoot ? `<span class="dex-cat-count">${countFiles(node)} files</span>` : '';

    headerEl.innerHTML = `${chevronSvg}${folderIconSvg}${label}${count}`;
    nodeEl.appendChild(headerEl);

    const childrenEl = document.createElement('div');
    childrenEl.className = isRoot ? 'dex-cat-children' : 'dex-folder-children';

    node.children.forEach(child => {
      childrenEl.appendChild(renderNode(child, depth + 1, searchQuery));
    });
    nodeEl.appendChild(childrenEl);

    headerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = nodeEl.getAttribute('aria-expanded') === 'true';
      nodeEl.setAttribute('aria-expanded', String(!isExpanded));
    });
  }

  return nodeEl;
}

let selectedNode = null;

//  STATIC / NO-INPUT DATASET DOWNLOADS 
// Curated FRED macro series, FRED global metadata, and yfinance predefined
// screens need no ticker/series lookup - fetch + download them directly
// instead of just handing the user a code snippet.

const FRED_META_ENDPOINTS = {
  'all_releases.json':     'releases',
  'all_release_dates.csv': 'releases/dates',
  'all_sources.json':      'sources',
  'all_tags.json':         'tags',
  'category_by_id.json':   'category',
  'category_children.json': 'category/children',
  'category_related.json': 'category/related',
  'category_series_list.json': 'category/series',
  'category_tags.json':    'category/tags',
  'category_related_tags.json': 'category/related_tags',
  'release_by_id.json':    'release',
  'release_dates.csv':     'release/dates',
  'release_series.json':   'release/series',
  'release_sources.json':  'release/sources',
  'release_tags.json':     'release/tags',
  'release_related_tags.json': 'release/related_tags',
  'release_tables.json':   'release/tables',
  'series_metadata.json':  'series',
  'series_categories.json': 'series/categories',
  'series_release.json':   'series/release',
  'series_search_results.json': 'series/search',
  'series_search_tags.json': 'series/search/tags',
  'series_search_related_tags.json': 'series/search/related_tags',
  'series_tags.json':      'series/tags',
  'series_updates_feed.json': 'series/updates',
  'series_vintage_dates.json': 'series/vintagedates',
  'source_by_id.json':     'source',
  'source_releases.json':  'source/releases',
  'related_tags.json':     'related_tags',
  'tags_matching_series.json': 'tags/series'
};

function getStaticDownloadInfo(node) {
  if (node.type !== 'file') return null;

  // FRED global metadata (releases / sources / tags / categories / series - no series id needed)
  if ((node.category === 'fred' || node.category === 'fred_meta') && FRED_META_ENDPOINTS[node.name]) {
    const ep = FRED_META_ENDPOINTS[node.name];
    return { url: `/api/fred/meta/${ep}`, key: `fredmeta_${ep.replace(/\//g, '_')}`, filename: node.name };
  }

  // Curated FRED macro series with a real (non-placeholder) series id
  if (node.category === 'fred' && node.series_id && node.series_id !== 'M1SL') {
    return { url: `/api/fred/${node.series_id}`, key: `fred_${node.series_id}`, filename: node.name };
  }

  // yfinance predefined screener presets - no ticker required
  if (node.category === 'predefined_screens') {
    return { url: `/api/yf/screen/day_gainers`, key: `yf_screen_day_gainers`, filename: node.name };
  }

  return null;
}

function formatTimestamp(iso) {
  if (!iso) return 'Never';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function toCSV(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Array.from(
    rows.reduce((set, row) => { Object.keys(row).forEach(k => set.add(k)); return set; }, new Set())
  );
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','));
  return lines.join('\n');
}

function extractRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['observations', 'releases', 'sources', 'tags', 'quotes']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function generateAnalysisCode(filename, isCsv) {
  if (isCsv) {
    return `#  Analyze RUN01 Dataset: /data/${filename} 
import pandas as pd

file_path = "/data/${filename}"
df = pd.read_csv(file_path)

print(f"Loaded dataset: {file_path}")
print(f"Shape: {df.shape[0]} rows x {df.shape[1]} columns\\n")
print("Columns & Types:")
print(df.dtypes)
print("\\nFirst 10 rows:")
print(df.head(10))`;
  } else {
    return `#  Analyze RUN01 Dataset: /data/${filename} 
import json

file_path = "/data/${filename}"
with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Loaded JSON dataset: {file_path}")
if isinstance(data, list):
    print(f"Total items: {len(data)}")
    if len(data) > 0:
        print("\\nSample item:")
        print(data[0])
elif isinstance(data, dict):
    print(f"Keys ({len(data.keys())} total): {list(data.keys())[:10]}")
    for k in list(data.keys())[:6]:
        v = data[k]
        preview = f"{len(v)} items" if isinstance(v, (list, dict)) else str(v)[:80]
        print(f"  {k}: {preview}")`;
  }
}

function openFileInEditor(filename, isCsv) {
  const code = generateAnalysisCode(filename, isCsv);
  if (monacoEditor) {
    monacoEditor.setValue(code);
    closeDataExplorer();
    monacoEditor.focus();
    triggerRun();
  }
}

async function renderStaticDownloadStatus(staticInfo) {
  const el = document.getElementById('dexStaticStatus');
  if (!el) return;
  const file = await getWebappFile(staticInfo.filename);
  if (file) {
    el.innerHTML = `<span style="color: #22c55e;">[DONE] Synced in RUN01 (<code>/data/${staticInfo.filename}</code>)</span><br><span style="opacity:0.75; font-size:10px;">Latest: ${formatTimestamp(file.updatedAt)}  ${formatFileSize(file.size)}</span>`;
  } else {
    el.textContent = 'Not synced into RUN01 yet  will be stored directly in /data/';
  }
}

async function downloadStaticDataset(staticInfo, node, autoAnalyze = false) {
  const analyzeBtn = document.getElementById('dexStaticAnalyzeBtn');
  const syncBtn = document.getElementById('dexStaticSyncBtn');
  const statusEl = document.getElementById('dexStaticStatus');

  if (analyzeBtn) analyzeBtn.disabled = true;
  if (syncBtn) syncBtn.disabled = true;
  const originalAnalyzeText = analyzeBtn ? analyzeBtn.innerHTML : '';
  if (analyzeBtn) analyzeBtn.textContent = 'Syncing into RUN01';

  try {
    const resp = await fetch(staticInfo.url);
    const data = await resp.json();
    if (data && data.error) throw new Error(data.error);

    const rows  = extractRows(data);
    const isCsv = node.name.toLowerCase().endsWith('.csv');
    const content = isCsv
      ? toCSV(rows.length ? rows : (Array.isArray(data) ? data : [data]))
      : JSON.stringify(data, null, 2);

    // Save directly to RUN01 virtual file system (/data/<filename>)
    // Any older version is automatically deleted and refreshed
    await saveWebappFile(staticInfo.filename, content, {
      category: node.category,
      desc: node.desc,
      sourceName: staticInfo.sourceName || (node.category === 'predefined_screens' ? 'yfinance' : 'FRED')
    });

    localStorage.setItem(`run01-dl-${staticInfo.key}`, new Date().toISOString());
    await renderStaticDownloadStatus(staticInfo);

    if (autoAnalyze) {
      openFileInEditor(staticInfo.filename, isCsv);
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444;">[ERROR] Sync failed: ${err.message ?? err}</span>`;
  } finally {
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = originalAnalyzeText;
    }
    if (syncBtn) syncBtn.disabled = false;
  }
}

async function renderStaticDatasetCard(node, staticInfo, iconText, iconClass, sourceName, previewPane) {
  const isCsv = node.name.toLowerCase().endsWith('.csv');
  const existingFile = await getWebappFile(node.name);
  const samplePython = generateAnalysisCode(node.name, isCsv);
  const highlightedCode = highlightSyntax(samplePython);

  const card = document.createElement('div');
  card.className = 'dex-preview-card';
  card.innerHTML = `
    <div class="dex-preview-name">
      <span class="dex-preview-icon ${iconClass}">${iconText}</span>
      <span>${node.name}</span>
    </div>
    <div class="dex-preview-desc">${node.desc}</div>
    <div class="dex-preview-meta">
      <span class="dex-meta-tag vfs">RUN01 /DATA/</span>
      <span class="dex-meta-tag api">${sourceName}</span>
      <span class="dex-meta-tag">Auto-Refreshes Latest</span>
    </div>
    <div class="dex-static-info" id="dexStaticStatus">Checking RUN01 storage</div>

    <div style="font-size: 11px; margin-top: 14px; margin-bottom: 6px; color: var(--text-muted); font-weight: 500;">PYTHON USAGE IN CODE PANEL</div>
    <pre class="dex-code-preview"><code>${highlightedCode}</code></pre>

    <button class="dex-load-btn" id="dexStaticAnalyzeBtn" style="margin-top: 14px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px;"><polyline points="9 18 15 12 9 6"/></svg>
      ${existingFile ? 'Refresh Latest & Analyze' : 'Load into RUN01 & Analyze'}
    </button>
    <button class="dex-btn-secondary" id="dexStaticSyncBtn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Sync into RUN01 Only
    </button>
  `;
  previewPane.appendChild(card);
  await renderStaticDownloadStatus(staticInfo);

  const analyzeBtn = document.getElementById('dexStaticAnalyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => downloadStaticDataset(staticInfo, node, true));
  }

  const syncBtn = document.getElementById('dexStaticSyncBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => downloadStaticDataset(staticInfo, node, false));
  }
}

async function renderVfsTree(searchQuery = '') {
  const treePane = document.getElementById('dexTreePane');
  const previewPane = document.getElementById('dexPreviewPane');
  treePane.innerHTML = '';

  const files = await getAllWebappFiles();
  const filtered = searchQuery
    ? files.filter(f => f.filename.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  if (filtered.length === 0) {
    treePane.innerHTML = `
      <div style="padding: 20px 16px; color: var(--text-dim); font-family: var(--font-mono); font-size: 11px; line-height: 1.6;">
        ${files.length === 0
          ? 'No files stored in RUN01 <code>/data/</code> yet.<br><br>Browse <b>FRED</b> or <b>YF</b> screener datasets and click <b>Load into RUN01</b> to sync.'
          : `No stored files match "${searchQuery}"`}
      </div>`;
    return;
  }

  const rootEl = document.createElement('div');
  rootEl.className = 'dex-folder open';
  rootEl.innerHTML = `
    <div class="dex-folder-header">
      <svg class="dex-folder-arrow open" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      <span class="dex-folder-icon"></span>
      <span class="dex-folder-name">DATA (${filtered.length} files)</span>
    </div>
    <div class="dex-folder-children"></div>
  `;
  treePane.appendChild(rootEl);

  const childrenEl = rootEl.querySelector('.dex-folder-children');

  filtered.forEach(file => {
    const fileEl = document.createElement('div');
    fileEl.className = 'dex-file';
    const isCsv = file.filename.toLowerCase().endsWith('.csv');
    const badge = isCsv ? 'CSV' : 'JSON';
    const sizeStr = formatFileSize(file.size);

    fileEl.innerHTML = `
      <span class="dex-file-icon"></span>
      <span class="dex-file-name" title="${file.filename}">${file.filename}</span>
      <span class="dex-file-badge">${badge}</span>
      <span style="font-size: 9px; color: var(--text-dim); margin-left: auto;">${sizeStr}</span>
    `;

    fileEl.addEventListener('click', () => {
      document.querySelectorAll('.dex-file.selected').forEach(el => el.classList.remove('selected'));
      fileEl.classList.add('selected');
      renderVfsPreviewCard(file);
    });

    childrenEl.appendChild(fileEl);
  });
}

function renderVfsPreviewCard(file) {
  const previewPane = document.getElementById('dexPreviewPane');
  previewPane.innerHTML = '';

  const isCsv = file.filename.toLowerCase().endsWith('.csv');
  const code = generateAnalysisCode(file.filename, isCsv);
  const highlightedCode = highlightSyntax(code);

  const card = document.createElement('div');
  card.className = 'dex-preview-card';
  card.innerHTML = `
    <div class="dex-preview-name">
      <span class="dex-preview-icon vfs">FS</span>
      <span>${file.filename}</span>
    </div>
    <div class="dex-preview-desc">${file.desc || 'Stored in RUN01 virtual file system (/data/)'}</div>
    <div class="dex-preview-meta">
      <span class="dex-meta-tag vfs">/data/${file.filename}</span>
      <span class="dex-meta-tag">${formatFileSize(file.size)}</span>
      <span class="dex-meta-tag api">${file.sourceName || 'RUN01 VFS'}</span>
    </div>
    <div class="dex-static-info">
      [DONE] Ready in RUN01 memory<br>
      <span style="opacity:0.75; font-size:10px;">Last refreshed: ${formatTimestamp(file.updatedAt)}</span>
    </div>
    <div style="font-size: 11px; margin-top: 14px; margin-bottom: 6px; color: var(--text-muted); font-weight: 500;">PYTHON ANALYSIS CODE</div>
    <pre class="dex-code-preview"><code>${highlightedCode}</code></pre>
    <div style="display:flex; gap:8px; margin-top:14px;">
      <button class="dex-load-btn" id="vfsRunBtn" style="flex:1;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px;"><polyline points="9 18 15 12 9 6"/></svg>
        Analyze in Code Panel
      </button>
      <button class="dex-btn-delete" id="vfsDeleteBtn" title="Delete from RUN01">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Delete
      </button>
    </div>
  `;
  previewPane.appendChild(card);

  document.getElementById('vfsRunBtn').addEventListener('click', () => {
    openFileInEditor(file.filename, isCsv);
  });

  document.getElementById('vfsDeleteBtn').addEventListener('click', async () => {
    await deleteWebappFile(file.filename);
    const searchInput = document.getElementById('dexSearch');
    await renderVfsTree(searchInput ? searchInput.value : '');
    previewPane.innerHTML = `
      <div class="dex-empty-state">
        <span style="color: #ef4444; font-size: 13px;">Deleted /data/${file.filename}</span>
      </div>`;
  });
}

function selectFileNode(node, element) {
  const selectedElements = document.querySelectorAll('.dex-file.selected');
  selectedElements.forEach(el => el.classList.remove('selected'));

  element.classList.add('selected');
  selectedNode = node;

  const previewPane = document.getElementById('dexPreviewPane');
  previewPane.innerHTML = '';

  const isYF = node.category !== 'fred' && node.category !== 'fred_meta';
  const iconText = isYF ? 'YF' : 'FD';
  const iconClass = isYF ? 'yf' : 'fred';
  const sourceName = isYF ? 'yfinance' : 'FRED';

  const staticInfo = getStaticDownloadInfo(node);
  if (staticInfo) {
    renderStaticDatasetCard(node, staticInfo, iconText, iconClass, sourceName, previewPane);
    return;
  }

  let pythonCode = '';
  if (isYF) {
    if (node.category === 'history') {
      const period   = (node.params && node.params.period)   ? node.params.period   : '1mo';
      const interval = (node.params && node.params.interval) ? node.params.interval : '1d';
      pythonCode = `\
#  Fetch OHLCV price history 
ticker   = "AAPL"
period   = "${period}"
interval = "${interval}"

df = await yf_download(ticker, period=period, interval=interval)
print(f"Downloaded {len(df)} rows for {ticker}")
print(df.tail(10))`;

    } else if (node.category === 'isin') {
      pythonCode = `\
#  Fetch ISIN for ticker 
ticker = "AAPL"
data = await yf_fetch(ticker, "isin")
print(f"ISIN: {data}")`;

    } else if (node.category === 'option_chain') {
      pythonCode = `\
#  Fetch option chain for nearest expiry 
ticker = "AAPL"

dates = await yf_options(ticker)
print(f"Available expiries ({len(dates)} total): {dates[:5]}")

if dates:
    chain = await yf_option_chain(ticker, dates[0])
    calls = chain["calls"]
    puts  = chain["puts"]
    print(f"\\nExpiry: {dates[0]}")
    print(f"Calls: {len(calls)} contracts | Puts: {len(puts)} contracts")
    print("\\nTop 5 calls by volume:")
    print(calls.nlargest(5, "volume")[["strike","lastPrice","bid","ask","volume","impliedVolatility"]])`;

    } else if (node.category === 'options') {
      pythonCode = `\
#  Fetch available option expiry dates 
ticker = "AAPL"

dates = await yf_options(ticker)
print(f"Found {len(dates)} expiration dates")
for d in dates:
    print(f"  {d}")`;

    } else if (node.category === 'info' || node.category === 'fast_info') {
      pythonCode = `\
#  Fetch company profile info 
ticker = "AAPL"

data = await yf_fetch(ticker, "${node.category}")

# Print key metrics
keys = ["longName","sector","industry","marketCap",
        "trailingPE","forwardPE","dividendYield",
        "52WeekChange","country","fullTimeEmployees"]
for k in keys:
    if k in data:
        print(f"{k:20}: {data[k]}")`;

    } else if (node.category === 'news') {
      pythonCode = `\
#  Fetch latest news headlines 
ticker = "AAPL"

news = await yf_news(ticker)
print(f"Found {len(news)} articles\\n")
for item in news[:8]:
    print(f"[{item.get('publisher','?')}] {item.get('title','')}")
    print(f"  {item.get('link','')}\\n")`;

    } else if (node.category === 'dividends') {
      pythonCode = `\
#  Fetch dividend history 
ticker = "AAPL"

df = await yf_dividends(ticker)
print(f"Dividend history: {len(df)} payments")
print(df.tail(12))`;

    } else if (node.category === 'splits') {
      pythonCode = `\
#  Fetch stock split history 
ticker = "AAPL"

df = await yf_splits(ticker)
print(f"Split history: {len(df)} splits")
print(df)`;

    } else if (node.category === 'actions') {
      pythonCode = `\
#  Fetch combined corporate actions (dividends + splits) 
ticker = "AAPL"

df = await yf_actions(ticker)
print(f"Corporate actions: {len(df)} events")
print(df.tail(15))`;

    } else if (['financials', 'quarterly_financials', 'ttm_financials'].includes(node.category)) {
      pythonCode = `\
#  Fetch income statement (${node.category}) 
ticker = "AAPL"

df = await yf_fetch(ticker, "${node.category}")
print(f"Income statement ({node.category}):")
if hasattr(df, "head"):
    print(df.head(10))
else:
    print(df)`;

    } else if (['balance_sheet', 'quarterly_balance_sheet'].includes(node.category)) {
      pythonCode = `\
#  Fetch balance sheet (${node.category}) 
ticker = "AAPL"

df = await yf_fetch(ticker, "${node.category}")
print(f"Balance sheet ({node.category}):")
if hasattr(df, "head"):
    print(df.head(10))
else:
    print(df)`;

    } else if (['cashflow', 'quarterly_cashflow', 'ttm_cashflow'].includes(node.category)) {
      pythonCode = `\
#  Fetch cash flow statement (${node.category}) 
ticker = "AAPL"

df = await yf_fetch(ticker, "${node.category}")
print(f"Cash flow ({node.category}):")
if hasattr(df, "head"):
    print(df.head(10))
else:
    print(df)`;

    } else if (['recommendations', 'recommendations_summary'].includes(node.category)) {
      pythonCode = `\
#  Fetch analyst recommendations (${node.category}) 
ticker = "AAPL"

df = await yf_fetch(ticker, "${node.category}")
print(f"Recommendations ({node.category}):")
if hasattr(df, "head"):
    print(df.head(10))
else:
    print(df)`;

    } else if (['institutional_holders', 'mutualfund_holders', 'major_holders', 'holders'].includes(node.category)) {
      pythonCode = `\
#  Fetch holders (${node.category}) 
ticker = "AAPL"

df = await yf_fetch(ticker, "${node.category}")
print(f"Holders ({node.category}):")
if hasattr(df, "head"):
    print(df.head(15))
else:
    print(df)`;

    } else if (node.category === 'earnings_dates' || node.category === 'earnings_history' || node.category === 'calendar') {
      pythonCode = `\
#  Fetch earnings dates and estimates 
ticker = "AAPL"

data = await yf_fetch(ticker, "${node.category}")

if hasattr(data, "head"):
    print(f"Earnings data: {len(data)} rows")
    print(data.head(12))
elif isinstance(data, dict):
    for k, v in data.items():
        print(f"{k}: {v}")`;

    } else if (node.category === 'sustainability') {
      pythonCode = `\
#  Fetch ESG sustainability scores 
ticker = "AAPL"

df = await yf_fetch(ticker, "sustainability")
if hasattr(df, "T"):
    print(df.T)
else:
    print(df)`;

    } else if (node.category === 'sec_filings') {
      pythonCode = `\
#  Fetch SEC filings list (10-K / 10-Q / 8-K) 
ticker = "AAPL"

filings = await yf_fetch(ticker, "sec_filings")
if isinstance(filings, list):
    for f in filings[:5]:
        print(f"[{f.get('date','')}] {f.get('type','')} - {f.get('title','')}")
else:
    print(filings)`;

    } else if (node.category === 'upgrades_downgrades') {
      pythonCode = `\
#  Fetch analyst upgrades/downgrades 
ticker = "AAPL"

df = await yf_fetch(ticker, "upgrades_downgrades")
print(f"Upgrades/Downgrades: {len(df)} records")
print(df.head(15))`;

    } else if (node.category === 'insider_transactions' || node.category === 'insider_purchases' || node.category === 'insider_roster_holders') {
      pythonCode = `\
#  Fetch insider transactions 
ticker = "AAPL"

df = await yf_fetch(ticker, "${node.category}")
if hasattr(df, "head"):
    print(f"Insider data: {len(df)} rows")
    print(df.head(15))
else:
    print(df)`;

    } else if (node.category.startsWith('funds_')) {
      pythonCode = `\
#  Fetch fund data (${node.name}) 
ticker = "SPY"   # Fund / ETF symbol

data = await yf_fetch(ticker, "${node.category}")
if hasattr(data, "head"):
    print(data.head(15))
elif isinstance(data, dict):
    for k, v in data.items():
        print(f"{k}: {v}")
else:
    print(data)`;

    } else if (node.category.startsWith('sector_')) {
      const subCat = node.category.replace('sector_', '');
      pythonCode = `\
#  Fetch Sector metrics 
key = "technology"

data = await yf_sector(key, "${subCat}")
print(f"Sector '{key}' - ${subCat}:")
if hasattr(data, "head"):
    print(data.head(15))
else:
    print(data)`;

    } else if (node.category.startsWith('industry_')) {
      const subCat = node.category.replace('industry_', '');
      pythonCode = `\
#  Fetch Industry metrics 
key = "software-infrastructure"

data = await yf_industry(key, "${subCat}")
print(f"Industry '{key}' - ${subCat}:")
if hasattr(data, "head"):
    print(data.head(15))
else:
    print(data)`;

    } else if (node.category === 'status' || node.category === 'summary') {
      pythonCode = `\
#  Fetch Market status / summary 
data = await yf_market("${node.category}", "us_market")
print(f"Market ${node.category}:")
if hasattr(data, "head"):
    print(data.head(15))
else:
    print(data)`;

    } else if (node.category === 'tickers') {
      pythonCode = `\
#  Fetch bulk Tickers data 
symbols = "AAPL MSFT GOOG"

data = await yf_tickers(symbols)
for sym, info in data.items():
    print(f"[{sym}] {info.get('shortName', sym)} - {info.get('sector', 'N/A')}")`;

    } else if (node.category === 'search') {
      pythonCode = `\
#  Search Yahoo Finance 
query = "apple"

res = await yf_search(query)
print(f"Search results for '{query}':")
print(f"Quotes found: {len(res.get('quotes', []))}")
for q in res.get("quotes", [])[:5]:
    print(f"  {q.get('symbol')} - {q.get('shortname')}")`;

    } else if (node.category === 'lookup') {
      pythonCode = `\
#  Symbol Lookup 
query = "apple"

data = await yf_lookup(query)
print(f"Lookup results for '{query}':")
if hasattr(data, "head"):
    print(data.head(15))
else:
    print(data)`;

    } else if (node.category === 'batch_download') {
      pythonCode = `\
#  Batch download multiple tickers at once 
import asyncio

tickers = ["AAPL", "MSFT", "GOOG", "AMZN", "TSLA"]

# Download each ticker sequentially (parallel calls via asyncio)
results = {}
for t in tickers:
    df = await yf_download(t, period="3mo", interval="1d")
    results[t] = df
    print(f"{t}: {len(df)} rows")

print("\\nAll tickers fetched!")
print("Closing prices (last 5 days):")
import pandas as pd
close_df = pd.DataFrame({t: results[t]["Close"] for t in tickers})
print(close_df.tail(5))`;

    } else {
      pythonCode = `\
#  Fetch ${node.name} 
ticker = "AAPL"

data = await yf_fetch(ticker, "${node.category}")

if hasattr(data, "head"):
    print(f"Shape: {data.shape}")
    print(data.head(10))
elif isinstance(data, dict):
    for k, v in list(data.items())[:12]:
        print(f"{k}: {v}")
elif isinstance(data, list):
    print(f"List of {len(data)} items")
    for item in data[:5]:
        print(item)
else:
    print(data)`;
    }
  } else {
    pythonCode = `\
#  Fetch macroeconomic time series from FRED 
import pandas as pd

series_id = "${node.series_id}"

raw = await fred_download(series_id, limit=200)
print(f"Series  : {raw['title']}")
print(f"Units   : {raw['units']} | Freq: {raw['frequency']}")

df = pd.DataFrame(raw["observations"])
df["date"]  = pd.to_datetime(df["date"])
df["value"] = pd.to_numeric(df["value"], errors="coerce")
df = df.set_index("date").dropna()

print(f"\\nLatest 15 observations:")
print(df.tail(15))`;
  }

  const highlightedCode = highlightSyntax(pythonCode);

  const card = document.createElement('div');
  card.className = 'dex-preview-card';
  card.innerHTML = `
    <div class="dex-preview-name">
      <span class="dex-preview-icon ${iconClass}">${iconText}</span>
      <span>${node.name}</span>
    </div>
    <div class="dex-preview-desc">
      ${node.desc}
    </div>
    <div class="dex-preview-meta">
      <span class="dex-meta-tag live">LIVE</span>
      <span class="dex-meta-tag api">${sourceName}</span>
    </div>
    <div style="font-size: 11px; margin-top: 14px; margin-bottom: 6px; color: var(--text-muted); font-weight: 500;">PYTHON CODE</div>
    <pre class="dex-code-preview"><code>${highlightedCode}</code></pre>
    <button class="dex-load-btn" id="dexLoadBtn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px;"><polyline points="9 18 15 12 9 6"/></svg>
      Load and Run Dataset
    </button>
  `;

  previewPane.appendChild(card);

  const loadBtn = card.querySelector('#dexLoadBtn');
  loadBtn.addEventListener('click', () => {
    if (monacoEditor) {
      monacoEditor.setValue(pythonCode);
      closeDataExplorer();
      monacoEditor.focus();
      triggerRun();
    }
  });
}

function highlightSyntax(code) {
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(#.*)/g, '<span class="dex-code-comment">$1</span>')
    .replace(/\b(import|as|await|from)\b/g, '<span class="dex-code-kw">$1</span>')
    .replace(/(".*?"|'.*?')/g, '<span class="dex-code-str">$1</span>')
    .replace(/\b(print|yf_download|fred_download|yf_info|yf_dividends|yf_splits|yf_actions|yf_financials|yf_balance_sheet|yf_cashflow|yf_recommendations|yf_holders|yf_options|yf_option_chain|yf_news|yf_fetch)\b/g, '<span class="dex-code-fn">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="dex-code-num">$1</span>');
}

//  Fullscreen toggle 
const workspaceEl = document.querySelector('.workspace');
const fsEditorBtn = document.getElementById('fsEditorBtn');
const fsOutputBtn = document.getElementById('fsOutputBtn');
const fsAIBtn     = document.getElementById('fsAIBtn');
const paneEditor  = document.querySelector('.pane-editor');
const paneOutput  = document.querySelector('.pane-output');
const paneAI      = document.getElementById('paneAI');

function exitFullscreen() {
  if (workspaceEl && workspaceEl.classList.contains('has-fullscreen')) {
    workspaceEl.classList.remove('has-fullscreen');
    document.querySelectorAll('.pane-fullscreen').forEach(p => p.classList.remove('pane-fullscreen'));
    if (monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
  }
}

function toggleFullscreen(pane) {
  if (!workspaceEl || !pane) return;
  const isCurrentlyFullscreen = pane.classList.contains('pane-fullscreen');
  exitFullscreen();
  if (!isCurrentlyFullscreen) {
    workspaceEl.classList.add('has-fullscreen');
    pane.classList.add('pane-fullscreen');
  }
  if (monacoEditor) {
    setTimeout(() => monacoEditor.layout(), 50);
  }
}

if (fsEditorBtn && paneEditor) {
  fsEditorBtn.addEventListener('click', () => toggleFullscreen(paneEditor));
}
if (fsOutputBtn && paneOutput) {
  fsOutputBtn.addEventListener('click', () => toggleFullscreen(paneOutput));
}
if (fsAIBtn && paneAI) {
  fsAIBtn.addEventListener('click', () => toggleFullscreen(paneAI));
}

//  Global keyboard shortcuts 
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); downloadOutput(); }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); btnReset.click(); }
});

//  Resize handle 
(function initResize() {
  const handle     = document.getElementById('resizeHandle');
  const workspace  = document.querySelector('.workspace');
  const editorPane = document.querySelector('.pane-editor');
  const outputPane = document.querySelector('.pane-output');
  if (!handle || !workspace || !editorPane || !outputPane) return;
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
    const delta = e.clientX - startX;
    const newW  = Math.min(Math.max(startW + delta, 220), totalW - 220);
    editorPane.style.flex = `0 0 ${(newW / totalW * 100).toFixed(2)}%`;
    outputPane.style.flex = '1 1 0';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 50 : 20;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dir  = e.key === 'ArrowLeft' ? -step : step;
    const curW = editorPane.getBoundingClientRect().width;
    const tot  = workspace.getBoundingClientRect().width - handle.offsetWidth;
    const newW = Math.min(Math.max(curW + dir, 220), tot - 220);
    editorPane.style.flex = `0 0 ${(newW / tot * 100).toFixed(2)}%`;
    outputPane.style.flex = '1 1 0';
  });
})();

//  Horizontal resize handle (workspace | bottom data explorer) 
(function initResizeH() {
  const handle = document.getElementById('resizeHandleH');
  const outer  = document.getElementById('workspaceOuter');
  const panel  = document.getElementById('dexPanel');
  if (!handle || !outer || !panel) return;
  let dragging = false, startY = 0, startH = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startY   = e.clientY;
    startH   = panel.getBoundingClientRect().height;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    // Dragging up = increase panel height
    const delta  = startY - e.clientY;
    const outerH = outer.getBoundingClientRect().height;
    const newH   = Math.min(Math.max(startH + delta, 160), outerH - 120);
    panel.style.height = newH + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 15;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const dir  = e.key === 'ArrowUp' ? step : -step;
    const curH = panel.getBoundingClientRect().height;
    const outH = outer.getBoundingClientRect().height;
    panel.style.height = Math.min(Math.max(curH + dir, 160), outH - 120) + 'px';
  });
})();

//  Vertical resize handle for AI assistant pane 
(function initResizeAI() {
  const handle     = document.getElementById('resizeHandleAI');
  const workspace  = document.querySelector('.workspace');
  const paneAI     = document.getElementById('paneAI');
  if (!handle || !workspace || !paneAI) return;
  let dragging = false, startX = 0, startW = 0, totalW = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX   = e.clientX;
    startW   = paneAI.getBoundingClientRect().width;
    totalW   = workspace.getBoundingClientRect().width;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = startX - e.clientX; // dragging left = increase width
    const newW  = Math.min(Math.max(startW + delta, 300), 500);
    paneAI.style.width = newW + 'px';
    paneAI.style.flex = `0 0 ${newW}px`;
    if (monacoEditor) setTimeout(() => monacoEditor.layout(), 10);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    if (monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
  });
})();

//  AI Coding Assistant chat logic 
(function initAIAssistant() {
  const btnAI = document.getElementById('btnAI');
  const closeAIBtn = document.getElementById('closeAIBtn');
  const paneAI = document.getElementById('paneAI');
  const handleAI = document.getElementById('resizeHandleAI');
  const aiModelSelect = document.getElementById('aiModelSelect');
  const aiMessages = document.getElementById('aiMessages');
  const aiTextarea = document.getElementById('aiTextarea');
  const aiSendBtn = document.getElementById('aiSendBtn');
  //  AI Working State & Abort Controller 
  let activeAbortController = null;

  function setAIWorking(isWorking) {
    if (!aiSendBtn) return;
    if (isWorking) {
      aiSendBtn.classList.add('is-working');
      aiSendBtn.title = 'AI is working Click to stop';
      aiSendBtn.setAttribute('aria-label', 'Stop AI');
    } else {
      aiSendBtn.classList.remove('is-working');
      aiSendBtn.title = 'Send (Enter)';
      aiSendBtn.setAttribute('aria-label', 'Send');
    }
  }

  function stopAIAndLoop() {
    if (activeAbortController) {
      try { activeAbortController.abort(); } catch (_) {}
      activeAbortController = null;
    }
    if (window.activeAutonomousLoop && window.activeAutonomousLoop.isActive) {
      window.activeAutonomousLoop.abort();
    }
    setAIWorking(false);
  }

  //  Parse surgical edit blocks from markdown or raw text 
  function parseSurgicalEdits(text) {
    if (!text) return [];
    const edits = [];
    const regex = /<<<SURGICAL_EDIT>>>[\s\r\n]*<<<FIND>>>([\s\S]*?)<<<REPLACE>>>([\s\S]*?)<<<END_EDIT>>>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const findText = match[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      const replaceText = match[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      if (findText.trim()) {
        edits.push({ findText, replaceText });
      }
    }
    return edits;
  }
  window.parseSurgicalEdits = parseSurgicalEdits;

  //  Programmatically apply surgical edit to Monaco Editor 
  function applySurgicalEditToMonaco(findText, replaceText) {
    if (!monacoEditor) return false;
    const model = monacoEditor.getModel();
    if (!model) return false;

    // 1. Try exact match
    let matches = model.findMatches(findText, true, false, true, null, true);

    // 2. Try trimmed match if exact match fails
    if (!matches || matches.length === 0) {
      const trimmed = findText.trim();
      if (trimmed) {
        matches = model.findMatches(trimmed, false, false, false, null, true);
      }
    }

    // 3. Try matching individual lines if multi-line block
    if ((!matches || matches.length === 0) && findText.includes('\n')) {
      const lines = findText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        const lineMatches = model.findMatches(lines[0], false, false, false, null, true);
        if (lineMatches && lineMatches.length > 0) {
          matches = [lineMatches[0]];
        }
      }
    }

    if (matches && matches.length > 0) {
      const targetRange = matches[0].range;
      monacoEditor.executeEdits('ai-strong-loop', [{
        range: targetRange,
        text: replaceText,
        forceMoveMarkers: true
      }]);

      // Flash green applied decoration
      const decos = monacoEditor.deltaDecorations([], [{
        range: targetRange,
        options: {
          isWholeLine: true,
          className: 'monaco-applied-edit-line'
        }
      }]);
      setTimeout(() => {
        try { monacoEditor.deltaDecorations(decos, []); } catch (_) {}
      }, 2500);

      return true;
    }

    return false;
  }

  //  Autonomous AI Self-Healing Execution Loop Class 
  class AutonomousRepairLoop {
    constructor(options = {}) {
      this.maxIterations = options.maxIterations || 3;
      this.model = options.model || (aiModelSelect ? aiModelSelect.value : DEFAULT_MODEL);
      this.chatContainer = options.chatContainer || aiMessages;
      this.isActive = false;
      this.isAborted = false;
      this.immutableUserGoal = '';
      this.currentIteration = 1;
      this.cardEl = null;
      this.stepsEl = null;
      this.badgeEl = null;
      this.statusTextEl = null;
      this.stopBtn = null;
    }

    createCard() {
      const card = document.createElement('div');
      card.className = 'ai-loop-card';

      const header = document.createElement('div');
      header.className = 'ai-loop-header';

      const left = document.createElement('div');
      left.className = 'ai-loop-header-left';

      this.badgeEl = document.createElement('span');
      this.badgeEl.className = 'ai-loop-badge running';
      this.badgeEl.textContent = 'AUTO-HEAL';

      this.statusTextEl = document.createElement('span');
      this.statusTextEl.className = 'ai-loop-status-text';
      this.statusTextEl.textContent = 'Active Control: Testing & verifying in Pyodide';

      left.appendChild(this.badgeEl);
      left.appendChild(this.statusTextEl);

      this.stopBtn = document.createElement('button');
      this.stopBtn.className = 'ai-loop-stop-btn';
      this.stopBtn.textContent = 'Stop Loop';
      this.stopBtn.addEventListener('click', () => this.abort());

      header.appendChild(left);
      header.appendChild(this.stopBtn);

      this.stepsEl = document.createElement('div');
      this.stepsEl.className = 'ai-loop-body';

      card.appendChild(header);
      card.appendChild(this.stepsEl);

      this.cardEl = card;
      if (this.chatContainer) {
        this.chatContainer.appendChild(card);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    addStep(icon, text, type = 'normal', snippet = null) {
      if (!this.stepsEl) return;
      const step = document.createElement('div');
      step.className = `ai-loop-step ${type}`;

      const iconEl = document.createElement('span');
      iconEl.className = 'ai-loop-step-icon';
      iconEl.textContent = icon;

      const textEl = document.createElement('span');
      textEl.innerHTML = text;

      step.appendChild(iconEl);
      step.appendChild(textEl);
      this.stepsEl.appendChild(step);

      if (snippet) {
        const snippetEl = document.createElement('div');
        snippetEl.className = 'ai-loop-error-snippet';
        snippetEl.textContent = snippet;
        this.stepsEl.appendChild(snippetEl);
      }

      if (this.chatContainer) {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    addSummary(text) {
      if (!this.stepsEl) return;
      const sum = document.createElement('div');
      sum.className = 'ai-loop-summary';
      sum.innerHTML = `<span>[DONE]</span><span>${text}</span>`;
      this.stepsEl.appendChild(sum);
      if (this.chatContainer) {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    setEditorActive(active) {
      const badge = document.getElementById('aiEditorControlBadge');
      if (badge) {
        if (active) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
      }
      const editorPane = document.querySelector('.pane-editor');
      if (editorPane) {
        if (active) editorPane.classList.add('ai-active-editor');
        else editorPane.classList.remove('ai-active-editor');
      }
    }

    applyCodeOrEdit(text) {
      if (!text) return { applied: false, type: 'none' };

      // 1. Try surgical edit first
      const surgicalEdits = parseSurgicalEdits(text);
      if (surgicalEdits.length > 0) {
        let appliedCount = 0;
        for (const edit of surgicalEdits) {
          if (applySurgicalEditToMonaco(edit.findText, edit.replaceText)) {
            appliedCount++;
          }
        }
        if (appliedCount > 0) {
          return { applied: true, type: 'surgical', count: appliedCount };
        }
      }

      // 2. Try full python block
      const pyMatch = text.match(/```python([\s\S]*?)```/);
      if (pyMatch && pyMatch[1]) {
        const code = pyMatch[1].trim();
        if (monacoEditor) {
          monacoEditor.setValue(code);
          return { applied: true, type: 'full', code };
        }
      }

      return { applied: false, type: 'none' };
    }

    async requestRepair(errorMsg, errorType, errorLine, stdout, stderr) {
      const currentCode = monacoEditor ? monacoEditor.getValue() : '';
      const prompt = `[IMMUTABLE USER GOAL]
${this.immutableUserGoal}

[CURRENT EDITOR CODE]
\`\`\`python
${currentCode}
\`\`\`

[RUNTIME ERROR TRACEBACK - RUN #${this.currentIteration}]
Error Type: ${errorType || 'RuntimeError'}${errorLine ? ` (Line ${errorLine})` : ''}
Full Traceback & Stderr:
${errorMsg || stderr || 'Execution error encountered'}

[CONSOLE STDOUT BEFORE FAILURE]
${stdout || '(no output)'}

[INSTRUCTION]
Perform an exact, deterministic surgical fix to eliminate this error while fully preserving the user's intent, helper functions, and imports.
Respond with the surgical replacement using this exact format:
<<<SURGICAL_EDIT>>>
<<<FIND>>>
<exact lines currently in code to replace>
<<<REPLACE>>>
<corrected lines>
<<<END_EDIT>>>

If extensive structural changes are required, output the complete corrected \`\`\`python ... \`\`\` script instead.`;

      this.currentAbortController = new AbortController();
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this.currentAbortController.signal,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are an authoritative Python self-healing repair engineer in RUN01. Synthesize minimal surgical edits targeting only broken lines to guarantee clean execution with 0 errors.' },
            { role: 'user', content: prompt }
          ],
          model: this.model,
          context: 'editor'
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `AI repair request failed with code ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let repairResponse = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const rawJson = trimmed.substring(6);
              const parsed = JSON.parse(rawJson);
              const token = parsed.choices?.[0]?.delta?.content || '';
              repairResponse += token;
            } catch (_) {}
          }
        }
      }

      return repairResponse;
    }

    async start(userGoal, initialAssistantResponse) {
      this.isActive = true;
      this.isAborted = false;
      this.immutableUserGoal = userGoal;
      this.currentIteration = 1;

      this.createCard();
      this.setEditorActive(true);
      setAIWorking(true);

      // Apply initial response to Monaco editor
      const initialApply = this.applyCodeOrEdit(initialAssistantResponse);
      if (initialApply.applied) {
        if (initialApply.type === 'surgical') {
          this.addStep('[FIX]', `Applied ${initialApply.count} surgical patch(es) to Monaco editor.`, 'active');
        } else {
          this.addStep('[CODE]', 'Injected initial Python program into Monaco editor.', 'active');
        }
      } else {
        this.addStep('[INFO]', 'Reading active Monaco editor code for verification', 'active');
      }

      // Loop execution and self-healing
      while (this.isActive && !this.isAborted) {
        if (this.statusTextEl) {
          this.statusTextEl.textContent = `Attempt ${this.currentIteration}/${this.maxIterations}: Executing in Pyodide WASM`;
        }

        this.addStep('[COMPILE]', `Executing in Pyodide WASM (Attempt #${this.currentIteration})`, 'active');

        // Small yield so Monaco editor finishes updating and UI renders
        await new Promise(r => setTimeout(r, 80));

        // Execute in Pyodide WASM and wait for completion
        const result = await window.executeAndVerifyCode();

        if (this.isAborted) {
          this.cleanup();
          return;
        }

        // Clean execution with zero errors!
        if (result.success) {
          this.badgeEl.className = 'ai-loop-badge';
          this.badgeEl.textContent = '[DONE] 0 ERRORS';
          if (this.statusTextEl) {
            this.statusTextEl.textContent = `Clean Execution (0 Errors in ${result.elapsed}s)`;
          }
          if (this.stopBtn) this.stopBtn.style.display = 'none';

          this.addStep('[DONE]', `Run #${this.currentIteration} completed cleanly with 0 errors in ${result.elapsed}s.`, 'success');
          this.addSummary(`Autonomous Self-Healing Loop verified complete. Zero errors. Context fully preserved.`);
          this.cleanup();
          return;
        }

        // Error detected!
        const errType = result.errorType || 'RuntimeError';
        const errLine = result.errorLine;
        const lineText = errLine ? ` (Line ${errLine})` : '';

        this.addStep('[WARN]', `Error detected in Run #${this.currentIteration}: <strong>${errType}</strong>${lineText}`, 'warning', result.error || result.stderr);

        // Check if max iterations reached
        if (this.currentIteration >= this.maxIterations) {
          this.badgeEl.className = 'ai-loop-badge error';
          this.badgeEl.textContent = 'MAX ATTEMPTS';
          if (this.statusTextEl) {
            this.statusTextEl.textContent = `Halted after ${this.maxIterations} attempts`;
          }
          if (this.stopBtn) this.stopBtn.style.display = 'none';

          this.addStep('[STOP]', `Maximum repair attempts (${this.maxIterations}) reached. Editor contains latest state for manual inspection.`, 'warning');
          this.cleanup();
          return;
        }

        // Synthesize surgical repair
        this.badgeEl.className = 'ai-loop-badge healing';
        this.badgeEl.textContent = 'HEALING';
        if (this.statusTextEl) {
          this.statusTextEl.textContent = `Attempt ${this.currentIteration + 1}/${this.maxIterations}: Synthesizing surgical fix`;
        }

        this.addStep('[FIX]', `AI analyzing error and synthesizing surgical fix`, 'active');

        let repairResponse = '';
        try {
          repairResponse = await this.requestRepair(result.error, errType, errLine, result.stdout, result.stderr);
        } catch (repairErr) {
          if (this.isAborted) {
            this.cleanup();
            return;
          }
          this.addStep('[ERROR]', `AI repair request failed: ${repairErr.message}`, 'warning');
          this.cleanup();
          return;
        }

        if (this.isAborted) {
          this.cleanup();
          return;
        }

        // Apply the surgical fix to Monaco
        const repairApply = this.applyCodeOrEdit(repairResponse);
        if (repairApply.applied) {
          if (repairApply.type === 'surgical') {
            this.addStep('[DONE]', `Applied surgical patch to target lines in Monaco editor.`, 'active');
          } else {
            this.addStep('[DONE]', `Updated Monaco editor with structurally repaired code.`, 'active');
          }
        } else {
          this.addStep('[WARN]', `Could not find exact lines to replace. Attempting full re-run`, 'warning');
        }

        this.currentIteration++;
      }

      this.cleanup();
    }

    abort() {
      this.isAborted = true;
      if (this.currentAbortController) {
        try { this.currentAbortController.abort(); } catch (_) {}
        this.currentAbortController = null;
      }
      if (this.badgeEl) {
        this.badgeEl.className = 'ai-loop-badge error';
        this.badgeEl.textContent = 'STOPPED';
      }
      if (this.statusTextEl) {
        this.statusTextEl.textContent = 'Auto-Heal Stopped by User';
      }
      if (this.stopBtn) this.stopBtn.style.display = 'none';
      this.addStep('[STOP]', 'Loop aborted by user.', 'warning');
      this.cleanup();
    }

    cleanup() {
      this.isActive = false;
      this.setEditorActive(false);
      setAIWorking(false);
    }
  }
  window.AutonomousRepairLoop = AutonomousRepairLoop;

  let messagesHistory = [];

    // Curated model catalog - NVIDIA NIM & Groq production IDs (Oct 2026)
    // ★ = completely free with high daily/minute limits on the free tier
  const MODEL_CATALOG = [
    // ── NVIDIA NIM ──────────────────────────────────────────────────────────
    { id: 'deepseek-ai/deepseek-v4.1-flash',           name: 'NVIDIA - DeepSeek V4.1 Flash',            provider: 'NVIDIA NIM' },
    { id: 'deepseek-ai/deepseek-r1',                  name: 'NVIDIA - DeepSeek R1 (Reasoning)',        provider: 'NVIDIA NIM' },
    { id: 'meta/llama-4-maverick-17b-128e-instruct',  name: 'NVIDIA - Llama 4 Maverick 17Bx128E',     provider: 'NVIDIA NIM' },
    { id: 'meta/llama-4-scout-17b-16e-instruct',      name: 'NVIDIA - Llama 4 Scout 17Bx16E',         provider: 'NVIDIA NIM' },
    { id: 'meta/llama-3.3-70b-instruct',              name: 'NVIDIA - Llama 3.3 70B Instruct',        provider: 'NVIDIA NIM' },
    { id: 'qwen/qwen3-32b',                           name: 'NVIDIA - Qwen3 32B ★ FREE',              provider: 'NVIDIA NIM' },
    { id: 'moonshotai/kimi-k2',                       name: 'NVIDIA - Kimi K2 1T MoE ★ FREE',         provider: 'NVIDIA NIM' },
    { id: 'microsoft/phi-4-mini-instruct',            name: 'NVIDIA - Phi-4 Mini ★ FREE fast',        provider: 'NVIDIA NIM' },
    { id: 'nvidia/nemotron-3.5-lightning-30b-a3b',     name: 'NVIDIA - Nemotron 3.5 Lightning',        provider: 'NVIDIA NIM' },
    // ── Groq ────────────────────────────────────────────────────────────────
    { id: 'openai/gpt-oss-120b',                      name: 'Groq - GPT-OSS 120B (~500 tok/s)',       provider: 'Groq' },
    { id: 'openai/gpt-oss-20b',                       name: 'Groq - GPT-OSS 20B',                    provider: 'Groq' },
    { id: 'groq/compound',                            name: 'Groq - Compound',                       provider: 'Groq' },
    { id: 'groq/compound-mini',                       name: 'Groq - Compound Mini',                  provider: 'Groq' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct',name: 'Groq - Llama 4 Scout 17B ★ FREE fast',  provider: 'Groq' },
    { id: 'llama-3.3-70b-versatile',                  name: 'Groq - Llama 3.3 70B ★ FREE',           provider: 'Groq' },
    { id: 'deepseek-r1-distill-llama-70b',            name: 'Groq - DeepSeek R1 Distill 70B ★ FREE', provider: 'Groq' },
    { id: 'llama-3.1-8b-instant',                     name: 'Groq - Llama 3.1 8B ★ FREE ~560tok/s',  provider: 'Groq' },
  ];

  // Default model - DeepSeek V4.1 Flash on NVIDIA NIM: 284B MoE, 1M context
  const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4.1-flash';

  // Pre-seed dropdown immediately (grouped by provider via <optgroup>) so
  // there is always a valid selection even before /api/ai/models responds.
  function seedModelSelect(models) {
    aiModelSelect.innerHTML = '';
    const groups = {};
    const order = [];
    models.forEach(m => {
      const groupName = m.provider || 'Other';
      if (!groups[groupName]) {
        groups[groupName] = document.createElement('optgroup');
        groups[groupName].label = groupName;
        order.push(groupName);
      }
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      groups[groupName].appendChild(opt);
    });
    order.forEach(g => aiModelSelect.appendChild(groups[g]));
    const hasDefault = models.some(m => m.id === DEFAULT_MODEL);
    aiModelSelect.value = hasDefault ? DEFAULT_MODEL : (models[0] ? models[0].id : '');
  }
  seedModelSelect(MODEL_CATALOG);

  // Also try to load fresh list from API (updates names/order if server changes)
  async function loadModels() {
    try {
      const resp = await fetch('/api/ai/models');
      if (!resp.ok) return;
      const models = await resp.json();
      if (Array.isArray(models) && models.length > 0) {
        const prev = aiModelSelect.value;
        seedModelSelect(models);
        // Restore previous selection if still available
        if ([...aiModelSelect.options].some(o => o.value === prev)) {
          aiModelSelect.value = prev;
        }
      }
    } catch (err) {
      console.error('Failed to refresh AI models:', err);
      // Static fallback already seeded - no action needed
    }
  }
  loadModels();

  // Helper to toggle AI panel visibility
  function toggleAIPanel() {
    const isHidden = paneAI.style.display === 'none';
    if (isHidden) {
      paneAI.style.display = 'flex';
      handleAI.style.display = 'block';
      btnAI.classList.add('active');
      aiTextarea.focus();
    } else {
      // Always exit fullscreen mode before hiding AI pane
      exitFullscreen();
      paneAI.style.display = 'none';
      handleAI.style.display = 'none';
      btnAI.classList.remove('active');
    }
    if (monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
  }

  btnAI.addEventListener('click', toggleAIPanel);
  closeAIBtn.addEventListener('click', toggleAIPanel);

  // Keyboard shortcut Ctrl+K to toggle AI panel
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggleAIPanel();
    }
  });

  // Handle auto-adjusting textarea height
  aiTextarea.addEventListener('input', () => {
    aiTextarea.style.height = 'auto';
    aiTextarea.style.height = Math.min(aiTextarea.scrollHeight, 120) + 'px';
  });

  // Handle Enter to send message (Shift+Enter for newline)
  aiTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendUserMessage();
    }
  });

  aiSendBtn.addEventListener('click', () => {
    if (aiSendBtn.classList.contains('is-working')) {
      stopAIAndLoop();
    } else {
      sendUserMessage();
    }
  });

  function appendMessage(role, text, isError = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ai-msg-${role} ${isError ? 'ai-msg-error' : ''}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';
    
    if (role === 'assistant') {
      renderMarkdown(bubble, text);
    } else {
      bubble.textContent = text;
    }
    
    msgDiv.appendChild(bubble);
    aiMessages.appendChild(msgDiv);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    return bubble;
  }

  function appendLoadingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-msg ai-msg-assistant';
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';
    
    const indicator = document.createElement('div');
    indicator.className = 'ai-typing-indicator';
    indicator.innerHTML = '<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>';
    
    bubble.appendChild(indicator);
    msgDiv.appendChild(bubble);
    aiMessages.appendChild(msgDiv);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    return msgDiv;
  }

  function renderMarkdown(element, text) {
    // Split on code fences, desmos blocks, openscad/cad blocks, python blocks, AND surgical edit blocks
    const parts = text.split(/(```desmos[\s\S]*?```|```openscad[\s\S]*?```|```scad[\s\S]*?```|```python[\s\S]*?```|```[\s\S]*?```|<<<SURGICAL_EDIT>>>[\s\S]*?<<<END_EDIT>>>)/g);
    element.innerHTML = '';
    parts.forEach(part => {
      //  Surgical edit diff block 
      if (part.startsWith('<<<SURGICAL_EDIT>>>')) {
        const findMatch  = part.match(/<<<FIND>>>([\s\S]*?)<<<REPLACE>>>/);
        const replMatch  = part.match(/<<<REPLACE>>>([\s\S]*?)<<<END_EDIT>>>/);
        if (!findMatch || !replMatch) return;
        const findText  = findMatch[1].trim();
        const replText  = replMatch[1].trim();

        const diffCard = document.createElement('div');
        diffCard.className = 'ai-diff-card';

        const diffHeader = document.createElement('div');
        diffHeader.className = 'ai-diff-header';
        diffHeader.innerHTML = '<span class="ai-diff-title">&#9998; Surgical Edit</span>';

        const diffActions = document.createElement('div');
        diffActions.className = 'ai-diff-actions';

        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'ai-diff-btn ai-diff-accept';
        acceptBtn.textContent = '[DONE] Accept';

        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'ai-diff-btn ai-diff-reject';
        rejectBtn.textContent = ' Reject';

        diffActions.appendChild(acceptBtn);
        diffActions.appendChild(rejectBtn);
        diffHeader.appendChild(diffActions);
        diffCard.appendChild(diffHeader);

        // Visual diff lines
        const diffBody = document.createElement('div');
        diffBody.className = 'ai-diff-body';
        findText.split('\n').forEach(l => {
          const row = document.createElement('div');
          row.className = 'ai-diff-line ai-diff-remove';
          row.textContent = ' ' + l;
          diffBody.appendChild(row);
        });
        replText.split('\n').forEach(l => {
          const row = document.createElement('div');
          row.className = 'ai-diff-line ai-diff-add';
          row.textContent = '+ ' + l;
          diffBody.appendChild(row);
        });
        diffCard.appendChild(diffBody);
        element.appendChild(diffCard);

        // Highlight the target lines in Monaco immediately
        let pendingDecorations = [];
        if (monacoEditor) {
          const model = monacoEditor.getModel();
          if (model) {
            const matches = model.findMatches(findText, true, false, true, null, true);
            if (matches.length > 0) {
              pendingDecorations = monacoEditor.deltaDecorations([], matches.map(m => ({
                range: m.range,
                options: {
                  isWholeLine: false,
                  className: 'monaco-pending-edit-line',
                  glyphMarginClassName: 'monaco-pending-edit-glyph',
                  overviewRuler: { color: 'rgba(255,202,40,0.6)', position: 1 }
                }
              })));
            }
          }
        }

        // Accept: apply the surgical replacement
        acceptBtn.addEventListener('click', () => {
          if (monacoEditor) {
            applySurgicalEditToMonaco(findText, replText);
            monacoEditor.deltaDecorations(pendingDecorations, []);
          }
          diffCard.classList.add('ai-diff-accepted');
          acceptBtn.textContent = '[DONE] Applied';
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;

          if (window.activeAutonomousLoop && window.activeAutonomousLoop.isActive) {
            window.activeAutonomousLoop.abort();
          }
          window.activeAutonomousLoop = new AutonomousRepairLoop({
            maxIterations: 3,
            model: aiModelSelect ? aiModelSelect.value : DEFAULT_MODEL,
            chatContainer: aiMessages
          });
          window.activeAutonomousLoop.start('Verify clean execution after surgical edit', part);
        });

        // Reject: clear decorations
        rejectBtn.addEventListener('click', () => {
          if (monacoEditor) monacoEditor.deltaDecorations(pendingDecorations, []);
          diffCard.classList.add('ai-diff-rejected');
          acceptBtn.disabled = true;
          rejectBtn.textContent = ' Rejected';
          rejectBtn.disabled = true;
        });

        return;
      }

      //  OpenSCAD 3D CAD block  show as code, offer to open CAD studio 
      if (part.startsWith('```openscad') || part.startsWith('```scad')) {
        const scadCode = part.replace(/^```(openscad|scad)\n?/, '').replace(/\n?```$/, '').trim();
        const card = document.createElement('div');
        card.className = 'cad-chat-card';

        const header = document.createElement('div');
        header.className = 'cad-chat-header';
        header.innerHTML = `
          <span><span class="cad-badge">OPENSCAD WASM</span> Parametric 3D CAD Model</span>
          <span style="color:#34d399; font-size:10.5px; font-weight:700;">[DONE] CSG GEOMETRY</span>
        `;

        const pre = document.createElement('pre');
        pre.className = 'cad-chat-code-preview';
        pre.textContent = scadCode;

        const footer = document.createElement('div');
        footer.className = 'cad-chat-footer';

        const openStudioBtn = document.createElement('button');
        openStudioBtn.className = 'ai-code-btn';
        openStudioBtn.style.color = '#34d399';
        openStudioBtn.style.fontWeight = 'bold';
        openStudioBtn.textContent = ' Open in CAD Studio';
        openStudioBtn.addEventListener('click', () => {
          if (window.btnCAD) window.btnCAD.click();
          if (window.cadSourceEditorEl) {
            window.cadSourceEditorEl.value = scadCode;
            const btnRun = document.getElementById('btnCadRunSource');
            if (btnRun) setTimeout(() => btnRun.click(), 100);
          }
        });

        const copyBtn = document.createElement('button');
        copyBtn.className = 'ai-code-btn';
        copyBtn.textContent = 'Copy SCAD';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(scadCode);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'Copy SCAD', 2000);
        });

        footer.appendChild(openStudioBtn);
        footer.appendChild(copyBtn);

        card.appendChild(header);
        card.appendChild(pre);
        card.appendChild(footer);
        element.appendChild(card);
        return;
      }

      //  Desmos math graph & simulation block 
      if (part.startsWith('```desmos')) {
        const desmosCode = part.replace(/^```desmos\n?/, '').replace(/\n?```$/, '').trim();
        const container = document.createElement('div');
        container.className = 'desmos-chat-card';

        const lines = desmosCode.split('\n')
          .map(l => cleanDesmosLatex(l))
          .filter(Boolean);

        const header = document.createElement('div');
        header.className = 'desmos-chat-header';

        const titleSpan = document.createElement('span');
        titleSpan.innerHTML = '<span class="desmos-badge">DESMOS</span> Interactive Simulation';

        const openPanelBtn = document.createElement('button');
        openPanelBtn.className = 'ai-code-btn';
        openPanelBtn.style.color = '#38bdf8';
        openPanelBtn.style.fontWeight = 'bold';
        openPanelBtn.innerHTML = 'Open in Desmos Panel';
        openPanelBtn.addEventListener('click', () => {
          window.loadIntoDesmosPanel(lines, 'AI Math Simulation');
        });

        header.appendChild(titleSpan);
        header.appendChild(openPanelBtn);

        const calcEl = document.createElement('div');
        calcEl.className = 'desmos-chat-container';
        calcEl.id = 'desmos_chat_' + Math.random().toString(36).substr(2, 9);

        container.appendChild(header);
        container.appendChild(calcEl);
        element.appendChild(container);

        setTimeout(() => {
          if (window.Desmos) {
            const calculator = Desmos.GraphingCalculator(calcEl, {
              expressions: true,
              keypad: false,
              settingsMenu: false,
              zoomButtons: true
            });
            lines.forEach((line, idx) => {
              calculator.setExpression({ id: 'chat_expr_' + idx, latex: line });
            });
          }
        }, 150);
        return;
      }

      //  Python / generic code block 
      if (part.startsWith('```')) {
        const isPython = part.startsWith('```python');
        const codeLines = part.replace(/^```(python)?\n/, '').replace(/\n```$/, '');
        
        const container = document.createElement('div');
        container.className = 'ai-code-block-container';
        
        const header = document.createElement('div');
        header.className = 'ai-code-block-header';
        header.innerHTML = `<span>${isPython ? 'python' : 'code'}</span>`;
        
        const actions = document.createElement('div');
        actions.className = 'ai-code-block-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ai-code-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(codeLines);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'Copy', 2000);
        });
        actions.appendChild(copyBtn);
        
        if (isPython) {
          const runBtn = document.createElement('button');
          runBtn.className = 'ai-code-btn';
          runBtn.textContent = ' Run';
          runBtn.style.color = '#4ade80';
          runBtn.style.fontWeight = 'bold';
          runBtn.addEventListener('click', () => {
            if (monacoEditor) {
              monacoEditor.setValue(codeLines);
              runBtn.textContent = 'Running...';
              if (window.activeAutonomousLoop && window.activeAutonomousLoop.isActive) {
                window.activeAutonomousLoop.abort();
              }
              window.activeAutonomousLoop = new AutonomousRepairLoop({
                maxIterations: 3,
                model: aiModelSelect ? aiModelSelect.value : DEFAULT_MODEL,
                chatContainer: aiMessages
              });
              window.activeAutonomousLoop.start('Run and verify python program', '```python\n' + codeLines + '\n```');
              setTimeout(() => runBtn.textContent = ' Run', 2000);
            }
          });
          actions.appendChild(runBtn);
        }
        
        header.appendChild(actions);
        container.appendChild(header);
        
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = codeLines;
        pre.appendChild(code);
        container.appendChild(pre);
        element.appendChild(container);
      } else if (part.trim() !== '') {
        //  Self-contained Markdown renderer 
        const mdWrapper = document.createElement('div');
        mdWrapper.className = 'ai-md-body';
        mdWrapper.innerHTML = parseMarkdown(part);
        element.appendChild(mdWrapper);
      }
    });
  }

  //  parseMarkdown 
  // Zero-dependency Markdown  HTML converter.
  // Handles: headings, tables (GFM), bold, italic, inline code,
  //          blockquotes, unordered/ordered lists, horizontal rules, paragraphs.
  function parseMarkdown(md) {

    // inline(rawText): escape HTML then apply bold/italic/code/del markers
    function inline(raw) {
      // 1. Escape HTML entities in the raw content
      let s = raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      // 2. Apply inline Markdown (order matters: code first, then bold/italic)
      s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
      s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
      return s;
    }

    // Parse a GFM table row - splits on | respecting escaped pipes
    function parseRow(rowLine) {
      return rowLine.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
    }

    // Is this line a GFM table separator? (e.g. |------|:---:|----:|)
    function isSeparator(line) {
      return /^\|?[\s\-:|]+\|[\s\-:|]*$/.test(line.trim()) ||
             /^[-|: ]+$/.test(line.trim()) && line.includes('-') && line.includes('|');
    }

    const lines = md.split('\n');
    let out = '';
    let i = 0;

    while (i < lines.length) {
      const raw  = lines[i];
      const line = raw.trim();

      //  Blank line 
      if (!line) { i++; continue; }

      //  ATX Heading: # through ###### 
      const hm = line.match(/^(#{1,6})\s+(.+)$/);
      if (hm) {
        const lv = hm[1].length;
        out += `<h${lv}>${inline(hm[2])}</h${lv}>`;
        i++; continue;
      }

      //  Horizontal rule: --- or *** or ___ 
      if (/^(?:---+|\*\*\*+|___+)$/.test(line)) {
        out += '<hr>';
        i++; continue;
      }

      //  GFM Table: current line has | and next line is a separator 
      if (line.includes('|') && isSeparator(lines[i + 1] || '')) {
        const headers = parseRow(line);
        i += 2; // skip the separator row
        out += '<table><thead><tr>' +
          headers.map(h => `<th>${h}</th>`).join('') +
          '</tr></thead><tbody>';
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          out += '<tr>' + parseRow(lines[i]).map(c => `<td>${c}</td>`).join('') + '</tr>';
          i++;
        }
        out += '</tbody></table>';
        continue;
      }

      //  Blockquote: > ... 
      if (/^>\s/.test(line)) {
        out += '<blockquote>';
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          out += inline(lines[i].trim().replace(/^>\s?/, '')) + ' ';
          i++;
        }
        out += '</blockquote>';
        continue;
      }

      //  Unordered list: - * + 
      if (/^[-*+]\s/.test(line)) {
        out += '<ul>';
        while (i < lines.length) {
          const l = lines[i].trim();
          if (!l) { i++; break; }
          if (!/^[-*+]\s/.test(l)) break;
          out += `<li>${inline(l.replace(/^[-*+]\s+/, ''))}</li>`;
          i++;
        }
        out += '</ul>';
        continue;
      }

      //  Ordered list: 1. 2. 3. 
      if (/^\d+\.\s/.test(line)) {
        out += '<ol>';
        while (i < lines.length) {
          const l = lines[i].trim();
          if (!l) { i++; break; }
          if (!/^\d+\.\s/.test(l)) break;
          out += `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`;
          i++;
        }
        out += '</ol>';
        continue;
      }

      //  Paragraph: gather consecutive non-block lines 
      const paraChunks = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l) { i++; break; }
        // Stop at any block-level marker
        if (/^#{1,6}\s/.test(l))             break;
        if (/^(?:---+|\*\*\*+|___+)$/.test(l)) break;
        if (/^>\s?/.test(l))                  break;
        if (/^[-*+]\s/.test(l))               break;
        if (/^\d+\.\s/.test(l))               break;
        if (l.includes('|') && isSeparator(lines[i + 1] || '')) break;
        paraChunks.push(l);
        i++;
      }
      if (paraChunks.length) {
        out += `<p>${paraChunks.map(inline).join('<br>')}</p>`;
      }
    }

    return out;
  }


  function getContextPrompt() {
    let codeContent = '';
    if (monacoEditor) {
      codeContent = monacoEditor.getValue();
    }
    
    let consoleOutput = '';
    const outputDiv = document.getElementById('output');
    if (outputDiv) {
      consoleOutput = outputDiv.innerText || outputDiv.textContent;
      if (consoleOutput.length > 2000) {
        consoleOutput = consoleOutput.slice(-2000);
      }
    }

    return `\n\n[CONTEXT: User's Current Python Code]\n\`\`\`python\n${codeContent}\n\`\`\`\n\n[CONTEXT: Last Console Output]\n\`\`\`\n${consoleOutput}\n\`\`\``;
  }

  function getActivePanelContext() {
    // Detect if Vision modal is open
    const visionOverlay = document.getElementById('visionModalOverlay');
    if (visionOverlay && !visionOverlay.classList.contains('hidden')) {
      return 'vision';
    }
    // Detect if CAD modal is open
    const cadOverlay = document.getElementById('cadModalOverlay');
    if (cadOverlay && !cadOverlay.classList.contains('hidden')) {
      return 'cad';
    }
    // Detect if Desmos modal is open
    const desmosOverlay = document.getElementById('desmosModalOverlay');
    if (desmosOverlay && !desmosOverlay.classList.contains('hidden')) {
      return 'desmos';
    }
    // Detect if Data Explorer bottom panel is visible
    const dex = document.getElementById('dexPanel');
    if (dex && dex.style.display !== 'none' && dex.style.display !== '') {
      return 'data';
    }
    // Default to Python Editor context
    return 'editor';
  }

  async function sendUserMessage(overrideText = null) {
    if (aiSendBtn && aiSendBtn.classList.contains('is-working')) {
      stopAIAndLoop();
      return;
    }

    const text = (overrideText || aiTextarea.value).trim();
    if (!text) return;

    if (!overrideText) {
      aiTextarea.value = '';
      aiTextarea.style.height = 'auto';
    }

    appendMessage('user', text);

    const model = aiModelSelect.value;
    const indicator = appendLoadingIndicator();
    const context = getContextPrompt();
    const activePanelContext = getActivePanelContext();
    
    const messages = [
      ...messagesHistory,
      { role: 'user', content: text + context }
    ];

    setAIWorking(true);
    activeAbortController = new AbortController();

    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: activeAbortController.signal,
        body: JSON.stringify({
          messages,
          model,
          context: activePanelContext
        })
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || 'Server returned an error');
      }

      indicator.remove();

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      const assistantBubble = appendMessage('assistant', '');
      let fullAssistantText = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const rawJson = trimmed.substring(6);
              const parsed = JSON.parse(rawJson);
              const token = parsed.choices?.[0]?.delta?.content || '';
              fullAssistantText += token;
              renderMarkdown(assistantBubble, fullAssistantText);
              aiMessages.scrollTop = aiMessages.scrollHeight;
            } catch (err) {
              // skip parse failures on partial chunks
            }
          }
        }
      }

      messagesHistory.push({ role: 'user', content: text });
      messagesHistory.push({ role: 'assistant', content: fullAssistantText });
      
      if (messagesHistory.length > 10) {
        messagesHistory = messagesHistory.slice(-10);
      }

      // Show the Agree & Run / Apply Code action bar inside input area if code was generated
      const hasCode = /```python[\s\S]*?```/.test(fullAssistantText);
      const hasSurgicalEdit = /<<<SURGICAL_EDIT>>>[\s\S]*?<<<END_EDIT>>>/.test(fullAssistantText);
      const codeActionBar = document.getElementById('aiCodeActionBar');
      if (hasCode && codeActionBar) {
        codeActionBar.classList.add('visible');
      }

      //  AUTONOMOUS HEALING LOOP (STRONG LOOP - PRIMARY ACROSS ALL PANELS) 
      const hasCadCode = /```(?:openscad|scad)[\s\S]*?```/.test(fullAssistantText);
      const hasDesmosCode = /```desmos[\s\S]*?```/.test(fullAssistantText);

      if ((hasCode || hasSurgicalEdit) && activePanelContext === 'editor') {
        if (window.activeAutonomousLoop && window.activeAutonomousLoop.isActive) {
          window.activeAutonomousLoop.abort();
        }
        window.activeAutonomousLoop = new AutonomousRepairLoop({
          maxIterations: 4,
          model: model,
          chatContainer: aiMessages
        });
        window.activeAutonomousLoop.start(text, fullAssistantText);
      } else if ((hasCadCode || hasSurgicalEdit) && activePanelContext === 'cad' && window.startCADAutonomousLoop) {
        window.startCADAutonomousLoop(text, fullAssistantText, aiMessages);
      } else if ((hasDesmosCode || hasSurgicalEdit) && activePanelContext === 'desmos' && window.startDesmosAutonomousLoop) {
        window.startDesmosAutonomousLoop(text, fullAssistantText, aiMessages);
      } else {
        setAIWorking(false);
      }

    } catch (err) {
      if (indicator) indicator.remove();
      if (err.name === 'AbortError') {
        appendMessage('assistant', '[WARN] Generation stopped by user.', true);
      } else {
        appendMessage('assistant', `Failed to get response: ${err.message}`, true);
      }
      setAIWorking(false);
    }
  }

  // Dismiss the code action bar
  const aiCodeActionDismissBtn = document.getElementById('aiCodeActionDismiss');
  if (aiCodeActionDismissBtn) {
    aiCodeActionDismissBtn.addEventListener('click', () => {
      const bar = document.getElementById('aiCodeActionBar');
      if (bar) bar.classList.remove('visible');
    });
  }

  // Helper to extract the latest code block generated by the assistant
  function getLatestCodeSnippet() {
    // Look backwards through assistant messages
    for (let i = messagesHistory.length - 1; i >= 0; i--) {
      if (messagesHistory[i].role === 'assistant') {
        const text = messagesHistory[i].content;
        const match = text.match(/```python([\s\S]*?)```/);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
    // Fallback: check DOM code containers in chat
    const codeContainers = document.querySelectorAll('.ai-code-block-container code');
    if (codeContainers.length > 0) {
      return codeContainers[codeContainers.length - 1].textContent.trim();
    }
    return null;
  }

  //  Run (inside input area, shown after code generated)
  const aiActionRunBar = document.getElementById('aiActionRunBar');
  if (aiActionRunBar) {
    aiActionRunBar.addEventListener('click', () => {
      const code = getLatestCodeSnippet();
      if (code) {
        if (monacoEditor) monacoEditor.setValue(code);
        aiActionRunBar.textContent = 'Running...';
        if (window.activeAutonomousLoop && window.activeAutonomousLoop.isActive) {
          window.activeAutonomousLoop.abort();
        }
        window.activeAutonomousLoop = new AutonomousRepairLoop({
          maxIterations: 3,
          model: aiModelSelect ? aiModelSelect.value : DEFAULT_MODEL,
          chatContainer: aiMessages
        });
        window.activeAutonomousLoop.start('Run and verify python program', '```python\n' + code + '\n```');
        const bar = document.getElementById('aiCodeActionBar');
        setTimeout(() => {
          aiActionRunBar.textContent = ' Run';
          if (bar) bar.classList.remove('visible');
        }, 2200);
      } else {
        sendUserMessage('Please generate a complete, working Python script for my current task so I can run it.');
      }
    });
  }

  //  Cycling placeholder suggestions in the textarea 
  const AI_PLACEHOLDERS = [
    'Explain the current code',
    'Fix the error in the console output',
    'Optimize this for performance',
    'Add docstrings and comments',
    'Plot a candlestick chart for AAPL',
    'Write a moving-average crossover strategy',
    'Download FRED GDP data and plot it',
    'Refactor into functions',
    'What does this code do?',
    'Generate a scatter plot with regression line',
    'Debug why my DataFrame is empty',
    'Convert this to use async/await',
  ];

  let _phIdx = 0;
  function _rotatePlaceholder() {
    if (document.activeElement === aiTextarea) return; // don't rotate while typing
    _phIdx = (_phIdx + 1) % AI_PLACEHOLDERS.length;
    aiTextarea.setAttribute('placeholder', AI_PLACEHOLDERS[_phIdx]);
  }
  // Set initial placeholder then rotate every 3 s
  aiTextarea.setAttribute('placeholder', AI_PLACEHOLDERS[0]);
  setInterval(_rotatePlaceholder, 3000);
})();

//  Global Liquid Metal Ripple Effect 
document.addEventListener('click', (e) => {
  const target = e.target.closest('.btn-liquid-metal, .btn-ai-action, .ai-code-btn, .btn-run, .btn-ai, .btn-ai-run-primary, .btn-ai-apply-primary, .ai-send-btn, .btn-ghost');
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const ripple = document.createElement('span');
  ripple.className = 'btn-ripple-span';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.style.width = `${Math.max(rect.width, rect.height) * 2}px`;
  ripple.style.height = `${Math.max(rect.width, rect.height) * 2}px`;

  target.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

// 
// DESMOS GRAPHING CALCULATOR & MATH SIMULATION MODULE
// 
let desmosMainCalculator = null;
let desmosApiKey = 'dca3170180db492b4eb4508460839bad';

(function initDesmos() {
  const btnDesmos = document.getElementById('btnDesmos');
  const desmosModalOverlay = document.getElementById('desmosModalOverlay');
  const btnCloseDesmosModal = document.getElementById('btnCloseDesmosModal');
  const desmosPromptInput = document.getElementById('desmosPromptInput');
  const btnDesmosGenerate = document.getElementById('btnDesmosGenerate');
  const desmosModelSelect = document.getElementById('desmosModelSelect');
  const btnDesmosClear = document.getElementById('btnDesmosClear');
  const desmosLoopContainer = document.getElementById('desmosLoopContainer');
  const desmosActiveControlBadge = document.getElementById('desmosActiveControlBadge');

  let activeDesmosLoop = null;
  let desmosAbortController = null;

  const DESMOS_MODEL_CATALOG = [
    // ── NVIDIA NIM ──────────────────────────────────────────────────────────
    { id: 'deepseek-ai/deepseek-v4.1-flash',           name: 'NVIDIA - DeepSeek V4.1 Flash',            provider: 'NVIDIA NIM' },
    { id: 'deepseek-ai/deepseek-r1',                  name: 'NVIDIA - DeepSeek R1 (Reasoning)',        provider: 'NVIDIA NIM' },
    { id: 'meta/llama-4-maverick-17b-128e-instruct',  name: 'NVIDIA - Llama 4 Maverick 17Bx128E',     provider: 'NVIDIA NIM' },
    { id: 'meta/llama-4-scout-17b-16e-instruct',      name: 'NVIDIA - Llama 4 Scout 17Bx16E',         provider: 'NVIDIA NIM' },
    { id: 'meta/llama-3.3-70b-instruct',              name: 'NVIDIA - Llama 3.3 70B Instruct',        provider: 'NVIDIA NIM' },
    { id: 'qwen/qwen3-32b',                           name: 'NVIDIA - Qwen3 32B ★ FREE',              provider: 'NVIDIA NIM' },
    { id: 'moonshotai/kimi-k2',                       name: 'NVIDIA - Kimi K2 1T MoE ★ FREE',         provider: 'NVIDIA NIM' },
    { id: 'microsoft/phi-4-mini-instruct',            name: 'NVIDIA - Phi-4 Mini ★ FREE fast',        provider: 'NVIDIA NIM' },
    { id: 'nvidia/nemotron-3.5-lightning-30b-a3b',     name: 'NVIDIA - Nemotron 3.5 Lightning',        provider: 'NVIDIA NIM' },
    // ── Groq ────────────────────────────────────────────────────────────────
    { id: 'openai/gpt-oss-120b',                      name: 'Groq - GPT-OSS 120B (~500 tok/s)',       provider: 'Groq' },
    { id: 'openai/gpt-oss-20b',                       name: 'Groq - GPT-OSS 20B',                    provider: 'Groq' },
    { id: 'groq/compound',                            name: 'Groq - Compound',                       provider: 'Groq' },
    { id: 'groq/compound-mini',                       name: 'Groq - Compound Mini',                  provider: 'Groq' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct',name: 'Groq - Llama 4 Scout 17B ★ FREE fast',  provider: 'Groq' },
    { id: 'llama-3.3-70b-versatile',                  name: 'Groq - Llama 3.3 70B ★ FREE',           provider: 'Groq' },
    { id: 'deepseek-r1-distill-llama-70b',            name: 'Groq - DeepSeek R1 Distill 70B ★ FREE', provider: 'Groq' },
    { id: 'llama-3.1-8b-instant',                     name: 'Groq - Llama 3.1 8B ★ FREE ~560tok/s',  provider: 'Groq' },
  ];
  const DESMOS_DEFAULT_MODEL = 'deepseek-ai/deepseek-v4.1-flash';

  function seedDesmosModelSelect(models) {
    if (!desmosModelSelect) return;
    desmosModelSelect.innerHTML = '';
    const groups = {};
    const order = [];
    models.forEach(m => {
      const groupName = m.provider || 'Other';
      if (!groups[groupName]) {
        groups[groupName] = document.createElement('optgroup');
        groups[groupName].label = groupName;
        order.push(groupName);
      }
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      groups[groupName].appendChild(opt);
    });
    order.forEach(g => desmosModelSelect.appendChild(groups[g]));
    const hasDefault = models.some(m => m.id === DESMOS_DEFAULT_MODEL);
    desmosModelSelect.value = hasDefault ? DESMOS_DEFAULT_MODEL : (models[0] ? models[0].id : '');
  }
  seedDesmosModelSelect(DESMOS_MODEL_CATALOG);
  (async () => {
    try {
      const resp = await fetch('/api/ai/models');
      if (!resp.ok) return;
      const models = await resp.json();
      if (Array.isArray(models) && models.length) {
        const prev = desmosModelSelect ? desmosModelSelect.value : '';
        seedDesmosModelSelect(models);
        if (prev && desmosModelSelect && [...desmosModelSelect.options].some(o => o.value === prev)) {
          desmosModelSelect.value = prev;
        }
      }
    } catch (_) { /* keep static catalog */ }
  })();

  function getDesmosModel() {
    return (desmosModelSelect && desmosModelSelect.value) || DESMOS_DEFAULT_MODEL;
  }

  function setDesmosWorking(isWorking) {
    if (!btnDesmosGenerate) return;
    if (isWorking) {
      btnDesmosGenerate.classList.add('is-working');
      btnDesmosGenerate.title = 'AI is working Click to stop';
      btnDesmosGenerate.setAttribute('aria-label', 'Stop AI');
    } else {
      btnDesmosGenerate.classList.remove('is-working');
      btnDesmosGenerate.title = 'Generate simulation (Enter)';
      btnDesmosGenerate.setAttribute('aria-label', 'Generate or Heal Simulation');
    }
  }

  function stopDesmosAI() {
    if (desmosAbortController) {
      try { desmosAbortController.abort(); } catch (_) {}
      desmosAbortController = null;
    }
    if (activeDesmosLoop && activeDesmosLoop.isActive) {
      activeDesmosLoop.abort();
    }
    setDesmosWorking(false);
  }

  // Fetch Desmos API key from /api/desmos/config and load Desmos JS API
  async function loadDesmosScript() {
    try {
      const res = await fetch('/api/desmos/config');
      const data = await res.json();
      if (data.apiKey) desmosApiKey = data.apiKey;
    } catch (e) {
      console.warn('[Desmos] Config fetch fallback to default key');
    }

    if (!window.Desmos) {
      const script = document.createElement('script');
      script.src = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${desmosApiKey}`;
      script.async = true;
      document.head.appendChild(script);
    }
  }
  loadDesmosScript();

  function openDesmosModal() {
    if (!desmosModalOverlay) return;
    desmosModalOverlay.classList.remove('hidden');

    if (!desmosMainCalculator && window.Desmos) {
      const target = document.getElementById('desmosMainCalculator');
      if (target) {
        desmosMainCalculator = Desmos.GraphingCalculator(target, {
          keypad: true,
          expressions: true,
          settingsMenu: true,
          zoomButtons: true,
        });
        desmosMainCalculator.setExpression({ id: 'sample1', latex: 'y=a\\cdot x^2+b' });
        desmosMainCalculator.setExpression({ id: 'sample2', latex: 'a=1' });
        desmosMainCalculator.setExpression({ id: 'sample3', latex: 'b=0' });
      }
    }
  }

  function closeDesmosModal() {
    if (desmosModalOverlay) desmosModalOverlay.classList.add('hidden');
  }

  if (btnDesmos) btnDesmos.addEventListener('click', openDesmosModal);
  if (btnCloseDesmosModal) btnCloseDesmosModal.addEventListener('click', closeDesmosModal);
  if (desmosModalOverlay) {
    desmosModalOverlay.addEventListener('click', (e) => {
      if (e.target === desmosModalOverlay) closeDesmosModal();
    });
  }

  // Clean LaTeX helper to convert raw math text into valid Desmos LaTeX syntax
  function cleanDesmosLatex(rawLine) {
    if (!rawLine || typeof rawLine !== 'string') return rawLine;
    let line = rawLine.trim();

    // Strip comments (#... or //...)
    line = line.replace(/(#|\/\/).*$/, '').trim();
    if (!line) return '';

    // Convert Unicode Greek symbols to LaTeX commands
    line = line.replace(/\u03b8/g, '\\theta');
    line = line.replace(/\u03c0/g, '\\pi');
    line = line.replace(/\u03b1/g, '\\alpha');
    line = line.replace(/\u03b2/g, '\\beta');
    line = line.replace(/\u03b3/g, '\\gamma');
    line = line.replace(/\u03c9/g, '\\omega');
    line = line.replace(/\u03bb/g, '\\lambda');

    // Replace Python power ** with LaTeX ^
    line = line.replace(/\*\*/g, '^');

    // Replace raw asterisks * with LaTeX \cdot
    line = line.replace(/\*/g, ' \\cdot ');

    // Convert multi-character variable names with numbers like v1x, v1y, v2x to subscript format v_{1x}, v_{1y}, v_{2x}
    line = line.replace(/\b([a-zA-Z])([0-9]+[a-zA-Z]*|[a-zA-Z]+[0-9]+)\b/g, (match, p1, p2) => {
      const mathFuncs = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'sqrt', 'cdot', 'frac', 'theta', 'alpha', 'beta', 'gamma', 'omega', 'pi', 'lambda'];
      if (mathFuncs.includes(match.toLowerCase())) return match;
      return `${p1}_{${p2}}`;
    });

    // Normalize whitespace
    line = line.replace(/\s+/g, ' ').trim();
    return line;
  }
  window.cleanDesmosLatex = cleanDesmosLatex;

  /** Inspect all expressions in the Desmos calculator and classify any syntax or evaluation errors */
  async function verifyDesmosExpressions(calc) {
    if (!calc) return { success: false, totalCount: 0, errorCount: 1, errors: [{ id: 'none', index: 1, latex: '', errorMessage: 'Desmos calculator not ready', errorType: 'InitializationError' }] };

    // Allow Desmos worker to parse AST and calculate expressionAnalysis
    await new Promise(r => setTimeout(r, 120));

    const expressions = (calc.getExpressions && calc.getExpressions()) || [];
    const errors = [];
    const analysis = calc.expressionAnalysis || {};

    if (expressions.length === 0) {
      return {
        success: false,
        totalCount: 0,
        errorCount: 1,
        errors: [{ id: 'empty', index: 1, latex: '', errorMessage: 'No mathematical expressions found in calculator', errorType: 'EmptyExpressionSet' }]
      };
    }

    expressions.forEach((expr, idx) => {
      if (!expr.latex || !expr.latex.trim()) return;
      const info = analysis[expr.id];
      if (info && info.isError) {
        const rawMsg = info.errorMessage || 'Invalid mathematical expression';
        let errType = 'SyntaxError';
        if (/not defined|unknown|undefined/i.test(rawMsg)) errType = 'UndefinedIdentifier';
        else if (/too many variables|slider/i.test(rawMsg)) errType = 'TooManyVariables';
        else if (/dimension|unit/i.test(rawMsg)) errType = 'DimensionMismatch';
        else if (/domain|divide by zero/i.test(rawMsg)) errType = 'DomainError';

        errors.push({
          id: expr.id,
          index: idx + 1,
          latex: expr.latex,
          errorMessage: rawMsg,
          errorType: errType
        });
      }
    });

    return {
      success: errors.length === 0,
      totalCount: expressions.length,
      errorCount: errors.length,
      errors
    };
  }
  window.verifyDesmosExpressions = verifyDesmosExpressions;

  //  Desmos Autonomous Repair Loop Class 
  class DesmosAutonomousRepairLoop {
    constructor(options = {}) {
      this.maxIterations = options.maxIterations || 4;
      this.model = options.model || getDesmosModel();
      this.chatContainer = options.chatContainer || desmosLoopContainer || document.getElementById('aiMessages');
      this.calculator = options.calculator || desmosMainCalculator;
      this.isActive = false;
      this.isAborted = false;
      this.immutableUserGoal = '';
      this.currentIteration = 1;
      this.currentAbortController = null;
      this.cardEl = null;
      this.stepsEl = null;
      this.badgeEl = null;
      this.statusTextEl = null;
      this.stopBtn = null;
    }

    createCard() {
      if (this.chatContainer === desmosLoopContainer && desmosLoopContainer) {
        desmosLoopContainer.classList.remove('hidden');
        desmosLoopContainer.innerHTML = '';
      }

      const card = document.createElement('div');
      card.className = 'ai-loop-card';

      const header = document.createElement('div');
      header.className = 'ai-loop-header';

      const left = document.createElement('div');
      left.className = 'ai-loop-header-left';

      this.badgeEl = document.createElement('span');
      this.badgeEl.className = 'ai-loop-badge running';
      this.badgeEl.textContent = 'AUTO-HEAL';

      this.statusTextEl = document.createElement('span');
      this.statusTextEl.className = 'ai-loop-status-text';
      this.statusTextEl.textContent = 'Active Control: Verifying equations in Desmos';

      left.appendChild(this.badgeEl);
      left.appendChild(this.statusTextEl);

      this.stopBtn = document.createElement('button');
      this.stopBtn.className = 'ai-loop-stop-btn';
      this.stopBtn.textContent = 'Stop Loop';
      this.stopBtn.addEventListener('click', () => this.abort());

      header.appendChild(left);
      header.appendChild(this.stopBtn);

      this.stepsEl = document.createElement('div');
      this.stepsEl.className = 'ai-loop-body';

      card.appendChild(header);
      card.appendChild(this.stepsEl);

      this.cardEl = card;
      if (this.chatContainer) {
        this.chatContainer.appendChild(card);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    addStep(icon, text, type = 'normal', snippet = null) {
      if (!this.stepsEl) return;
      const step = document.createElement('div');
      step.className = `ai-loop-step ${type}`;

      const iconEl = document.createElement('span');
      iconEl.className = 'ai-loop-step-icon';
      iconEl.textContent = icon;

      const textEl = document.createElement('span');
      textEl.innerHTML = text;

      step.appendChild(iconEl);
      step.appendChild(textEl);
      this.stepsEl.appendChild(step);

      if (snippet) {
        const snippetEl = document.createElement('div');
        snippetEl.className = 'ai-loop-error-snippet';
        snippetEl.textContent = snippet;
        this.stepsEl.appendChild(snippetEl);
      }

      if (this.chatContainer) {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    addSummary(text) {
      if (!this.stepsEl) return;
      const sum = document.createElement('div');
      sum.className = 'ai-loop-summary';
      sum.innerHTML = `<span>[DONE]</span><span>${text}</span>`;
      this.stepsEl.appendChild(sum);
      if (this.chatContainer) {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    setEditorActive(active) {
      const badge = document.getElementById('desmosActiveControlBadge');
      if (badge) {
        if (active) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
      }
    }

    applyCodeOrEdit(text) {
      if (!text || !this.calculator) return { applied: false, type: 'none' };

      // 1. Surgical edit targeting specific expression LaTeX
      const surgicalEdits = (window.parseSurgicalEdits ? window.parseSurgicalEdits(text) : []);
      if (surgicalEdits && surgicalEdits.length > 0) {
        const expressions = (this.calculator.getExpressions && this.calculator.getExpressions()) || [];
        let appliedCount = 0;
        for (const edit of surgicalEdits) {
          const findNorm = cleanDesmosLatex(edit.findText);
          const replaceNorm = cleanDesmosLatex(edit.replaceText);
          const match = expressions.find(e => e.latex === edit.findText || (findNorm && cleanDesmosLatex(e.latex) === findNorm));
          if (match) {
            this.calculator.setExpression({ id: match.id, latex: replaceNorm || edit.replaceText });
            appliedCount++;
          }
        }
        if (appliedCount > 0) {
          return { applied: true, type: 'surgical', count: appliedCount };
        }
      }

      // 2. Full Desmos code block
      const match = text.match(/```desmos([\s\S]*?)```/);
      let lines = null;
      if (match && match[1]) {
        lines = match[1].split('\n').map(l => cleanDesmosLatex(l)).filter(Boolean);
      } else if (text.includes('=') && !text.includes('```')) {
        lines = text.split('\n').map(l => cleanDesmosLatex(l)).filter(Boolean);
      }

      if (lines && lines.length > 0) {
        this.calculator.setBlank();
        lines.forEach((l, idx) => {
          this.calculator.setExpression({ id: 'panel_expr_' + idx, latex: l });
        });
        return { applied: true, type: 'full', count: lines.length };
      }

      return { applied: false, type: 'none' };
    }

    async requestRepair(errors) {
      const expressions = this.calculator ? (this.calculator.getExpressions() || []) : [];
      const currentLines = expressions.map((e, idx) => `${idx + 1}. [${e.id}]: ${e.latex}`).join('\n');
      const errorReport = errors.map(e => ` Expression #${e.index} [${e.id}]: \`${e.latex}\`\n  Error Type: ${e.errorType}\n  Details: ${e.errorMessage}`).join('\n');

      const prompt = `[IMMUTABLE USER GOAL]
${this.immutableUserGoal}

[CURRENT DESMOS EQUATIONS]
${currentLines}

[DESMOS MATHEMATICAL / LATEX ERRORS DETECTED - RUN #${this.currentIteration}]
${errorReport}

[INSTRUCTION]
Perform an exact surgical fix to eliminate all Desmos syntax or mathematical errors while strictly preserving the user's simulation intent, constants, and valid formulas.
Respond with the surgical replacement using this exact format:
<<<SURGICAL_EDIT>>>
<<<FIND>>>
<exact failing LaTeX string>
<<<REPLACE>>>
<corrected, valid Desmos LaTeX string>
<<<END_EDIT>>>

If extensive structural changes are required, output the complete corrected \`\`\`desmos ... \`\`\` block instead.`;

      this.currentAbortController = new AbortController();
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this.currentAbortController.signal,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are an authoritative Desmos mathematical self-healing repair engineer in RUN01. Eliminate LaTeX syntax errors, undefined identifiers, and dimension errors. Output minimal surgical edits targeting only broken equations to guarantee clean evaluation with 0 errors.' },
            { role: 'user', content: prompt }
          ],
          model: this.model,
          context: 'desmos'
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Desmos AI repair request failed with code ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let repairResponse = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const rawJson = trimmed.substring(6);
              const parsed = JSON.parse(rawJson);
              const token = parsed.choices?.[0]?.delta?.content || '';
              repairResponse += token;
            } catch (_) {}
          }
        }
      }

      return repairResponse;
    }

    async start(userGoal, initialAssistantResponse) {
      this.isActive = true;
      this.isAborted = false;
      this.immutableUserGoal = userGoal;
      this.currentIteration = 1;

      this.createCard();
      this.setEditorActive(true);
      setDesmosWorking(true);

      if (initialAssistantResponse) {
        if (Array.isArray(initialAssistantResponse)) {
          if (this.calculator) {
            this.calculator.setBlank();
            initialAssistantResponse.forEach((item, idx) => {
              const l = typeof item === 'string' ? cleanDesmosLatex(item) : (item && item.latex ? cleanDesmosLatex(item.latex) : '');
              if (l) this.calculator.setExpression({ id: 'panel_expr_' + idx, latex: l });
            });
          }
          this.addStep('[CODE]', `Injected ${initialAssistantResponse.length} initial mathematical equation(s) into Desmos.`, 'active');
        } else if (typeof initialAssistantResponse === 'string') {
          const initialApply = this.applyCodeOrEdit(initialAssistantResponse);
          if (initialApply.applied) {
            if (initialApply.type === 'surgical') {
              this.addStep('[FIX]', `Applied ${initialApply.count} surgical patch(es) to Desmos expressions.`, 'active');
            } else {
              this.addStep('[CODE]', `Loaded ${initialApply.count} Desmos equation(s) into calculator.`, 'active');
            }
          } else {
            this.addStep('[INFO]', 'Reading active Desmos expressions for verification', 'active');
          }
        }
      }

      while (this.isActive && !this.isAborted) {
        if (this.statusTextEl) {
          this.statusTextEl.textContent = `Attempt ${this.currentIteration}/${this.maxIterations}: Verifying in Desmos Graphing API`;
        }
        this.addStep('[COMPILE]', `Evaluating equations in Desmos (Attempt #${this.currentIteration})`, 'active');

        const check = await verifyDesmosExpressions(this.calculator);

        if (this.isAborted) {
          this.cleanup();
          return;
        }

        if (check.success) {
          this.badgeEl.className = 'ai-loop-badge';
          this.badgeEl.textContent = '[DONE] 0 ERRORS';
          if (this.statusTextEl) {
            this.statusTextEl.textContent = `Clean Evaluation (0 Errors across ${check.totalCount} equations)`;
          }
          if (this.stopBtn) this.stopBtn.style.display = 'none';

          this.addStep('[DONE]', `Run #${this.currentIteration} completed cleanly with 0 errors across all ${check.totalCount} equations.`, 'success');
          this.addSummary(`Autonomous Desmos Self-Healing verified complete. Zero errors. Context fully preserved.`);
          this.cleanup();
          return;
        }

        const firstErr = check.errors[0];
        this.addStep('[WARN]', `Error in Run #${this.currentIteration}: <strong>${firstErr.errorType}</strong> on Expr #${firstErr.index}: ${firstErr.errorMessage}`, 'warning', `Equation: ${firstErr.latex || '(empty)'}\nIssue: ${firstErr.errorMessage}`);

        if (this.currentIteration >= this.maxIterations) {
          this.badgeEl.className = 'ai-loop-badge error';
          this.badgeEl.textContent = 'MAX ATTEMPTS';
          if (this.statusTextEl) {
            this.statusTextEl.textContent = `Halted after ${this.maxIterations} attempts`;
          }
          if (this.stopBtn) this.stopBtn.style.display = 'none';
          this.addStep('[STOP]', `Maximum repair attempts reached. Desmos panel contains latest state.`, 'warning');
          this.cleanup();
          return;
        }

        this.badgeEl.className = 'ai-loop-badge healing';
        this.badgeEl.textContent = 'HEALING';
        if (this.statusTextEl) {
          this.statusTextEl.textContent = `Attempt ${this.currentIteration + 1}/${this.maxIterations}: Synthesizing surgical fix`;
        }
        this.addStep('[FIX]', `AI analyzing error and synthesizing surgical LaTeX fix`, 'active');

        let repairResponse = '';
        try {
          repairResponse = await this.requestRepair(check.errors);
        } catch (repairErr) {
          if (this.isAborted) { this.cleanup(); return; }
          this.addStep('[ERROR]', `AI repair request failed: ${repairErr.message}`, 'warning');
          this.cleanup();
          return;
        }

        if (this.isAborted) { this.cleanup(); return; }

        const repairApply = this.applyCodeOrEdit(repairResponse);
        if (repairApply.applied) {
          if (repairApply.type === 'surgical') {
            this.addStep('[DONE]', `Applied surgical LaTeX patch to expression.`, 'active');
          } else {
            this.addStep('[DONE]', `Updated Desmos calculator with restructured equations.`, 'active');
          }
        } else {
          this.addStep('[WARN]', `Retrying evaluation with current expressions`, 'warning');
        }

        this.currentIteration++;
      }

      this.cleanup();
    }

    abort() {
      this.isAborted = true;
      if (this.currentAbortController) {
        try { this.currentAbortController.abort(); } catch (_) {}
        this.currentAbortController = null;
      }
      if (this.badgeEl) {
        this.badgeEl.className = 'ai-loop-badge error';
        this.badgeEl.textContent = 'STOPPED';
      }
      if (this.statusTextEl) {
        this.statusTextEl.textContent = 'Desmos Auto-Heal Stopped by User';
      }
      if (this.stopBtn) this.stopBtn.style.display = 'none';
      this.addStep('[STOP]', 'Desmos healing loop aborted by user.', 'warning');
      this.cleanup();
    }

    cleanup() {
      this.isActive = false;
      this.setEditorActive(false);
      setDesmosWorking(false);
    }
  }
  window.DesmosAutonomousRepairLoop = DesmosAutonomousRepairLoop;

  // Stream AI helper for Desmos prompt
  async function streamDesmosAI(messages) {
    desmosAbortController = new AbortController();
    const resp = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: desmosAbortController.signal,
      body: JSON.stringify({
        model: getDesmosModel(),
        context: 'desmos',
        messages
      })
    });

    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (!resp.ok || ct.includes('application/json')) {
      let errMsg = 'AI provider unavailable';
      try {
        const errBody = await resp.json();
        if (errBody && errBody.error) errMsg = errBody.error;
      } catch (_) {}
      throw new Error(errMsg);
    }

    let text = '';
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            text += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || '';
          } catch (_) {}
        }
      }
    }
    return text;
  }

  // Generate Desmos simulation from prompt bar
  async function generateDesmos(userPrompt) {
    const prompt = (typeof userPrompt === 'string' && userPrompt.trim())
      ? userPrompt.trim()
      : (desmosPromptInput ? desmosPromptInput.value.trim() : '');
    if (!prompt) {
      if (desmosPromptInput) desmosPromptInput.focus();
      return;
    }

    openDesmosModal();

    if (activeDesmosLoop && activeDesmosLoop.isActive) {
      activeDesmosLoop.abort();
    }

    const loop = new DesmosAutonomousRepairLoop({
      maxIterations: 4,
      model: getDesmosModel(),
      chatContainer: desmosLoopContainer,
      calculator: desmosMainCalculator
    });
    activeDesmosLoop = loop;
    setDesmosWorking(true);

    try {
      const systemPrompt = `You are a Desmos mathematical graphing expert in RUN01.
Generate clean, interactive Desmos mathematical equations, dynamic sliders, and simulations.
Output ONLY valid Desmos LaTeX lines inside a \`\`\`desmos ... \`\`\` code block.
One equation per line. No markdown outside the block. No comments starting with #.`;

      const rawResponse = await streamDesmosAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]);

      await loop.start(prompt, rawResponse);
    } catch (err) {
      if (err.name === 'AbortError') {
        loop.addStep('[STOP]', 'Generation stopped by user.', 'warning');
      } else {
        loop.addStep('[ERROR]', `Generation failed: ${err.message}`, 'warning');
      }
      loop.cleanup();
    }
  }

  // Hook Desmos input controls
  if (btnDesmosGenerate) {
    btnDesmosGenerate.addEventListener('click', () => {
      if (btnDesmosGenerate.classList.contains('is-working')) {
        stopDesmosAI();
      } else {
        generateDesmos();
      }
    });
  }

  if (desmosPromptInput) {
    desmosPromptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnDesmosGenerate && btnDesmosGenerate.classList.contains('is-working')) {
          stopDesmosAI();
        } else {
          generateDesmos();
        }
      }
    });
  }

  if (btnDesmosClear) {
    btnDesmosClear.addEventListener('click', () => {
      stopDesmosAI();
      if (desmosMainCalculator) {
        desmosMainCalculator.setBlank();
      }
      if (desmosLoopContainer) {
        desmosLoopContainer.innerHTML = '';
        desmosLoopContainer.classList.add('hidden');
      }
    });
  }

  // Global entry point to launch the Desmos autonomous self-healing loop
  window.startDesmosAutonomousLoop = function(userGoal, initialExpressions, chatContainer) {
    openDesmosModal();
    if (activeDesmosLoop && activeDesmosLoop.isActive) {
      activeDesmosLoop.abort();
    }
    activeDesmosLoop = new DesmosAutonomousRepairLoop({
      maxIterations: 4,
      model: getDesmosModel(),
      chatContainer: chatContainer || desmosLoopContainer,
      calculator: desmosMainCalculator
    });
    activeDesmosLoop.start(userGoal, initialExpressions);
    return activeDesmosLoop;
  };

  // Open and load expressions directly into the main Desmos panel
  window.loadIntoDesmosPanel = function(linesOrExpressions, title = 'Math Simulation') {
    if (!desmosModalOverlay) return;
    openDesmosModal();

    const titleEl = document.getElementById('desmosModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `<span class="desmos-badge">DESMOS</span> ${title}`;
    }

    if (window.startDesmosAutonomousLoop) {
      window.startDesmosAutonomousLoop(title, linesOrExpressions, desmosLoopContainer);
    }
  };


  // Output Console callback for Python desmos.plot() / show_desmos()
  window._renderDesmosGraphInOutput = function(exprJson, title = 'Desmos Math Graph') {
    const outputEl = document.getElementById('output');
    if (!outputEl) return;

    let parsedExprs = [];
    try { parsedExprs = JSON.parse(exprJson); } catch(e) {}

    const card = document.createElement('div');
    card.className = 'desmos-chat-card';
    card.style.margin = '12px 0';

    const header = document.createElement('div');
    header.className = 'desmos-chat-header';
    
    const titleSpan = document.createElement('span');
    titleSpan.innerHTML = `<span class="desmos-badge">DESMOS</span> ${title}`;

    const openPanelBtn = document.createElement('button');
    openPanelBtn.className = 'ai-code-btn';
    openPanelBtn.style.color = '#38bdf8';
    openPanelBtn.style.fontWeight = 'bold';
    openPanelBtn.innerHTML = 'Open in Desmos Panel';
    openPanelBtn.addEventListener('click', () => {
      window.loadIntoDesmosPanel(parsedExprs, title);
    });

    header.appendChild(titleSpan);
    header.appendChild(openPanelBtn);

    const calcDiv = document.createElement('div');
    calcDiv.className = 'desmos-chat-container';
    calcDiv.id = 'desmos_out_' + Math.random().toString(36).substr(2, 9);

    card.appendChild(header);
    card.appendChild(calcDiv);
    outputEl.appendChild(card);
    outputEl.scrollTop = outputEl.scrollHeight;

    setTimeout(() => {
      if (window.Desmos) {
        const calc = Desmos.GraphingCalculator(calcDiv, {
          expressions: true,
          keypad: false,
          settingsMenu: false,
          zoomButtons: true
        });
        parsedExprs.forEach((exp, idx) => {
          if (typeof exp === 'string') {
            calc.setExpression({ id: 'py_expr_' + idx, latex: exp });
          } else if (typeof exp === 'object') {
            calc.setExpression(exp);
          }
        });
      }
    }, 150);
  };
})();

// 
// AUTHENTICATION & GMAIL OAUTH MODULE
// 
(function initAuth() {
  const btnOpenAuth = document.getElementById('btnOpenAuth');
  const userMenuWrap = document.getElementById('userMenuWrap');
  const btnUserMenu = document.getElementById('btnUserMenu');
  const userDropdown = document.getElementById('userDropdown');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userDropdownName = document.getElementById('userDropdownName');
  const userDropdownEmail = document.getElementById('userDropdownEmail');
  const btnLogout = document.getElementById('btnLogout');

  const authModalOverlay = document.getElementById('authModalOverlay');
  const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
  const tabSignIn = document.getElementById('tabSignIn');
  const tabSignUp = document.getElementById('tabSignUp');
  const formSignIn = document.getElementById('formSignIn');
  const formSignUp = document.getElementById('formSignUp');
  const authAlert = document.getElementById('authAlert');
  const googleBtnContainer = document.getElementById('googleBtnContainer');

  const STORAGE_KEY = 'run01_user';

  let currentUser = null;
  let googleClientId = '';
  let googleInitialized = false;

  //  LocalStorage helpers 
  function saveUserLocally(user) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  function loadUserLocally() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearUserLocally() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  //  Toggle user dropdown menu 
  if (btnUserMenu && userDropdown) {
    btnUserMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('visible');
    });
    document.addEventListener('click', () => {
      userDropdown.classList.remove('visible');
    });
  }

  //  Open / Close Auth Modal 
  if (btnOpenAuth && authModalOverlay) {
    btnOpenAuth.addEventListener('click', () => {
      openAuthModal('signin');
    });
  }

  if (btnCloseAuthModal && authModalOverlay) {
    btnCloseAuthModal.addEventListener('click', () => {
      closeAuthModal();
    });
    authModalOverlay.addEventListener('click', (e) => {
      if (e.target === authModalOverlay) closeAuthModal();
    });
  }

  function openAuthModal(tab = 'signin') {
    hideAlert();
    authModalOverlay.classList.remove('hidden');
    switchAuthTab(tab);
    initGoogleAuth();
  }

  function closeAuthModal() {
    authModalOverlay.classList.add('hidden');
    hideAlert();
  }

  function switchAuthTab(tab) {
    hideAlert();
    if (tab === 'signin') {
      tabSignIn.classList.add('active');
      tabSignIn.setAttribute('aria-selected', 'true');
      tabSignUp.classList.remove('active');
      tabSignUp.setAttribute('aria-selected', 'false');
      formSignIn.classList.remove('hidden');
      formSignUp.classList.add('hidden');
    } else {
      tabSignUp.classList.add('active');
      tabSignUp.setAttribute('aria-selected', 'true');
      tabSignIn.classList.remove('active');
      tabSignIn.setAttribute('aria-selected', 'false');
      formSignUp.classList.remove('hidden');
      formSignIn.classList.add('hidden');
    }
  }

  if (tabSignIn && tabSignUp) {
    tabSignIn.addEventListener('click', () => switchAuthTab('signin'));
    tabSignUp.addEventListener('click', () => switchAuthTab('signup'));
  }

  function showAlert(message, type = 'error') {
    if (!authAlert) return;
    authAlert.textContent = message;
    authAlert.className = `auth-alert ${type}`;
    authAlert.classList.remove('hidden');
  }

  function hideAlert() {
    if (!authAlert) return;
    authAlert.classList.add('hidden');
    authAlert.textContent = '';
  }

  //  Set / clear UI auth state 
  function setAuthState(user) {
    currentUser = user;
    if (user) {
      if (btnOpenAuth) btnOpenAuth.classList.add('hidden');
      if (userMenuWrap) userMenuWrap.classList.remove('hidden');

      const nameStr = user.name || user.email.split('@')[0];
      const initial = nameStr.charAt(0).toUpperCase();

      if (userAvatar) userAvatar.textContent = initial;
      if (userName) userName.textContent = nameStr;
      if (userDropdownName) userDropdownName.textContent = nameStr;
      if (userDropdownEmail) userDropdownEmail.textContent = user.email;

      // Always persist to localStorage so the next page load is instant
      saveUserLocally(user);
    } else {
      if (btnOpenAuth) btnOpenAuth.classList.remove('hidden');
      if (userMenuWrap) userMenuWrap.classList.add('hidden');
      clearUserLocally();
    }
  }

  //  Instant restore from localStorage (no network, no flash) 
  // Show the user immediately from the local cache, then verify with
  // the server in the background.  If the server says "not authenticated"
  // (e.g. session cookie truly expired) we clear the cached user.
  const cachedUser = loadUserLocally();
  if (cachedUser) {
    setAuthState(cachedUser);
  }

  //  Check server session (background verification) 
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setAuthState(data.user);  // Refresh with latest data from DB
      } else {
        // Server session expired; clear local cache to force re-login
        setAuthState(null);
      }
    } catch (err) {
      console.warn('[Auth] Session check failed (network?):', err);
      // Keep the locally cached user - don't log them out on network error
    }
  }

  //  Fetch Google Client ID from server 
  async function fetchConfig() {
    try {
      const res = await fetch('/api/auth/config');
      const data = await res.json();
      googleClientId = data.google_client_id || '';
      if (googleClientId) {
        initGoogleAuth();
      }
    } catch (err) {
      console.warn('[Auth] Fetch config error:', err);
    }
  }

  //  Initialize Google Identity Services SDK 
  function initGoogleAuth() {
    if (!googleBtnContainer) return;
    if (googleInitialized && googleClientId) return; // Already done

    if (window.google && window.google.accounts && window.google.accounts.id) {
      try {
        if (googleClientId) {
          google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: true,           // Silently sign in returning users
            cancel_on_tap_outside: false,
          });
          googleInitialized = true;

          // Render the button in the modal container
          googleBtnContainer.innerHTML = '';
          google.accounts.id.renderButton(googleBtnContainer, {
            theme: 'outline',
            size: 'large',
            width: 320,
            text: 'continue_with',
            shape: 'rectangular',
          });

          // Prompt One Tap if user is not already signed in
          if (!currentUser) {
            google.accounts.id.prompt();
          }
        } else {
          googleBtnContainer.innerHTML = `
            <div style="font-size:12px; color:var(--text-muted); text-align:center; padding:8px;">
              <span>Google Sign-In ready. Set <code>GOOGLE_CLIENT_ID</code> in Vercel Env to activate.</span>
            </div>
          `;
        }
      } catch (err) {
        console.warn('[Auth] Google GIS init warning:', err);
      }
    } else {
      setTimeout(initGoogleAuth, 500);
    }
  }

  //  Handle Google credential response 
  async function handleGoogleCredentialResponse(response) {
    try {
      hideAlert();
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuthState(data.user);
        closeAuthModal();
        if (window.ViewManager) window.ViewManager.showIDE();
      } else {
        showAlert(data.error || 'Google Sign-In failed.');
      }
    } catch (err) {
      showAlert('Google Sign-In error: ' + err.message);
    }
  }

  //  Sign In Form Submit 
  if (formSignIn) {
    formSignIn.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const email = document.getElementById('signInEmail').value;
      const password = document.getElementById('signInPassword').value;
      const btn = document.getElementById('btnSubmitSignIn');

      btn.disabled = true;
      btn.textContent = 'Signing in';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setAuthState(data.user);
          closeAuthModal();
          if (window.ViewManager) window.ViewManager.showIDE();
        } else {
          showAlert(data.error || 'Invalid credentials.');
        }
      } catch (err) {
        showAlert('Network error during login: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }

  //  Sign Up Form Submit 
  if (formSignUp) {
    formSignUp.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const name = document.getElementById('signUpName').value;
      const email = document.getElementById('signUpEmail').value;
      const password = document.getElementById('signUpPassword').value;
      const btn = document.getElementById('btnSubmitSignUp');

      btn.disabled = true;
      btn.textContent = 'Creating account';

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setAuthState(data.user);
          closeAuthModal();
          if (window.ViewManager) window.ViewManager.showIDE();
        } else {
          showAlert(data.error || 'Failed to create account.');
        }
      } catch (err) {
        showAlert('Network error during signup: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }

  //  Logout Click 
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        console.warn('[Auth] Logout error:', err);
      } finally {
        // Always clear local state regardless of server response
        setAuthState(null);
        if (userDropdown) userDropdown.classList.remove('visible');
      }
    });
  }

  //  Run initial checks 
  checkSession();   // Background server verification
  fetchConfig();    // Load Google Client ID and trigger One Tap
})();

// 
// VIEW MANAGER: LANDING PAGE & IDE WORKSPACE TOGGLE
// 
window.ViewManager = (function() {
  const landingView = document.getElementById('landingView');
  const ideView = document.getElementById('ideView');
  const btnLandingAuth = document.getElementById('btnLandingAuth');
  const btnLandingHome = document.getElementById('btnLandingHome');
  const navBrand = document.getElementById('navBrand');

  function showLanding() {
    document.body.classList.remove('in-ide');
    if (landingView) landingView.classList.remove('hidden');
    if (ideView) ideView.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.location.hash === '#ide') {
      history.replaceState(null, null, window.location.pathname);
    }
  }

  function showIDE() {
    document.body.classList.add('in-ide');
    if (landingView) landingView.classList.add('hidden');
    if (ideView) ideView.classList.remove('hidden');
    window.location.hash = 'ide';
    if (typeof startPyodideInit === 'function') {
      startPyodideInit();
    }
    if (window.monacoEditor) {
      setTimeout(() => {
        try {
          window.monacoEditor.layout();
          window.monacoEditor.focus();
        } catch (e) {}
      }, 60);
    }
  }

  // Global delegation for all launch buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.btn-launch-ide, #btnLandingLaunchIDE, #btnHeroLaunchIDE, #btnProofLaunchIDE, #btnFounderLaunchIDE');
    if (btn) {
      e.preventDefault();
      showIDE();
    }
  });

  // Handle URL hash changes
  window.addEventListener('hashchange', () => {
    const h = window.location.hash;
    if (h === '#ide' || h === '#workspace') {
      showIDE();
    } else if (h === '' || h === '#top' || h === '#landingStack' || h === '#landingFeatures' || h === '#landingWhy' || h === '#founder') {
      showLanding();
    }
  });

  // Direct binding on all CTA launch buttons
  document.querySelectorAll('.btn-launch-ide').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      showIDE();
    });
  });

  window.showIDE = showIDE;
  window.showLanding = showLanding;

  if (btnLandingAuth) {
    btnLandingAuth.addEventListener('click', (e) => {
      e.preventDefault();
      const authOverlay = document.getElementById('authModalOverlay');
      if (authOverlay) authOverlay.classList.remove('hidden');
    });
  }

  if (btnLandingHome) {
    btnLandingHome.addEventListener('click', (e) => {
      e.preventDefault();
      showLanding();
    });
  }

  if (navBrand) {
    navBrand.style.cursor = 'pointer';
    navBrand.addEventListener('click', (e) => {
      e.preventDefault();
      showLanding();
    });
  }

  // Handle URL hash on initial page load
  const hash = window.location.hash;
  if (hash === '#ide' || hash === '#workspace') {
    showIDE();
  } else {
    showLanding();
  }

  return {
    showLanding,
    showIDE
  };
})();

// 
// AI PARAMETRIC CAD STUDIO  OpenSCAD WASM + Three.js + IndexedDB
// Zero server-side geometry. All computation runs in the browser.
// 
(function initCADStudio() {
  //  DOM refs 
  const btnCAD            = document.getElementById('btnCAD');
  const cadModalOverlay   = document.getElementById('cadModalOverlay');
  const btnCloseCADModal  = document.getElementById('btnCloseCADModal');
  const cadChatMessages   = document.getElementById('cadChatMessages');
  const cadPromptInput    = document.getElementById('cadPromptInput');
  const btnCadGenerate    = document.getElementById('btnCadGenerate');
  const cadStatusBar      = document.getElementById('cadStatusBar');
  const cadParamsPanel    = document.getElementById('cadParamsPanel');
  const cadParamsGrid     = document.getElementById('cadParamsGrid');
  const btnCadRegen       = document.getElementById('btnCadRegen');
  const cadViewport       = document.getElementById('cadViewport');
  const cadViewportPlaceholder = document.getElementById('cadViewportPlaceholder');
  const cadSourceEditor   = document.getElementById('cadSourceEditor');
  const btnCadRunSource   = document.getElementById('btnCadRunSource');
  const btnCadCopySource  = document.getElementById('btnCadCopySource');
  const btnCadWireframe   = document.getElementById('btnCadWireframe');
  const btnCadResetView   = document.getElementById('btnCadResetView');
  const btnCadDownloadScad = document.getElementById('btnCadDownloadScad');
  const btnCadDownloadStl  = document.getElementById('btnCadDownloadStl');
  const btnCadDownloadJson = document.getElementById('btnCadDownloadJson');
  const btnCadNewProject  = document.getElementById('btnCadNewProject');
  const btnCadSaveProject = document.getElementById('btnCadSaveProject');
  const btnCadOpenProject = document.getElementById('btnCadOpenProject');
  const btnCadLibrary     = document.getElementById('btnCadLibrary');
  const cadLibraryOverlay = document.getElementById('cadLibraryOverlay');
  const btnCadLibraryClose = document.getElementById('btnCadLibraryClose');
  const cadLibraryGrid    = document.getElementById('cadLibraryGrid');
  const cadModelSelect    = document.getElementById('cadModelSelect');


  window.btnCAD = btnCAD;
  window.cadSourceEditorEl = cadSourceEditor;
  if (!btnCAD || !cadModalOverlay) return;

  // Same curated catalog as the code editor AI panel (NVIDIA NIM + Groq, Oct 2026)
  // ★ = completely free with high daily/minute limits on the free tier
  const CAD_MODEL_CATALOG = [
    // ── NVIDIA NIM ──────────────────────────────────────────────────────────
    { id: 'deepseek-ai/deepseek-v4.1-flash',           name: 'NVIDIA - DeepSeek V4.1 Flash',            provider: 'NVIDIA NIM' },
    { id: 'deepseek-ai/deepseek-r1',                  name: 'NVIDIA - DeepSeek R1 (Reasoning)',        provider: 'NVIDIA NIM' },
    { id: 'meta/llama-4-maverick-17b-128e-instruct',  name: 'NVIDIA - Llama 4 Maverick 17Bx128E',     provider: 'NVIDIA NIM' },
    { id: 'meta/llama-4-scout-17b-16e-instruct',      name: 'NVIDIA - Llama 4 Scout 17Bx16E',         provider: 'NVIDIA NIM' },
    { id: 'meta/llama-3.3-70b-instruct',              name: 'NVIDIA - Llama 3.3 70B Instruct',        provider: 'NVIDIA NIM' },
    { id: 'qwen/qwen3-32b',                           name: 'NVIDIA - Qwen3 32B ★ FREE',              provider: 'NVIDIA NIM' },
    { id: 'moonshotai/kimi-k2',                       name: 'NVIDIA - Kimi K2 1T MoE ★ FREE',         provider: 'NVIDIA NIM' },
    { id: 'microsoft/phi-4-mini-instruct',            name: 'NVIDIA - Phi-4 Mini ★ FREE fast',        provider: 'NVIDIA NIM' },
    { id: 'nvidia/nemotron-3.5-lightning-30b-a3b',     name: 'NVIDIA - Nemotron 3.5 Lightning',        provider: 'NVIDIA NIM' },
    // ── Groq ────────────────────────────────────────────────────────────────
    { id: 'openai/gpt-oss-120b',                      name: 'Groq - GPT-OSS 120B (~500 tok/s)',       provider: 'Groq' },
    { id: 'openai/gpt-oss-20b',                       name: 'Groq - GPT-OSS 20B',                    provider: 'Groq' },
    { id: 'groq/compound',                            name: 'Groq - Compound',                       provider: 'Groq' },
    { id: 'groq/compound-mini',                       name: 'Groq - Compound Mini',                  provider: 'Groq' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct',name: 'Groq - Llama 4 Scout 17B ★ FREE fast',  provider: 'Groq' },
    { id: 'llama-3.3-70b-versatile',                  name: 'Groq - Llama 3.3 70B ★ FREE',           provider: 'Groq' },
    { id: 'deepseek-r1-distill-llama-70b',            name: 'Groq - DeepSeek R1 Distill 70B ★ FREE', provider: 'Groq' },
    { id: 'llama-3.1-8b-instant',                     name: 'Groq - Llama 3.1 8B ★ FREE ~560tok/s',  provider: 'Groq' },
  ];
  const CAD_DEFAULT_MODEL = 'deepseek-ai/deepseek-v4.1-flash';

  function seedCadModelSelect(models) {
    if (!cadModelSelect) return;
    cadModelSelect.innerHTML = '';
    const groups = {};
    const order = [];
    models.forEach(m => {
      const groupName = m.provider || 'Other';
      if (!groups[groupName]) {
        groups[groupName] = document.createElement('optgroup');
        groups[groupName].label = groupName;
        order.push(groupName);
      }
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      groups[groupName].appendChild(opt);
    });
    order.forEach(g => cadModelSelect.appendChild(groups[g]));
    const hasDefault = models.some(m => m.id === CAD_DEFAULT_MODEL);
    cadModelSelect.value = hasDefault ? CAD_DEFAULT_MODEL : (models[0] ? models[0].id : '');
  }
  seedCadModelSelect(CAD_MODEL_CATALOG);
  (async () => {
    try {
      const resp = await fetch('/api/ai/models');
      if (!resp.ok) return;
      const models = await resp.json();
      if (Array.isArray(models) && models.length) {
        const prev = cadModelSelect ? cadModelSelect.value : '';
        seedCadModelSelect(models);
        if (prev && cadModelSelect && [...cadModelSelect.options].some(o => o.value === prev)) {
          cadModelSelect.value = prev;
        }
      }
    } catch (_) { /* keep static catalog */ }
  })();

  function getCadModel() {
    return (cadModelSelect && cadModelSelect.value) || CAD_DEFAULT_MODEL;
  }

  let activeCADLoop = null;
  let cadAbortController = null;

  function setCadWorking(isWorking) {
    if (!btnCadGenerate) return;
    if (isWorking) {
      btnCadGenerate.classList.add('is-working');
      btnCadGenerate.title = 'AI is working Click to stop';
      btnCadGenerate.setAttribute('aria-label', 'Stop CAD');
    } else {
      btnCadGenerate.classList.remove('is-working');
      btnCadGenerate.title = 'Generate CAD (Enter)';
      btnCadGenerate.setAttribute('aria-label', 'Generate CAD');
    }
  }

  function stopCadAI() {
    if (cadAbortController) {
      try { cadAbortController.abort(); } catch (_) {}
      cadAbortController = null;
    }
    if (activeCADLoop && activeCADLoop.isActive) {
      activeCADLoop.abort();
    }
    setCadWorking(false);
  }

  /** Authoritative parser for OpenSCAD WASM compiler error messages */
  function parseOpenSCADError(errorMsg, scadCode) {
    if (!errorMsg) errorMsg = '';
    let errType = 'OpenSCADCompileError';
    let errLine = null;
    let cleanMsg = errorMsg;

    const lineMatch = errorMsg.match(/line\s+(\d+)/i) || errorMsg.match(/input\.scad:(\d+)/i);
    if (lineMatch) {
      errLine = parseInt(lineMatch[1], 10);
    }

    if (/syntax\s+error|parser\s+error/i.test(errorMsg)) {
      errType = 'SyntaxError';
    } else if (/undef\s+variable/i.test(errorMsg)) {
      errType = 'UndefinedVariable';
    } else if (/ignoring unknown module|not defined|unknown module/i.test(errorMsg)) {
      errType = 'UndefinedModule';
    } else if (/recursion\s+depth/i.test(errorMsg)) {
      errType = 'RecursionDepthError';
    } else if (/manifold|cgal|polygon\s+not\s+closed|empty\s+or\s+invalid/i.test(errorMsg)) {
      errType = 'ManifoldCSGError';
    }

    const lines = errorMsg.split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (/^(ERROR|WARNING|CGAL error|OpenSCAD compile failed)/i.test(trimmed)) {
        cleanMsg = trimmed;
        break;
      }
    }

    let snippet = '';
    if (errLine && scadCode) {
      const codeLines = scadCode.split('\n');
      const start = Math.max(0, errLine - 3);
      const end = Math.min(codeLines.length, errLine + 2);
      snippet = codeLines.slice(start, end).map((l, i) => {
        const lineNo = start + i + 1;
        const marker = lineNo === errLine ? ' >> ' : '    ';
        return `${marker}${lineNo}: ${l}`;
      }).join('\n');
    }

    return {
      errorType,
      errorLine,
      cleanMessage: cleanMsg,
      snippet,
      fullStderr: errorMsg
    };
  }
  window.parseOpenSCADError = parseOpenSCADError;

  /** Stream /api/ai/chat (same NVIDIA/Groq backend as the code editor). */
  async function streamCadAI(messages) {
    cadAbortController = new AbortController();
    const resp = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: cadAbortController.signal,
      body: JSON.stringify({
        model: getCadModel(),
        context: 'cad',
        messages
      })
    });

    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (!resp.ok || ct.includes('application/json')) {
      let errMsg = 'AI provider unavailable';
      try {
        const errBody = await resp.json();
        if (errBody && errBody.error) errMsg = errBody.error;
      } catch (_) {}
      throw new Error(errMsg);
    }

    let text = '';
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            text += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || '';
          } catch (_) {}
        }
      }
    }
    return text;
  }


  //  Studio State 
  let currentSpec    = null;   // structured design spec JSON
  let currentScad    = '';     // OpenSCAD source code string
  let currentStlData = null;   // Uint8Array STL binary (if compiled)
  let cadScene       = null;   // Three.js scene
  let cadCamera      = null;
  let cadRenderer    = null;
  let cadControls    = null;
  let cadMesh        = null;
  let cadPartMeshes  = [];     // per-part meshes for assembly color-coding
  let cadWireframe   = false;
  let cadAnimId      = null;
  let createOpenSCADFn = null; // named export from openscad-wasm (cached)
  let openscadLoading = false;
  let cadLibsInjected = false; // track whether mechanical libraries are loaded into WASM FS
  // Use latest openscad-wasm with Manifold geometry engine support
  const OPENSCAD_CDN_PRIMARY  = 'https://cdn.jsdelivr.net/npm/openscad-wasm@0.3.0/openscad.js';
  const OPENSCAD_CDN_FALLBACK = 'https://cdn.jsdelivr.net/npm/openscad-wasm@0.0.4/openscad.js';

  //  Mechanical Standard Libraries (bundled into WASM FS) 
  // These are loaded once and injected into every OpenSCAD WASM instance
  // so the AI can write: include </lib/gears.scad>; include </lib/threads.scad>;
  const CAD_LIBRARIES = {};   // { '/lib/gears.scad': '...source...' }
  const CAD_LIB_URLS = {
    '/lib/gears.scad':   'https://raw.githubusercontent.com/openscad/MCAD/master/gears.scad',
    '/lib/involute_gears.scad': 'https://raw.githubusercontent.com/chrisspen/gears/master/gears.scad',
    '/lib/threads.scad': 'https://raw.githubusercontent.com/rcolyer/threads-scad/master/threads.scad',
  };

  // Pre-fetch mechanical libraries in background so they are ready when needed
  (async function preloadCadLibraries() {
    for (const [path, url] of Object.entries(CAD_LIB_URLS)) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          CAD_LIBRARIES[path] = await resp.text();
        }
      } catch (_) { /* silently skip  inline fallbacks exist */ }
    }
    // Always ensure critical built-in gear/thread stubs exist as fallback
    if (!CAD_LIBRARIES['/lib/gears.scad']) {
      CAD_LIBRARIES['/lib/gears.scad'] = CAD_BUILTIN_GEARS;
    }
    if (!CAD_LIBRARIES['/lib/threads.scad']) {
      CAD_LIBRARIES['/lib/threads.scad'] = CAD_BUILTIN_THREADS;
    }
    CAD_LIBRARIES['/lib/fasteners.scad'] = CAD_BUILTIN_FASTENERS;
    CAD_LIBRARIES['/lib/bearings.scad']  = CAD_BUILTIN_BEARINGS;
    CAD_LIBRARIES['/lib/pcb.scad']       = CAD_BUILTIN_PCB;
  })();

  //  Built-in mechanical library stubs (used as fallback / always available) 
  const CAD_BUILTIN_GEARS = `
// Involute Gear Library  RUN01 CAD Studio Built-in
// Based on OpenSCAD MCAD gears.scad (LGPL)
function involute(base_radius, involute_angle) =
  base_radius * [cos(involute_angle) + involute_angle * sin(involute_angle),
                 sin(involute_angle) - involute_angle * cos(involute_angle)];

function involute_intersect_angle(base_radius, radius) =
  sqrt(pow(radius/base_radius,2) - 1) * 180/PI;

module gear_tooth_2d(pitch_radius, base_radius, outer_radius, root_radius, half_thick_angle) {
  pitch_to_base_angle  = involute_intersect_angle(base_radius, pitch_radius);
  pitch_to_outer_angle = involute_intersect_angle(base_radius, min(outer_radius, base_radius * 1.001));
  step = (pitch_to_outer_angle - pitch_to_base_angle) / 5;
  polygon(concat(
    [root_radius * [cos(-half_thick_angle - 0.001), sin(-half_thick_angle - 0.001)]],
    [for(i=[0:5]) let(a=pitch_to_base_angle + i*step)
      involute(base_radius, a) * [cos(-half_thick_angle - pitch_to_base_angle + a),
                                   sin(-half_thick_angle - pitch_to_base_angle + a)]],
    [for(i=[5:-1:0]) let(a=pitch_to_base_angle + i*step)
      involute(base_radius, a) * [cos(half_thick_angle + pitch_to_base_angle - a),
                                   sin(half_thick_angle + pitch_to_base_angle - a)]],
    [root_radius * [cos(half_thick_angle + 0.001), sin(half_thick_angle + 0.001)]]
  ));
}

// Main parametric involute gear module
// m  = module (tooth size in mm, e.g. 1, 1.5, 2, 2.5, 3)
// n  = number of teeth
// h  = face width (thickness)
// pa = pressure angle (standard = 20 degrees)
// bore_d = bore diameter
module gear(m=2, n=20, h=10, pa=20, bore_d=6, $fn=64) {
  pitch_radius = m * n / 2;
  base_radius  = pitch_radius * cos(pa);
  outer_radius = pitch_radius + m;
  root_radius  = pitch_radius - 1.25 * m;
  half_thick   = 90 / n;
  difference() {
    union() {
      cylinder(r=root_radius, h=h, $fn=$fn);
      for(i=[0:n-1]) rotate([0,0,i*360/n])
        linear_extrude(h) gear_tooth_2d(pitch_radius, base_radius, outer_radius, root_radius, half_thick);
    }
    if(bore_d > 0) translate([0,0,-0.5]) cylinder(d=bore_d, h=h+1, $fn=max(16,round($fn/2)));
  }
}

// Helical gear (helix_angle in degrees, e.g. 15-30)
module helical_gear(m=2, n=20, h=15, pa=20, helix_angle=20, bore_d=6, $fn=64) {
  pitch_radius = m * n / 2;
  base_radius  = pitch_radius * cos(pa);
  outer_radius = pitch_radius + m;
  root_radius  = pitch_radius - 1.25 * m;
  half_thick   = 90 / n;
  twist = tan(helix_angle) * h / pitch_radius * 180 / PI;
  difference() {
    union() {
      cylinder(r=root_radius, h=h, $fn=$fn);
      for(i=[0:n-1]) rotate([0,0,i*360/n])
        linear_extrude(h, twist=twist) gear_tooth_2d(pitch_radius, base_radius, outer_radius, root_radius, half_thick);
    }
    if(bore_d > 0) translate([0,0,-0.5]) cylinder(d=bore_d, h=h+1, $fn=max(16,round($fn/2)));
  }
}

// Rack (linear gear), for rack-and-pinion mechanisms
// m=module, n=number_of_teeth, h=height, thickness=depth
module rack(m=2, n=10, h=10, thickness=5) {
  for(i=[0:n-1]) translate([i*PI*m, 0, 0])
    linear_extrude(h)
    polygon([[0,0],[PI*m,0],[PI*m - m*0.7, m*1.1],[m*0.7, m*1.1]]);
  cube([n*PI*m, thickness, h]);
}

// Bevel gear (simplified, for 90-degree shafts)
module bevel_gear(m=2, n=20, h=10, cone_angle=45, bore_d=6, $fn=48) {
  pitch_radius = m * n / 2;
  difference() {
    cylinder(r1=pitch_radius + m, r2=0, h=pitch_radius * tan(cone_angle), $fn=$fn);
    translate([0,0,-0.5]) cylinder(d=bore_d, h=pitch_radius * tan(cone_angle)+1, $fn=max(16,$fn/2));
  }
}
`;

  const CAD_BUILTIN_THREADS = `
// Metric Thread Library  RUN01 CAD Studio Built-in
// Generates ISO metric external and internal threads
// pitch = thread pitch in mm (e.g. M6 = 1.0, M8 = 1.25, M10 = 1.5, M12 = 1.75, M16 = 2.0, M20 = 2.5)

// Thread pitch table (standard coarse threads)
function metric_thread_pitch(d) =
  d <= 3  ? 0.5  :
  d <= 4  ? 0.7  :
  d <= 5  ? 0.8  :
  d <= 6  ? 1.0  :
  d <= 8  ? 1.25 :
  d <= 10 ? 1.5  :
  d <= 12 ? 1.75 :
  d <= 16 ? 2.0  :
  d <= 20 ? 2.5  :
  d <= 24 ? 3.0  :
  d <= 30 ? 3.5  :
  d <= 36 ? 4.0  : 4.5;

// External (male) metric thread
// d = nominal diameter, h = length, pitch = thread pitch (0 = auto from standard)
module metric_thread(d=6, h=20, pitch=0, $fn=32) {
  p = pitch > 0 ? pitch : metric_thread_pitch(d);
  r = d / 2;
  turns = h / p;
  union() {
    cylinder(d=d - p*0.6495*2, h=h, $fn=$fn);
    for(i=[0:floor(turns)]) {
      translate([0, 0, i*p])
      linear_extrude(p, twist=-360, slices=max(8, round($fn/4)))
      polygon([[r - p*0.6495, 0], [r, p*0.3], [r, p*0.7], [r - p*0.6495, p]]);
    }
  }
}

// Internal (female) thread  use inside difference() to cut thread into a hole
module metric_thread_hole(d=6, h=20, pitch=0, $fn=32) {
  p = pitch > 0 ? pitch : metric_thread_pitch(d);
  r = d / 2;
  turns = h / p;
  union() {
    cylinder(d=d, h=h, $fn=$fn);
    for(i=[0:floor(turns)]) {
      translate([0, 0, i*p])
      linear_extrude(p, twist=-360, slices=max(8, round($fn/4)))
      polygon([[r, 0], [r + p*0.5, p*0.3], [r + p*0.5, p*0.7], [r, p]]);
    }
  }
}
`;

  const CAD_BUILTIN_FASTENERS = `
// Standard Fasteners Library  RUN01 CAD Studio Built-in
// ISO metric fasteners: bolts, nuts, washers, screws
include </lib/threads.scad>;

// Hex bolt head dimensions (ISO 4014 / DIN 931)
function hex_bolt_head_w(d) = d <= 6 ? d*1.7 : d <= 10 ? d*1.65 : d*1.6;
function hex_bolt_head_h(d) = d <= 6 ? d*0.65 : d*0.64;

// ISO Hex Bolt (M2 through M36)
// d=nominal_diameter, l=length (under head), grade=8.8 typical
module hex_bolt(d=8, l=30, $fn=24) {
  w = hex_bolt_head_w(d);
  hh = hex_bolt_head_h(d);
  // Head
  cylinder(d=w, h=hh, $fn=6);
  // Shank with thread
  translate([0,0,hh]) metric_thread(d=d, h=l);
}

// ISO Hex Nut (M2 through M36)
module hex_nut(d=8, $fn=24) {
  p = metric_thread_pitch(d);
  w = hex_bolt_head_w(d);
  h = d * 0.8;
  difference() {
    cylinder(d=w, h=h, $fn=6);
    translate([0,0,-0.5]) metric_thread_hole(d=d, h=h+1, $fn=$fn);
  }
}

// ISO Flat Washer
module washer(d=8, $fn=32) {
  od = d * 2.2;
  h  = d * 0.15;
  difference() {
    cylinder(d=od, h=h, $fn=$fn);
    translate([0,0,-0.5]) cylinder(d=d*1.1, h=h+1, $fn=$fn);
  }
}

// Socket Head Cap Screw (ISO 4762 / DIN 912)
module socket_head_screw(d=6, l=25, $fn=32) {
  hh = d;
  // Head
  cylinder(d=d*1.5, h=hh, $fn=$fn);
  // Allen key socket
  translate([0,0,hh*0.3]) cylinder(d=d*0.6, h=hh*0.8, $fn=6);
  // Shank
  translate([0,0,hh]) metric_thread(d=d, h=l, $fn=$fn);
}

// Countersunk flat head screw (ISO 10642)
module csk_screw(d=6, l=25, $fn=32) {
  hh = d * 0.6;
  cylinder(d1=d*2, d2=d, h=hh, $fn=$fn);
  translate([0,0,hh]) metric_thread(d=d, h=l, $fn=$fn);
}
`;

  const CAD_BUILTIN_BEARINGS = `
// Rolling Element Bearings Library  RUN01 CAD Studio Built-in
// Standard ISO 15 deep groove ball bearings (6000 series)

// 6000 series dimensions [bore_d, outer_d, width, chamfer]
function bearing_6000_dims(code) =
  code == 6000 ? [10, 26, 8, 0.3] :
  code == 6001 ? [12, 28, 8, 0.3] :
  code == 6002 ? [15, 32, 9, 0.3] :
  code == 6003 ? [17, 35, 10, 0.3] :
  code == 6004 ? [20, 42, 12, 0.6] :
  code == 6005 ? [25, 47, 12, 0.6] :
  code == 6006 ? [30, 55, 13, 1.0] :
  code == 6007 ? [35, 62, 14, 1.0] :
  code == 6008 ? [40, 68, 15, 1.0] :
  code == 6200 ? [10, 30, 9, 0.6] :
  code == 6201 ? [12, 32, 10, 0.6] :
  code == 6202 ? [15, 35, 11, 0.6] :
  code == 6203 ? [17, 40, 12, 0.6] :
  code == 6204 ? [20, 47, 14, 1.0] :
  code == 6205 ? [25, 52, 15, 1.0] :
  code == 6206 ? [30, 62, 16, 1.0] :
  code == 6207 ? [35, 72, 17, 1.5] :
  code == 6208 ? [40, 80, 18, 1.5] :
  [20, 47, 14, 1.0]; // default 6204

// Deep groove ball bearing
// bearing_code: 6000, 6001 ... 6207, 6208
module ball_bearing(bearing_code=6204, $fn=48) {
  dims = bearing_6000_dims(bearing_code);
  bore_d = dims[0]; outer_d = dims[1]; width = dims[2];
  ball_d = (outer_d - bore_d) / 2 * 0.6;
  race_r = (bore_d + outer_d) / 4;
  difference() {
    union() {
      // Outer race
      difference() {
        cylinder(d=outer_d, h=width, $fn=$fn);
        translate([0,0,-0.5]) cylinder(d=outer_d - (outer_d-bore_d)*0.25, h=width+1, $fn=$fn);
      }
      // Inner race
      difference() {
        cylinder(d=bore_d + (outer_d-bore_d)*0.25, h=width, $fn=$fn);
        translate([0,0,-0.5]) cylinder(d=bore_d, h=width+1, $fn=$fn);
      }
      // Balls
      translate([0,0,width/2])
      for(i=[0:7]) rotate([0,0,i*45])
        translate([race_r, 0, 0]) sphere(d=ball_d, $fn=12);
    }
    // Center bore
    translate([0,0,-0.5]) cylinder(d=bore_d, h=width+1, $fn=$fn);
  }
}

// Bearing housing (press-fit bore for standard bearing)
module bearing_housing(bearing_code=6204, wall=5, $fn=48) {
  dims = bearing_6000_dims(bearing_code);
  outer_d = dims[1]; width = dims[2];
  difference() {
    cylinder(d=outer_d + 2*wall, h=width + 2, $fn=$fn);
    translate([0,0,-0.5]) cylinder(d=outer_d, h=width+3, $fn=$fn);
  }
}
`;

  // PCB Design Library -- RUN01 CAD Studio Built-in
  // Accurate IPC-7351B component footprints and PCB stackup
  const CAD_BUILTIN_PCB = `
// PCB Design Library -- RUN01 CAD Studio
// Standards: IPC-7351B footprints, IPC-2221 board specs, IEC 60063 component values
// All dimensions in millimeters

// ============================================================
// PCB BOARD OUTLINE
// ============================================================

// Standard FR4 PCB board with copper layers and soldermask
// w=width, d=depth, copper_oz=copper weight (1oz=35um), corner_r=fillet radius
module pcb_board(w=100, d=80, copper_oz=1, corner_r=2, $fn=24) {
  fr4_h    = 1.6;
  copper_h = copper_oz * 0.035;
  sm_h     = 0.025;
  color([0.08, 0.35, 0.12])
  hull() {
    for(px=[corner_r, w-corner_r], py=[corner_r, d-corner_r])
      translate([px, py, 0]) cylinder(r=corner_r, h=fr4_h, $fn=$fn);
  }
  color([0.80, 0.55, 0.20])
  translate([0, 0, fr4_h])
  hull() {
    for(px=[corner_r, w-corner_r], py=[corner_r, d-corner_r])
      translate([px, py, 0]) cylinder(r=corner_r, h=copper_h, $fn=$fn);
  }
  color([0.80, 0.55, 0.20])
  translate([0, 0, -copper_h])
  hull() {
    for(px=[corner_r, w-corner_r], py=[corner_r, d-corner_r])
      translate([px, py, 0]) cylinder(r=corner_r, h=copper_h, $fn=$fn);
  }
  color([0.05, 0.28, 0.10, 0.85])
  translate([0, 0, fr4_h + copper_h])
  hull() {
    for(px=[corner_r, w-corner_r], py=[corner_r, d-corner_r])
      translate([px, py, 0]) cylinder(r=corner_r, h=sm_h, $fn=$fn);
  }
}

// PCB mounting hole (M3 non-plated)
module pcb_mounting_hole(d=3.2, copper_ring=0.5, $fn=32) {
  fr4_h = 1.6;
  translate([0, 0, -0.05]) cylinder(d=d, h=fr4_h+0.1, $fn=$fn);
  if(copper_ring > 0) {
    color([0.80, 0.55, 0.20])
    difference() {
      translate([0,0,fr4_h]) cylinder(d=d + 2*copper_ring, h=0.035, $fn=$fn);
      translate([0,0,fr4_h-0.05]) cylinder(d=d, h=0.1, $fn=$fn);
    }
  }
}

// Place 4-corner mounting holes
module pcb_mounting_holes(w, d, margin=3.5, hole_d=3.2) {
  for(px=[margin, w-margin], py=[margin, d-margin])
    translate([px, py, 0]) pcb_mounting_hole(d=hole_d);
}

// ============================================================
// PCB TRACES AND VIAS
// ============================================================

// Straight PCB trace
// w=trace_width: 0.1mm min, 0.15mm fine, 0.25mm signal, 0.5-2mm power
module pcb_trace(l=10, w=0.25, layer=1) {
  z = layer > 0 ? 1.6 : -0.035;
  color([0.80, 0.55, 0.20])
  translate([0, -w/2, z]) cube([l, w, 0.035]);
}

// Via -- plated through-hole connecting layers
// drill_d: 0.2mm micro-via, 0.3mm standard, 0.5mm+ large
module pcb_via(drill_d=0.3, annular=0.15, $fn=16) {
  fr4_h = 1.6;
  copper_d = drill_d + 2*annular;
  color([0.80, 0.55, 0.20]) {
    translate([0,0,-0.035]) cylinder(d=drill_d, h=fr4_h+0.07, $fn=$fn);
    translate([0,0,fr4_h]) cylinder(d=copper_d, h=0.035, $fn=$fn);
    translate([0,0,-0.035]) cylinder(d=copper_d, h=0.035, $fn=$fn);
  }
}

// Copper pour zone
module pcb_copper_pour(w=10, d=10, layer=1) {
  z = layer > 0 ? 1.6 : -0.035;
  color([0.80, 0.55, 0.20, 0.7])
  translate([0, 0, z]) cube([w, d, 0.035]);
}

// ============================================================
// SMD PADS
// ============================================================

module smd_pad(pw=1.5, pd=1.8, layer=1) {
  z = layer > 0 ? 1.6 : -0.035;
  color([0.90, 0.70, 0.25])
  translate([-pw/2, -pd/2, z]) cube([pw, pd, 0.035]);
}

module smd_pad_soldered(pw=1.5, pd=1.8, solder_h=0.12) {
  smd_pad(pw, pd);
  color([0.80, 0.80, 0.82])
  translate([-pw/2, -pd/2, 1.635]) cube([pw, pd, solder_h]);
}

module pth_pad(drill_d=0.8, pad_d=1.6, $fn=24) {
  fr4_h = 1.6;
  translate([0,0,-0.05]) cylinder(d=drill_d, h=fr4_h+0.1, $fn=$fn);
  color([0.90, 0.70, 0.25]) {
    difference() {
      translate([0,0,fr4_h]) cylinder(d=pad_d, h=0.035, $fn=$fn);
      translate([0,0,fr4_h-0.05]) cylinder(d=drill_d, h=0.1, $fn=$fn);
    }
    difference() {
      translate([0,0,-0.035]) cylinder(d=pad_d, h=0.035, $fn=$fn);
      translate([0,0,-0.06]) cylinder(d=drill_d, h=0.1, $fn=$fn);
    }
  }
}

// ============================================================
// SMD PASSIVE COMPONENTS (IEC 60063 / EIA case codes)
// ============================================================

// Case code dimensions [length, width, height]
function smd_dims(code) =
  code == "0201" ? [0.60, 0.30, 0.23] :
  code == "0402" ? [1.00, 0.50, 0.35] :
  code == "0603" ? [1.60, 0.80, 0.45] :
  code == "0805" ? [2.00, 1.25, 0.50] :
  code == "1206" ? [3.20, 1.60, 0.55] :
  code == "1210" ? [3.20, 2.50, 0.55] :
  code == "2512" ? [6.30, 3.20, 0.55] :
  [1.60, 0.80, 0.45];

// SMD resistor with body, end caps, pads
module smd_resistor(case_code="0603") {
  dims = smd_dims(case_code);
  l=dims[0]; w=dims[1]; h=dims[2];
  pw = l*0.3; pd = w*0.9;
  color([0.85, 0.85, 0.80]) translate([-l/2,-w/2,1.6]) cube([l,w,h]);
  color([0.80, 0.80, 0.82]) {
    translate([-l/2,-w/2,1.6]) cube([pw,w,h]);
    translate([l/2-pw,-w/2,1.6]) cube([pw,w,h]);
  }
  smd_pad_soldered(pw=pw*0.9, pd=pd);
  translate([l-pw,0,0]) smd_pad_soldered(pw=pw*0.9, pd=pd);
  color([0.3,0.3,0.3]) translate([-l*0.1,-w/2+0.05,1.6+h-0.02]) cube([l*0.2,w-0.1,0.02]);
}

// SMD MLCC capacitor
module smd_capacitor(case_code="0603") {
  dims = smd_dims(case_code);
  l=dims[0]; w=dims[1]; h=dims[2]*0.9;
  pw = l*0.3; pd = w*0.9;
  color([0.92,0.88,0.75]) translate([-l/2,-w/2,1.6]) cube([l,w,h]);
  color([0.80,0.80,0.82]) {
    translate([-l/2,-w/2,1.6]) cube([pw,w,h]);
    translate([l/2-pw,-w/2,1.6]) cube([pw,w,h]);
  }
  smd_pad_soldered(pw=pw*0.9, pd=pd);
  translate([l-pw,0,0]) smd_pad_soldered(pw=pw*0.9, pd=pd);
}

// SMD electrolytic capacitor
module smd_elco(d=6.3, h=7.7, pitch=2.2) {
  color([0.50,0.50,0.55]) translate([0,0,1.6]) cylinder(d=d,h=h,$fn=32);
  color([0.95,0.95,0.95]) translate([-d/2-0.1,-d/2,1.6]) cube([d*0.25,d,h*0.8]);
  smd_pad_soldered(pw=1.5,pd=1.5);
  translate([pitch,0,0]) smd_pad_soldered(pw=1.5,pd=1.5);
}

// SMD diode SOD-123
module smd_diode_sod123() {
  color([0.15,0.15,0.15]) translate([-1.8,-0.85,1.6]) cube([2.8,1.7,1.2]);
  color([0.80,0.80,0.82]) translate([0.8,-0.85,1.6]) cube([0.5,1.7,1.2]);
  smd_pad_soldered(pw=0.9,pd=1.4);
  translate([2.7,0,0]) smd_pad_soldered(pw=0.9,pd=1.4);
}

// SMD LED (0805)
module smd_led(color_rgb=[0.2,0.8,0.2]) {
  color([0.85,0.85,0.80]) translate([-1.0,-0.625,1.6]) cube([2.0,1.25,0.8]);
  color(color_rgb,0.7) translate([-0.6,-0.55,2.35]) cube([1.2,1.1,0.1]);
  smd_pad_soldered(pw=0.7,pd=1.0);
  translate([1.8,0,0]) smd_pad_soldered(pw=0.7,pd=1.0);
}

// ============================================================
// SMD IC PACKAGES
// ============================================================

// SOT-23 (3-pin transistor / LDO)
module sot23() {
  color([0.15,0.15,0.15]) translate([-1.45,-0.65,1.6]) cube([2.9,1.3,1.0]);
  color([0.80,0.80,0.82]) {
    translate([-0.95,0.65,1.6]) cube([0.5,0.5,0.04]);
    translate([0.45,0.65,1.6])  cube([0.5,0.5,0.04]);
    translate([0,-1.15,1.6])    cube([0.5,0.5,0.04]);
  }
  translate([-0.95,0.9,0]) smd_pad_soldered(pw=0.6,pd=1.2);
  translate([0.45,0.9,0])  smd_pad_soldered(pw=0.6,pd=1.2);
  translate([0,-1.4,0])    smd_pad_soldered(pw=0.6,pd=1.2);
}

// SOIC-8 (8-pin, 1.27mm pitch)
module soic8(pitch=1.27, body_w=3.9) {
  body_l=pitch*4-0.5; body_h=1.75;
  pw=0.6; pd=1.8; ow=body_w+2.0;
  color([0.12,0.12,0.12]) translate([-body_l/2,-body_w/2,1.6]) cube([body_l,body_w,body_h]);
  color([0.90,0.90,0.90]) translate([-body_l/2+0.3,-body_w/2+0.3,1.6+body_h]) cylinder(d=0.4,h=0.05,$fn=8);
  color([0.80,0.80,0.82])
  for(i=[0:3]) {
    translate([-pitch*1.5+i*pitch,-ow/2,1.6]) cube([0.4,1.1,0.18]);
    translate([-pitch*1.5+i*pitch, body_w/2,1.6]) cube([0.4,1.1,0.18]);
  }
  for(i=[0:3]) {
    translate([-pitch*1.5+i*pitch,-body_w/2-1.2,0]) smd_pad_soldered(pw=pw,pd=pd);
    translate([-pitch*1.5+i*pitch, body_w/2+1.2,0]) smd_pad_soldered(pw=pw,pd=pd);
  }
}

// SOIC-16
module soic16(pitch=1.27, body_w=3.9) {
  body_l=pitch*8-0.5; body_h=1.75; pw=0.6; pd=1.8; ow=body_w+2.0;
  color([0.12,0.12,0.12]) translate([-body_l/2,-body_w/2,1.6]) cube([body_l,body_w,body_h]);
  color([0.90,0.90,0.90]) translate([-body_l/2+0.3,-body_w/2+0.3,1.6+body_h]) cylinder(d=0.4,h=0.05,$fn=8);
  color([0.80,0.80,0.82])
  for(i=[0:7]) {
    translate([-pitch*3.5+i*pitch,-ow/2,1.6]) cube([0.4,1.1,0.18]);
    translate([-pitch*3.5+i*pitch, body_w/2,1.6]) cube([0.4,1.1,0.18]);
  }
  for(i=[0:7]) {
    translate([-pitch*3.5+i*pitch,-body_w/2-1.2,0]) smd_pad_soldered(pw=pw,pd=pd);
    translate([-pitch*3.5+i*pitch, body_w/2+1.2,0]) smd_pad_soldered(pw=pw,pd=pd);
  }
}

// QFP (Quad Flat Package): n_pins total, body_size in mm, pitch in mm
module qfp(n_pins=44, body_size=10, pitch=0.8, body_h=1.4) {
  pps = n_pins/4; span=(pps-1)*pitch;
  pw=pitch*0.55; pd=1.5; ow=body_size+2.0;
  color([0.12,0.12,0.12]) translate([-body_size/2,-body_size/2,1.6]) cube([body_size,body_size,body_h]);
  color([0.90,0.90,0.90]) translate([-body_size/2+0.4,-body_size/2+0.4,1.6+body_h]) cylinder(d=0.5,h=0.05,$fn=8);
  color([0.80,0.80,0.82])
  for(i=[0:pps-1]) {
    translate([-span/2+i*pitch,-ow/2,1.6]) cube([pitch*0.6,1.0,0.15]);
    translate([-span/2+i*pitch, body_size/2,1.6]) cube([pitch*0.6,1.0,0.15]);
    translate([-ow/2,-span/2+i*pitch,1.6]) cube([1.0,pitch*0.6,0.15]);
    translate([body_size/2,-span/2+i*pitch,1.6]) cube([1.0,pitch*0.6,0.15]);
  }
  for(i=[0:pps-1]) {
    translate([-span/2+i*pitch,-body_size/2-1.5,0]) smd_pad_soldered(pw=pw,pd=pd);
    translate([-span/2+i*pitch, body_size/2+1.5,0]) smd_pad_soldered(pw=pw,pd=pd);
    translate([-body_size/2-1.5,-span/2+i*pitch,0]) smd_pad_soldered(pw=pd,pd=pw);
    translate([ body_size/2+1.5,-span/2+i*pitch,0]) smd_pad_soldered(pw=pd,pd=pw);
  }
}

// QFN (Quad Flat No-lead)
module qfn(n_pins=16, body_size=4, pitch=0.65, body_h=0.9) {
  pps=n_pins/4; span=(pps-1)*pitch; pw=pitch*0.5; pd=0.7; ep=body_size-0.8;
  color([0.12,0.12,0.12]) translate([-body_size/2,-body_size/2,1.6]) cube([body_size,body_size,body_h]);
  color([0.90,0.70,0.25]) translate([-ep/2,-ep/2,1.6]) cube([ep,ep,0.035]);
  for(i=[0:pps-1]) {
    translate([-span/2+i*pitch,-body_size/2-0.35,0]) smd_pad_soldered(pw=pw,pd=pd);
    translate([-span/2+i*pitch, body_size/2+0.35,0]) smd_pad_soldered(pw=pw,pd=pd);
    translate([-body_size/2-0.35,-span/2+i*pitch,0]) smd_pad_soldered(pw=pd,pd=pw);
    translate([ body_size/2+0.35,-span/2+i*pitch,0]) smd_pad_soldered(pw=pd,pd=pw);
  }
}

// ============================================================
// THROUGH-HOLE ICs
// ============================================================

// DIP IC: n_pins total, pitch=2.54, row_spacing=7.62 standard
module dip_ic(n_pins=8, row_spacing=7.62, pitch=2.54, body_h=4.0) {
  pps=n_pins/2; body_l=(pps-1)*pitch; body_w=row_spacing-1.5;
  color([0.12,0.12,0.12]) translate([-body_l/2,-body_w/2,1.6]) cube([body_l,body_w,body_h]);
  color([0.80,0.80,0.82])
  for(i=[0:pps-1]) {
    translate([-body_l/2+i*pitch,-row_spacing/2,-3.0]) cylinder(d=0.5,h=4.6,$fn=8);
    translate([-body_l/2+i*pitch, row_spacing/2,-3.0]) cylinder(d=0.5,h=4.6,$fn=8);
  }
  for(i=[0:pps-1]) {
    translate([-body_l/2+i*pitch,-row_spacing/2,0]) pth_pad(drill_d=0.8,pad_d=1.7);
    translate([-body_l/2+i*pitch, row_spacing/2,0]) pth_pad(drill_d=0.8,pad_d=1.7);
  }
}

// ============================================================
// CONNECTORS
// ============================================================

// Pin header (2.54mm pitch)
module pin_header(n=8, rows=1, $fn=8) {
  pitch=2.54; bw=n*pitch-0.1; bd=rows*pitch;
  color([0.12,0.12,0.12]) translate([-bw/2,-bd/2,1.6]) cube([bw,bd,2.5]);
  color([0.80,0.80,0.82])
  for(i=[0:n-1], r=[0:rows-1])
    translate([-bw/2+0.5*pitch+i*pitch,-bd/2+0.5*pitch+r*pitch,-3.0]) cube([0.6,0.6,9.0]);
  for(i=[0:n-1], r=[0:rows-1])
    translate([-bw/2+0.5*pitch+i*pitch,-bd/2+0.5*pitch+r*pitch,0]) pth_pad(drill_d=1.0,pad_d=1.8);
}

// USB Type-C receptacle (SMD)
module usb_type_c() {
  color([0.75,0.75,0.78]) translate([-4.47,-3.675,1.6]) cube([8.94,7.35,3.26]);
  color([0.10,0.10,0.12]) translate([-4.57,-3.2,2.1]) cube([1.5,6.4,2.4]);
  for(y=[-2.89,2.89]) {
    translate([-3.5,y,0]) smd_pad_soldered(pw=2.6,pd=1.2);
    translate([ 2.5,y,0]) smd_pad_soldered(pw=2.6,pd=1.2);
  }
}

// USB Micro-B receptacle
module usb_micro_b() {
  color([0.75,0.75,0.78]) translate([-4.0,-3.75,1.6]) cube([7.2,7.5,2.5]);
  color([0.10,0.10,0.12]) translate([-4.1,-1.5,1.9]) cube([1.2,3.0,1.8]);
  for(i=[-2:2]) translate([i*0.65,-3.75,0]) smd_pad_soldered(pw=0.5,pd=1.5);
  for(x=[-3.5,2.5]) translate([x,0,0]) smd_pad_soldered(pw=1.4,pd=2.4);
}

// RJ45 ethernet
module rj45() {
  color([0.15,0.15,0.18]) translate([-8,-6.75,1.6]) cube([16,13.5,13.5]);
  color([0.08,0.08,0.10]) translate([-6,-6.76,2.6]) cube([12,1,10]);
  for(i=[0:7]) translate([-4.45+i*1.27,-6.0,0]) pth_pad(drill_d=1.0);
  for(x=[-7.5,7.5]) translate([x,0,0]) pth_pad(drill_d=1.5,pad_d=2.5);
}

// ============================================================
// CRYSTALS AND OSCILLATORS
// ============================================================

// SMD crystal (2-pad)
module smd_crystal(case_code="3225") {
  dims = case_code=="5032"?[5.0,3.2,1.1]:case_code=="2016"?[2.0,1.6,0.6]:[3.2,2.5,0.8];
  l=dims[0]; w=dims[1]; h=dims[2];
  color([0.75,0.75,0.78]) translate([-l/2,-w/2,1.6]) cube([l,w,h]);
  smd_pad_soldered(pw=l*0.4,pd=w*0.9);
  translate([l/2,0,0]) smd_pad_soldered(pw=l*0.4,pd=w*0.9);
}

// SMD oscillator (4-pad)
module smd_oscillator() {
  color([0.85,0.82,0.78]) translate([-1.6,-1.25,1.6]) cube([3.2,2.5,1.0]);
  for(cx=[-0.8,0.8], cy=[-0.625,0.625]) translate([cx,cy,0]) smd_pad_soldered(pw=0.8,pd=0.8);
}

// ============================================================
// POWER COMPONENTS
// ============================================================

// SMD inductor (shielded)
module smd_inductor(case_code="0805") {
  dims=smd_dims(case_code); l=dims[0]; w=dims[1]; h=dims[2]+0.5;
  color([0.18,0.18,0.20]) translate([-l/2,-w/2,1.6]) cube([l,w,h]);
  smd_pad_soldered(pw=l*0.35,pd=w*0.9);
  translate([l/2,0,0]) smd_pad_soldered(pw=l*0.35,pd=w*0.9);
}

// TO-220 through-hole regulator
module to220() {
  color([0.12,0.12,0.12]) translate([-5,-3.2,1.6]) cube([10,4.4,4.5]);
  color([0.75,0.75,0.78]) translate([-5,-3.2,6.1]) cube([10,4.4,0.8]);
  color([0.80,0.80,0.82])
  for(i=[-1,0,1]) translate([i*2.54,0,-3]) cylinder(d=0.7,h=4.6,$fn=8);
  for(i=[-1,0,1]) translate([i*2.54,0,0]) pth_pad(drill_d=1.0,pad_d=1.8);
}

// ============================================================
// FIDUCIALS AND SILK
// ============================================================

// Silkscreen label placeholder
module silk_label(w=3, h=1.2) {
  color([0.95,0.95,0.95,0.9]) translate([0,0,1.636]) cube([w,h,0.01]);
}

// Pick-and-place fiducial marker
module fiducial(d=1.0, $fn=24) {
  color([0.90,0.70,0.25]) translate([0,0,1.6]) cylinder(d=d,h=0.035,$fn=$fn);
  color([0.08,0.35,0.12,0.5]) translate([0,0,1.635]) cylinder(d=d*2,h=0.025,$fn=$fn);
}
`;

  //  OpenSCAD WASM Loading 
  // Tries openscad-wasm@0.3.0 (Manifold engine) first, falls back to 0.0.4
  async function ensureCreateOpenSCAD() {
    if (createOpenSCADFn) return createOpenSCADFn;
    if (openscadLoading) {
      while (openscadLoading) await new Promise(r => setTimeout(r, 100));
      if (createOpenSCADFn) return createOpenSCADFn;
      throw new Error('OpenSCAD WASM failed to load');
    }
    openscadLoading = true;
    setStatus('Loading OpenSCAD WASM (Manifold engine)');
    const cdnList = [OPENSCAD_CDN_PRIMARY, OPENSCAD_CDN_FALLBACK];
    let lastErr = null;
    for (const cdn of cdnList) {
      try {
        const mod = await import(cdn);
        const fn = mod.createOpenSCAD || mod.default?.createOpenSCAD || mod.default;
        if (typeof fn !== 'function') {
          const keys = mod && typeof mod === 'object' ? Object.keys(mod).join(',') : typeof mod;
          throw new Error(`Unexpected openscad-wasm exports (${keys || 'none'})`);
        }
        createOpenSCADFn = fn;
        openscadLoading = false;
        setStatus(`OpenSCAD WASM ready (${cdn.includes('0.3') ? 'Manifold' : 'CGAL'} engine)`);
        return createOpenSCADFn;
      } catch (err) {
        lastErr = err;
        setStatus(`Trying fallback WASM`);
      }
    }
    openscadLoading = false;
    createOpenSCADFn = null;
    throw new Error(`OpenSCAD WASM load failed: ${lastErr?.message}`);
  }

  //  Inject mechanical libraries into WASM instance FS 
  function injectLibrariesIntoFS(osc) {
    try {
      // Ensure /lib directory exists
      try { osc.FS.mkdir('/lib'); } catch (_) {}
      for (const [path, source] of Object.entries(CAD_LIBRARIES)) {
        try { osc.FS.writeFile(path, source); } catch (_) {}
      }
    } catch (_) {}
  }

  //  Compile OpenSCAD to STL 
  async function compileScadToSTL(scadCode) {
    const createOpenSCAD = await ensureCreateOpenSCAD();
    let stderr = '';

    // Path 1: low-level FS + callMain with Manifold engine + library injection
    try {
      const api = await createOpenSCAD({
        print: () => {},
        printErr: (msg) => { stderr += String(msg) + '\n'; },
      });
      const osc = api.getInstance ? api.getInstance() : api;
      // Inject mechanical libraries into virtual FS
      injectLibrariesIntoFS(osc);
      try { osc.FS.unlink('/input.scad'); } catch (_) {}
      try { osc.FS.unlink('/output.stl'); } catch (_) {}
      osc.FS.writeFile('/input.scad', scadCode);

      try {
        // Try Manifold engine first (faster, better for complex geometry)
        osc.callMain(['/input.scad', '--enable=manifold', '-o', '/output.stl']);
      } catch (_) {
        // Emscripten often throws on process.exit  ignore if STL was written
      }

      for (const path of ['/output.stl', 'output.stl']) {
        try {
          const stlData = osc.FS.readFile(path);
          if (stlData && stlData.length >= 80) {
            return stlData instanceof Uint8Array ? stlData : new Uint8Array(stlData);
          }
        } catch (_) {}
      }
    } catch (e) {
      stderr += (e && e.message ? e.message : String(e)) + '\n';
    }

    // Path 2: fresh instance + fallback without manifold flag
    try {
      const api2 = await createOpenSCAD({
        print: () => {},
        printErr: (msg) => { stderr += String(msg) + '\n'; },
      });
      const osc2 = api2.getInstance ? api2.getInstance() : api2;
      injectLibrariesIntoFS(osc2);
      try { osc2.FS.unlink('/input.scad'); } catch (_) {}
      try { osc2.FS.unlink('/output.stl'); } catch (_) {}
      osc2.FS.writeFile('/input.scad', scadCode);
      try {
        osc2.callMain(['/input.scad', '-o', '/output.stl']);
      } catch (_) {}
      let stlText = null;
      try {
        stlText = osc2.FS.readFile('/output.stl', { encoding: 'utf8' });
      } catch (_) {
        try {
          const bin = osc2.FS.readFile('/output.stl');
          if (bin && bin.length >= 80) {
            return bin instanceof Uint8Array ? bin : new Uint8Array(bin);
          }
        } catch (_) {}
      }
      if (stlText && String(stlText).length > 80) {
        return new TextEncoder().encode(String(stlText));
      }
    } catch (e) {
      stderr += (e && e.message ? e.message : String(e)) + '\n';
    }

    throw new Error('OpenSCAD compile failed:\n' + (stderr.trim() || 'Empty or invalid STL output'));
  }

  //  Modal open / close 
  function openCADModal() {
    cadModalOverlay.classList.remove('hidden');
    initThreeViewport();
  }

  function closeCADModal() {
    cadModalOverlay.classList.add('hidden');
    if (cadAnimId) { cancelAnimationFrame(cadAnimId); cadAnimId = null; }
  }

  btnCAD.addEventListener('click', openCADModal);
  btnCloseCADModal.addEventListener('click', closeCADModal);
  cadModalOverlay.addEventListener('click', (e) => {
    if (e.target === cadModalOverlay) closeCADModal();
  });

  //  Quick-prompt buttons 
  document.querySelectorAll('.cad-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      cadPromptInput.value = btn.dataset.prompt || '';
      cadPromptInput.focus();
    });
  });

  async function handleCadSubmit() {
    if (btnCadGenerate.classList.contains('is-working')) {
      stopCadAI();
      return;
    }
    const rawPrompt = (cadPromptInput ? cadPromptInput.value.trim() : '');
    if (!rawPrompt) {
      if (cadPromptInput) cadPromptInput.focus();
      return;
    }

    // Immediately clear input box so text is not retained
    if (cadPromptInput) {
      cadPromptInput.value = '';
      cadPromptInput.style.height = 'auto';
    }

    // Append user message exactly once to chat
    appendChatMsg('user', rawPrompt);

    // If an existing design is active, construct revision context
    if (currentSpec && currentScad) {
      const revisionContext =
        `REVISION of an existing parametric OpenSCAD design.\n\n` +
        `Current specification JSON:\n${JSON.stringify(currentSpec, null, 2)}\n\n` +
        `Current OpenSCAD source:\n${currentScad}\n\n` +
        `Requested change: ${rawPrompt}\n\n` +
        `Produce an UPDATED specification that applies the change while keeping unrelated parameters stable.`;
      await generateCAD(revisionContext, rawPrompt);
    } else {
      await generateCAD(rawPrompt, rawPrompt);
    }
  }

  btnCadGenerate.addEventListener('click', handleCadSubmit);

  if (cadPromptInput) {
    cadPromptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleCadSubmit();
      }
    });
  }

  //  Three.js Viewport 
  function initThreeViewport() {
    if (cadRenderer) return; // already initialized
    if (!window.THREE) { cadStatusBar.textContent = 'Three.js not loaded  refresh and try again.'; return; }

    const THREE = window.THREE;

    cadScene    = new THREE.Scene();
    cadScene.background = new THREE.Color(0x111318);
    cadScene.fog = new THREE.FogExp2(0x111318, 0.003);

    cadCamera   = new THREE.PerspectiveCamera(40, cadViewport.clientWidth / cadViewport.clientHeight, 0.1, 20000);
    cadCamera.position.set(120, 90, 160);

    cadRenderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    cadRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    cadRenderer.setSize(cadViewport.clientWidth, cadViewport.clientHeight);
    cadRenderer.shadowMap.enabled = true;
    cadRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    cadRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    cadRenderer.toneMappingExposure = 1.1;
    cadViewport.appendChild(cadRenderer.domElement);

    // Ground grid + shadow receiver plane
    const grid = new THREE.GridHelper(400, 40, 0x1a2030, 0x141820);
    grid.position.y = -0.5;
    cadScene.add(grid);

    const floorGeo = new THREE.PlaneGeometry(600, 600);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 1.0, metalness: 0.0 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.6;
    floor.receiveShadow = true;
    cadScene.add(floor);

    //  5-point studio lighting for realistic metal rendering 
    // Key light (main, warm white, casts shadows)
    const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.0);
    keyLight.position.set(150, 200, 100);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width  = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far  = 1000;
    keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -200;
    keyLight.shadow.camera.right = keyLight.shadow.camera.top = 200;
    keyLight.shadow.bias = -0.001;
    cadScene.add(keyLight);

    // Fill light (cool blue-white, opposite side)
    const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.6);
    fillLight.position.set(-120, 80, -80);
    cadScene.add(fillLight);

    // Rim / back light (creates edge highlight on metal)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(-60, 120, -180);
    cadScene.add(rimLight);

    // Top light (simulates workshop overhead)
    const topLight = new THREE.DirectionalLight(0xe8f0ff, 0.5);
    topLight.position.set(0, 300, 0);
    cadScene.add(topLight);

    // Ambient (global fill  keeps shadows from going pitch black)
    const ambient = new THREE.AmbientLight(0x304060, 0.8);
    cadScene.add(ambient);

    // Hemisphere light (sky/ground gradient)
    const hemi = new THREE.HemisphereLight(0x405070, 0x1a1a2e, 0.4);
    cadScene.add(hemi);

    // Orbit controls (inline  no import needed, Three.js is loaded globally)
    cadControls = initOrbitControls(cadCamera, cadRenderer.domElement);

    // Animate
    function animate() {
      cadAnimId = requestAnimationFrame(animate);
      if (cadControls && cadControls.update) cadControls.update();
      cadRenderer.render(cadScene, cadCamera);
    }
    animate();

    // Resize
    new ResizeObserver(() => {
      const w = cadViewport.clientWidth;
      const h = cadViewport.clientHeight;
      if (!w || !h) return;
      cadCamera.aspect = w / h;
      cadCamera.updateProjectionMatrix();
      cadRenderer.setSize(w, h);
    }).observe(cadViewport);
  }

  // Minimal orbit controls without importing OrbitControls module
  function initOrbitControls(camera, domEl) {
    let isDragging = false, lastX = 0, lastY = 0;
    let phi = Math.PI / 4, theta = Math.PI / 4, radius = 200;
    const target = { x: 0, y: 20, z: 0 };

    function updateCamera() {
      camera.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta);
      camera.lookAt(target.x, target.y, target.z);
    }
    updateCamera();

    domEl.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      theta += dx * 0.005; phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * 0.005));
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    });
    domEl.addEventListener('wheel', e => {
      radius = Math.max(10, Math.min(1000, radius + e.deltaY * 0.3));
      updateCamera(); e.preventDefault();
    }, { passive: false });
    // Touch support
    let lastTouchDist = 0;
    domEl.addEventListener('touchstart', e => {
      if (e.touches.length === 1) { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
      if (e.touches.length === 2) { lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    });
    domEl.addEventListener('touchend', () => { isDragging = false; });
    domEl.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
        theta += dx * 0.005; phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * 0.005));
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        updateCamera();
      }
      if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        radius = Math.max(10, Math.min(1000, radius - (dist - lastTouchDist) * 0.5));
        lastTouchDist = dist; updateCamera();
      }
      e.preventDefault();
    }, { passive: false });

    return { update: () => {}, reset: () => { phi = Math.PI / 4; theta = Math.PI / 4; radius = 200; updateCamera(); } };
  }

  //  STL Parser + Three.js mesh rendering 
  function loadSTLIntoViewport(stlBuffer, materialPreset) {
    if (!window.THREE || !cadScene) return;
    const THREE = window.THREE;
    const geometry = parseSTLBinary(stlBuffer);

    // Remove old meshes
    if (cadMesh) { cadScene.remove(cadMesh); cadMesh.geometry.dispose(); cadMesh.material.dispose(); cadMesh = null; }
    cadPartMeshes.forEach(m => { cadScene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    cadPartMeshes = [];

    // Compute smooth normals for realistic rendering
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    // PBR material presets based on design type
    const matPresets = {
      steel:    { color: 0x8a9bb0, roughness: 0.25, metalness: 0.90 },
      aluminum: { color: 0xb8c8d8, roughness: 0.20, metalness: 0.85 },
      iron:     { color: 0x6a7a8a, roughness: 0.45, metalness: 0.80 },
      brass:    { color: 0xc8a855, roughness: 0.30, metalness: 0.88 },
      rubber:   { color: 0x222222, roughness: 0.95, metalness: 0.00 },
      plastic:  { color: 0x4a90d9, roughness: 0.60, metalness: 0.05 },
      default:  { color: 0x7aa2f7, roughness: 0.35, metalness: 0.60 },
    };

    // Auto-detect material from spec type or use override
    let preset = matPresets.default;
    if (materialPreset && matPresets[materialPreset]) preset = matPresets[materialPreset];
    else if (currentSpec) {
      const t = (currentSpec.type || '').toLowerCase();
      if (t.includes('mechanical') || t.includes('powertrain')) preset = matPresets.steel;
      else if (t.includes('architectural') || t.includes('structural')) preset = matPresets.aluminum;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: preset.color,
      roughness: preset.roughness,
      metalness: preset.metalness,
      side: THREE.DoubleSide,
      envMapIntensity: 1.2,
    });
    cadMesh = new THREE.Mesh(geometry, mat);
    cadMesh.castShadow = true;
    cadMesh.receiveShadow = true;

    // Center and scale model to fit viewport
    const box = geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    cadMesh.position.sub(center);
    cadMesh.scale.setScalar(100 / maxDim);

    cadScene.add(cadMesh);

    // Show dimension overlay in status bar
    const dimStr = `${size.x.toFixed(1)}  ${size.y.toFixed(1)}  ${size.z.toFixed(1)} mm`;
    const triCount = (geometry.attributes.position.count / 3).toFixed(0);
    setStatus(`[OK] ${(stlBuffer.length / 1024).toFixed(0)} KB STL  ${triCount} triangles  ${dimStr}`);

    // Hide placeholder
    if (cadViewportPlaceholder) cadViewportPlaceholder.style.display = 'none';

    currentStlData = stlBuffer;
    if (cadControls && cadControls.reset) cadControls.reset();
  }

  function parseSTLBinary(buffer) {
    const THREE = window.THREE;
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer.buffer || buffer);
    // ASCII STL fallback (starts with "solid")
    const head = String.fromCharCode(...u8.slice(0, Math.min(80, u8.length)));
    if (/^solid\s/i.test(head) && !head.includes('\0')) {
      return parseSTLAscii(new TextDecoder().decode(u8));
    }
    const geometry = new THREE.BufferGeometry();
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const triCount = view.getUint32(80, true);
    if (triCount <= 0 || 84 + triCount * 50 > u8.byteLength) {
      throw new Error('Invalid binary STL triangle count');
    }
    const positions = new Float32Array(triCount * 9);
    const normals   = new Float32Array(triCount * 9);
    let offset = 84;
    for (let i = 0; i < triCount; i++) {
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      offset += 12;
      for (let v = 0; v < 3; v++) {
        positions[i * 9 + v * 3]     = view.getFloat32(offset, true);
        positions[i * 9 + v * 3 + 1] = view.getFloat32(offset + 4, true);
        positions[i * 9 + v * 3 + 2] = view.getFloat32(offset + 8, true);
        normals[i * 9 + v * 3]     = nx;
        normals[i * 9 + v * 3 + 1] = ny;
        normals[i * 9 + v * 3 + 2] = nz;
        offset += 12;
      }
      offset += 2; // attribute byte count
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    return geometry;
  }

  function parseSTLAscii(text) {
    const THREE = window.THREE;
    const positions = [];
    const normals = [];
    const facetRe = /facet\s+normal\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)([\s\S]*?)endfacet/g;
    const vertRe = /vertex\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/g;
    let m;
    while ((m = facetRe.exec(text))) {
      const nx = parseFloat(m[1]), ny = parseFloat(m[2]), nz = parseFloat(m[3]);
      const block = m[4];
      const verts = [];
      let vm;
      while ((vm = vertRe.exec(block))) {
        verts.push(parseFloat(vm[1]), parseFloat(vm[2]), parseFloat(vm[3]));
      }
      vertRe.lastIndex = 0;
      if (verts.length >= 9) {
        for (let i = 0; i < 9; i++) positions.push(verts[i]);
        for (let i = 0; i < 3; i++) normals.push(nx, ny, nz);
      }
    }
    if (!positions.length) throw new Error('ASCII STL contained no triangles');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    return geometry;
  }

  // ── AI Two-Stage CAD Generation ───────────────────────────
  async function generateCAD(generationPrompt, userGoalText) {
    const prompt = (typeof generationPrompt === 'string' && generationPrompt.trim())
      ? generationPrompt.trim()
      : (cadPromptInput ? cadPromptInput.value.trim() : '');
    if (!prompt) return;

    btnCadGenerate.disabled = true;
    setStatus('Stage 1: Generating CAD specification…');

    const specSystemPrompt = `You are a senior mechanical and electronics engineer and CAD specialist with 20+ years of experience in automotive, aerospace, industrial design, and PCB/mechatronics engineering.
When the user describes a 3D object, mechanical assembly, or circuit board, you MUST respond with ONLY valid JSON  no markdown, no explanation, no code fences.

Use this exact schema:
{
  "name": "snake_case_identifier",
  "title": "Human Readable Title",
  "type": "mechanical|consumer|architectural|structural|pcb",
  "units": "mm",
  "parameters": {
    "param_name": <number>
  },
  "parts": ["list of discrete parts in the assembly"],
  "features": ["list of all geometric features"],
  "materials": {"part_name": "material"},
  "standards": ["ISO 286", "DIN 931", "IPC-7351B"],
  "constraints": ["geometric validity rules"],
  "libraries": ["gears.scad", "threads.scad", "fasteners.scad", "bearings.scad", "pcb.scad"]
}

ENGINEERING RULES (mandatory):
- Apply realistic ISO/ANSI/IPC dimensions. For gears: use standard modules (m=1, 1.5, 2, 2.5, 3, 4, 5). For threads: use standard pitches (M6x1.0, M8x1.25, M10x1.5, M12x1.75). For bearings: use 6000-series (6004, 6205, 6206, 6207, 6208).
- For PCBs / circuit boards: standard FR4 thickness (1.6mm standard, 0.8mm thin). Standard boards: Arduino Uno (68.58x53.34mm), Raspberry Pi HAT (65x56mm), Eurocard (100x160mm) or custom. Traces: 0.25mm signal, 0.5-2mm power/ground. Component footprints follow IPC-7351B (0402, 0603, 0805, 1206, SOT-23, SOIC-8/16, QFP, QFN). Connectors: USB-C, 2.54mm pin headers. Place M2.5/M3 mounting holes at corners.
- Apply correct fits and tolerances: shaft-to-bore H7/g6 clearance fit (shaft = nominal - 0.01 to -0.029mm for M20), press fits for bearings (H7 hole = +0/+0.021mm for 20mm bore), interference fits for hubs.
- For gears: center_distance = m*(n1+n2)/2, pitch_circle = m*n, addendum = 1*m, dedendum = 1.25*m.
- For car gearboxes: input shaft 20-35mm dia, output shaft 25-40mm dia, gear module 2-3, face width 20-35mm, housing wall 8-12mm, typical ratios: 1st=3.5:1, 2nd=2.0:1, 3rd=1.3:1, 4th=1.0:1, 5th=0.75:1, reverse=3.8:1.
- For bolted joints: use M6-M16 bolts for structural joints, bolt circle diameter 1.5-2.5 flange bore.
- Use 8-20 parameters for complex assemblies; must cover all critical dimensions.
- "libraries" field: list which of these built-in libs to use: gears.scad, threads.scad, fasteners.scad, bearings.scad, pcb.scad.
Output ONLY the JSON object. No other text.`;

    let specJson = null;
    try {
      const rawSpec = await streamCadAI([
        { role: 'system', content: specSystemPrompt },
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = rawSpec.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI did not produce valid JSON specification');
      specJson = JSON.parse(jsonMatch[0]);
    } catch (err) {
      setStatus(`Stage 1 failed: ${err.message}`);
      appendChatMsg('assistant', `[ERROR] Could not generate design specification: ${err.message}`, true);
      btnCadGenerate.disabled = false;
      setCadWorking(false);
      return;
    }

    currentSpec = specJson;
    setStatus('Stage 2: Generating OpenSCAD code');

    const codeSystemPrompt = `You are a master OpenSCAD engineer specializing in complex mechanical assemblies, automotive components, architectural structures, precision mechanisms, and circuit board (PCB) designs.

You have access to these pre-loaded libraries (already in WASM virtual FS  use include to call them):
  include </lib/gears.scad>;        // gear(m, n, h, pa, bore_d), helical_gear(), rack(), bevel_gear()
  include </lib/threads.scad>;      // metric_thread(d, h), metric_thread_hole(d, h), metric_thread_pitch(d)
  include </lib/fasteners.scad>;    // hex_bolt(d, l), hex_nut(d), washer(d), socket_head_screw(d, l), csk_screw(d, l)
  include </lib/bearings.scad>;     // ball_bearing(bearing_code), bearing_housing(bearing_code, wall)
  include </lib/pcb.scad>;          // pcb_board(), pcb_trace(), pcb_via(), smd_resistor(), smd_capacitor(), smd_elco(), smd_diode_sod123(), smd_led(), sot23(), soic8(), soic16(), qfp(), qfn(), dip_ic(), pin_header(), usb_type_c(), usb_micro_b(), rj45(), to220(), smd_crystal(), smd_inductor(), fiducial(), silk_label()

MANDATORY CODE RULES:
1. Output ONLY raw OpenSCAD code. No markdown fences, no prose. The first line must be code.
2. Declare ALL parameters at the very top with realistic ISO/engineering values and comments.
3. Structure as modules  one module per part/component. Call main assembly at the very bottom.
4. ALWAYS use $fn=64 for precision shafts/bores, $fn=48 for housings, $fn=32 for small features.
5. For gears: ALWAYS use the gear() module from /lib/gears.scad. Set m (module) to standard values: 1, 1.5, 2, 2.5, 3.
6. For bolts/nuts/screws: ALWAYS use hex_bolt(), socket_head_screw() etc from /lib/fasteners.scad.
7. For bearings: ALWAYS use ball_bearing(6204) etc from /lib/bearings.scad.
8. For threads: ALWAYS use metric_thread() and metric_thread_hole() from /lib/threads.scad.
9. For PCBs / circuit boards: ALWAYS use include </lib/pcb.scad>;. Start with pcb_board(length, width, thickness). Place components using smd_resistor(), smd_capacitor(), soic8(), qfp(), qfn(), dip_ic(), pin_header(), usb_type_c() etc. Position all components and traces on the top surface (z=thickness). Route signals using pcb_trace() and pcb_via(). Include M2.5/M3 mounting holes and fiducials for pick-and-place.
10. CSG manifold rules: extend all boolean cutters by 0.1mm beyond surfaces (use -0.05 offset + length+0.1).
11. Multi-part assemblies: add explode_factor=0 parameter. When explode_factor>0, translate parts outward for exploded view.
12. Add // [MATERIAL: steel] // [MATERIAL: aluminum] // [MATERIAL: rubber] // [MATERIAL: pcb_fr4] comments on each module for renderer.
13. Realistic proportions are non-negotiable. A car gearbox housing is 300-400mm long, M20 bolt has 30mm head.
14. For large assemblies (gearbox, engine, etc.): produce a complete working assembly with ALL parts  housing, shafts, gears, bearings, seals, fasteners. Do NOT simplify by omitting parts.
15. NEVER produce hollow-geometry or non-manifold faces. Use difference() with 0.1mm extensions on all cutouts.
16. Do NOT write: "Prefer simple geometry". Complex geometry is REQUIRED for accurate mechanical and electronic representation.`;

    const codeUserMsg = `Mechanical Specification:\n${JSON.stringify(specJson, null, 2)}\n\nGenerate complete, production-quality OpenSCAD code for this assembly. Include all parts listed in the spec. Use library modules where applicable. Start with include statements for needed libraries, then parameters, then modules, then the final assembly call.`;

    let scadCode = '';
    try {
      scadCode = await streamCadAI([
        { role: 'system', content: codeSystemPrompt },
        { role: 'user', content: codeUserMsg }
      ]);

      scadCode = scadCode.replace(/^```[\w]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      if (!scadCode) throw new Error('AI produced empty code');
    } catch (err) {
      setStatus(`Stage 2 failed: ${err.message}`);
      appendChatMsg('assistant', `[ERROR] Could not generate OpenSCAD code: ${err.message}`, true);
      btnCadGenerate.disabled = false;
      setCadWorking(false);
      return;
    }

    currentScad = scadCode;
    cadSourceEditor.value = scadCode;

    const paramsSummary = Object.entries(specJson.parameters || {})
      .map(([k, v]) => `${k}: ${v} ${specJson.units || 'mm'}`)
      .join('  ');
    appendChatMsg('assistant',
      `[OK] **${specJson.title || specJson.name}** generated.\n\n` +
      `**Parameters:** ${paramsSummary}\n\n` +
      `**Features:** ${(specJson.features || []).join(', ')}\n\n` +
      `Rendering 3D preview`
    );

    renderParamControls(specJson.parameters || {}, specJson.units || 'mm');

    if (activeCADLoop && activeCADLoop.isActive) {
      activeCADLoop.abort();
    }
    activeCADLoop = new CADAutonomousRepairLoop({
      maxIterations: 4,
      model: getCadModel(),
      chatContainer: cadChatMessages
    });
    await activeCADLoop.start(userGoalText || prompt, scadCode);

    if (cadPromptInput) cadPromptInput.value = '';
    btnCadGenerate.disabled = false;
    setCadWorking(false);
  }

  //  Autonomous CAD Self-Healing Loop Class 
  class CADAutonomousRepairLoop {
    constructor(options = {}) {
      this.maxIterations = options.maxIterations || 4;
      this.model = options.model || getCadModel();
      this.chatContainer = options.chatContainer || cadChatMessages || document.getElementById('aiMessages');
      this.isActive = false;
      this.isAborted = false;
      this.immutableUserGoal = '';
      this.currentIteration = 1;
      this.currentAbortController = null;
      this.cardEl = null;
      this.stepsEl = null;
      this.badgeEl = null;
      this.statusTextEl = null;
      this.stopBtn = null;
    }

    createCard() {
      const card = document.createElement('div');
      card.className = 'ai-loop-card';

      const header = document.createElement('div');
      header.className = 'ai-loop-header';

      const left = document.createElement('div');
      left.className = 'ai-loop-header-left';

      this.badgeEl = document.createElement('span');
      this.badgeEl.className = 'ai-loop-badge running';
      this.badgeEl.textContent = 'AUTO-HEAL';

      this.statusTextEl = document.createElement('span');
      this.statusTextEl.className = 'ai-loop-status-text';
      this.statusTextEl.textContent = 'Active Control: Compiling OpenSCAD WASM';

      left.appendChild(this.badgeEl);
      left.appendChild(this.statusTextEl);

      this.stopBtn = document.createElement('button');
      this.stopBtn.className = 'ai-loop-stop-btn';
      this.stopBtn.textContent = 'Stop Loop';
      this.stopBtn.addEventListener('click', () => this.abort());

      header.appendChild(left);
      header.appendChild(this.stopBtn);

      this.stepsEl = document.createElement('div');
      this.stepsEl.className = 'ai-loop-body';

      card.appendChild(header);
      card.appendChild(this.stepsEl);

      this.cardEl = card;
      if (this.chatContainer) {
        this.chatContainer.appendChild(card);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    addStep(icon, text, type = 'normal', snippet = null) {
      if (!this.stepsEl) return;
      const step = document.createElement('div');
      step.className = `ai-loop-step ${type}`;

      const iconEl = document.createElement('span');
      iconEl.className = 'ai-loop-step-icon';
      iconEl.textContent = icon;

      const textEl = document.createElement('span');
      textEl.innerHTML = text;

      step.appendChild(iconEl);
      step.appendChild(textEl);
      this.stepsEl.appendChild(step);

      if (snippet) {
        const snippetEl = document.createElement('div');
        snippetEl.className = 'ai-loop-error-snippet';
        snippetEl.textContent = snippet;
        this.stepsEl.appendChild(snippetEl);
      }

      if (this.chatContainer) {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    addSummary(text) {
      if (!this.stepsEl) return;
      const sum = document.createElement('div');
      sum.className = 'ai-loop-summary';
      sum.innerHTML = `<span>[DONE]</span><span>${text}</span>`;
      this.stepsEl.appendChild(sum);
      if (this.chatContainer) {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    }

    setEditorActive(active) {
      const badge = document.getElementById('cadActiveControlBadge');
      if (badge) {
        if (active) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
      }
      const pane = document.getElementById('cadSourcePane');
      if (pane) {
        if (active) {
          pane.classList.remove('collapsed');
          pane.classList.add('ai-active-editor');
        } else {
          pane.classList.remove('ai-active-editor');
        }
      }
    }

    applyCodeOrEdit(text) {
      if (!text) return { applied: false, type: 'none' };
      const currentCode = cadSourceEditor.value || currentScad || '';

      // 1. Surgical edits
      const surgicalEdits = (window.parseSurgicalEdits ? window.parseSurgicalEdits(text) : []);
      if (surgicalEdits && surgicalEdits.length > 0) {
        let updated = currentCode;
        let appliedCount = 0;
        for (const edit of surgicalEdits) {
          if (updated.includes(edit.findText)) {
            updated = updated.replace(edit.findText, edit.replaceText);
            appliedCount++;
          }
        }
        if (appliedCount > 0) {
          currentScad = updated;
          cadSourceEditor.value = updated;
          return { applied: true, type: 'surgical', count: appliedCount };
        }
      }

      // 2. Full OpenSCAD code block
      const scadMatch = text.match(/```(?:openscad|scad)?([\s\S]*?)```/);
      let codeToUse = null;
      if (scadMatch && scadMatch[1] && scadMatch[1].trim()) {
        codeToUse = scadMatch[1].trim();
      } else if (text.includes('module') || text.includes('difference()') || text.includes('union()') || text.includes('cube(')) {
        codeToUse = text.replace(/^```(?:openscad|scad)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      }

      if (codeToUse) {
        currentScad = codeToUse;
        cadSourceEditor.value = codeToUse;
        return { applied: true, type: 'full', code: codeToUse };
      }

      return { applied: false, type: 'none' };
    }

    async requestRepair(parsedErr) {
      const currentCode = cadSourceEditor.value || currentScad || '';
      const prompt = `[IMMUTABLE USER GOAL]
${this.immutableUserGoal}

[CURRENT OPENSCAD SOURCE CODE]
\`\`\`openscad
${currentCode}
\`\`\`

[OPENSCAD WASM COMPILE ERROR - RUN #${this.currentIteration}]
Error Type: ${parsedErr.errorType}${parsedErr.errorLine ? ` (Line ${parsedErr.errorLine})` : ''}
Error Summary: ${parsedErr.cleanMessage}
${parsedErr.snippet ? `Failing Code Snippet around Line ${parsedErr.errorLine}:\n${parsedErr.snippet}\n` : ''}
Full Compiler Stderr:
${parsedErr.fullStderr}

[INSTRUCTION]
Perform an exact surgical fix to eliminate this OpenSCAD compile/geometry error while strictly preserving user parameters, dimensions, and other modules.
Output the surgical replacement using this exact format:
<<<SURGICAL_EDIT>>>
<<<FIND>>>
<exact lines currently in code to replace>
<<<REPLACE>>>
<corrected lines>
<<<END_EDIT>>>

If extensive structural rewriting is required, output the complete corrected \`\`\`openscad ... \`\`\` code block instead.`;

      this.currentAbortController = new AbortController();
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this.currentAbortController.signal,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are an authoritative OpenSCAD WASM self-healing repair engineer in RUN01. Fix compile, syntax, undefined variable, or manifold errors with surgical precision to guarantee clean WASM rendering with 0 errors. The WASM virtual FS has these pre-loaded libraries available: /lib/gears.scad (gear, helical_gear, rack, bevel_gear), /lib/threads.scad (metric_thread, metric_thread_hole), /lib/fasteners.scad (hex_bolt, hex_nut, washer, socket_head_screw, csk_screw), /lib/bearings.scad (ball_bearing, bearing_housing), /lib/pcb.scad (pcb_board, pcb_trace, pcb_via, smd_resistor, smd_capacitor, soic8, soic16, qfp, qfn, dip_ic, pin_header, usb_type_c, to220, fiducial). If errors are caused by missing modules, replace manual implementations with these library calls.' },
            { role: 'user', content: prompt }
          ],
          model: this.model,
          context: 'cad'
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `CAD AI repair request failed with code ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let repairResponse = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const rawJson = trimmed.substring(6);
              const parsed = JSON.parse(rawJson);
              const token = parsed.choices?.[0]?.delta?.content || '';
              repairResponse += token;
            } catch (_) {}
          }
        }
      }

      return repairResponse;
    }

    async start(userGoal, initialCode) {
      this.isActive = true;
      this.isAborted = false;
      this.immutableUserGoal = userGoal;
      this.currentIteration = 1;

      this.createCard();
      this.setEditorActive(true);
      setCadWorking(true);

      if (initialCode) {
        const initialApply = this.applyCodeOrEdit(initialCode);
        if (initialApply.applied) {
          if (initialApply.type === 'surgical') {
            this.addStep('[FIX]', `Applied ${initialApply.count} surgical patch(es) to OpenSCAD source.`, 'active');
          } else {
            this.addStep('[CODE]', 'Injected OpenSCAD 3D model source code into editor.', 'active');
          }
        } else {
          this.addStep('[INFO]', 'Reading active OpenSCAD editor source for verification', 'active');
        }
      }

      while (this.isActive && !this.isAborted) {
        if (this.statusTextEl) {
          this.statusTextEl.textContent = `Attempt ${this.currentIteration}/${this.maxIterations}: Compiling with OpenSCAD WASM`;
        }
        setStatus(`Compiling with OpenSCAD WASM (Attempt #${this.currentIteration})`);
        this.addStep('[COMPILE]', `Compiling in OpenSCAD WASM (Attempt #${this.currentIteration})`, 'active');

        let stlData = null;
        let compileError = null;
        const codeToCompile = cadSourceEditor.value || currentScad || '';

        try {
          stlData = await compileScadToSTL(codeToCompile);
        } catch (err) {
          compileError = err;
        }

        if (this.isAborted) {
          this.cleanup();
          return;
        }

        // Clean compilation with 0 errors!
        if (stlData && !compileError) {
          loadSTLIntoViewport(stlData);
          const sizeKb = (stlData.length / 1024).toFixed(0);
          setStatus(`[OK] Rendered ${sizeKb} KB STL (0 Errors)`);
          this.badgeEl.className = 'ai-loop-badge';
          this.badgeEl.textContent = '[DONE] 0 ERRORS';
          if (this.statusTextEl) {
            this.statusTextEl.textContent = `Clean OpenSCAD WASM Compile (0 Errors in ${sizeKb} KB STL)`;
          }
          if (this.stopBtn) this.stopBtn.style.display = 'none';

          this.addStep('[DONE]', `WASM compilation successful with 0 errors. ${sizeKb} KB STL generated.`, 'success');
          this.addSummary(`CAD Studio autonomous self-healing complete. 0 errors.`);
          this.cleanup();
          return;
        }

        // Compile error detected!
        const parsedErr = parseOpenSCADError(compileError ? compileError.message : 'Unknown compile error', codeToCompile);
        const lineText = parsedErr.errorLine ? ` (Line ${parsedErr.errorLine})` : '';

        this.addStep('[WARN]', `Compile error in Run #${this.currentIteration}: <strong>${parsedErr.errorType}</strong>${lineText}`, 'warning', parsedErr.snippet || parsedErr.cleanMessage);
        showCompileError(parsedErr.cleanMessage || compileError.message);

        if (this.currentIteration >= this.maxIterations) {
          this.badgeEl.className = 'ai-loop-badge error';
          this.badgeEl.textContent = 'MAX ATTEMPTS';
          if (this.statusTextEl) {
            this.statusTextEl.textContent = `Halted after ${this.maxIterations} attempts`;
          }
          if (this.stopBtn) this.stopBtn.style.display = 'none';
          this.addStep('[STOP]', `Maximum repair attempts reached. Editor contains latest code for manual adjustment.`, 'warning');
          this.cleanup();
          return;
        }

        // Synthesize surgical fix
        this.badgeEl.className = 'ai-loop-badge healing';
        this.badgeEl.textContent = 'HEALING';
        if (this.statusTextEl) {
          this.statusTextEl.textContent = `Attempt ${this.currentIteration + 1}/${this.maxIterations}: Synthesizing surgical fix`;
        }
        this.addStep('[FIX]', `AI analyzing OpenSCAD error and synthesizing surgical fix`, 'active');

        let repairResponse = '';
        try {
          repairResponse = await this.requestRepair(parsedErr);
        } catch (repairErr) {
          if (this.isAborted) { this.cleanup(); return; }
          this.addStep('[ERROR]', `AI repair request failed: ${repairErr.message}`, 'warning');
          this.cleanup();
          return;
        }

        if (this.isAborted) { this.cleanup(); return; }

        const repairApply = this.applyCodeOrEdit(repairResponse);
        if (repairApply.applied) {
          if (repairApply.type === 'surgical') {
            this.addStep('[DONE]', `Applied surgical patch to OpenSCAD source editor.`, 'active');
          } else {
            this.addStep('[DONE]', `Updated OpenSCAD editor with restructured model geometry.`, 'active');
          }
        } else {
          this.addStep('[WARN]', `Retrying compilation with current source`, 'warning');
        }

        this.currentIteration++;
      }

      this.cleanup();
    }

    abort() {
      this.isAborted = true;
      if (this.currentAbortController) {
        try { this.currentAbortController.abort(); } catch (_) {}
        this.currentAbortController = null;
      }
      if (this.badgeEl) {
        this.badgeEl.className = 'ai-loop-badge error';
        this.badgeEl.textContent = 'STOPPED';
      }
      if (this.statusTextEl) {
        this.statusTextEl.textContent = 'CAD Auto-Heal Stopped by User';
      }
      if (this.stopBtn) this.stopBtn.style.display = 'none';
      this.addStep('[STOP]', 'CAD healing loop aborted by user.', 'warning');
      this.cleanup();
    }

    cleanup() {
      this.isActive = false;
      this.setEditorActive(false);
      setCadWorking(false);
    }
  }
  window.CADAutonomousRepairLoop = CADAutonomousRepairLoop;


  function showCompileError(msg) {
    if (!cadViewportPlaceholder) return;
    cadViewportPlaceholder.style.display = 'flex';
    cadViewportPlaceholder.innerHTML = `
      <div style="color:#f87171;font-family:monospace;font-size:11px;padding:16px;white-space:pre-wrap;text-align:left;max-height:200px;overflow:auto;">
        <b>Compile Error:</b>\n${msg}
      </div>`;
  }

  //  Parameter Controls 
  function renderParamControls(params, units) {
    if (!cadParamsGrid) return;
    cadParamsGrid.innerHTML = '';
    cadParamsPanel.classList.remove('hidden');

    Object.entries(params).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'cad-param-row';

      const label = document.createElement('label');
      label.className = 'cad-param-label';
      label.textContent = key.replace(/_/g, ' ');
      label.htmlFor = `cadp_${key}`;

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'cad-param-input';
      input.id = `cadp_${key}`;
      input.value = value;
      input.step = value >= 10 ? 1 : 0.5;
      input.min = 0.1;

      const unit = document.createElement('span');
      unit.className = 'cad-param-unit';
      unit.textContent = units;

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(unit);
      cadParamsGrid.appendChild(row);

      // Update currentSpec on change
      input.addEventListener('change', () => {
        if (currentSpec && currentSpec.parameters) {
          currentSpec.parameters[key] = parseFloat(input.value) || value;
        }
      });
    });
  }

  // Regenerate from edited parameters
  if (btnCadRegen) {
    btnCadRegen.addEventListener('click', async () => {
      if (!currentSpec || !currentScad) return;
      // Rebuild SCAD code replacing top-level parameter values
      let newScad = currentScad;
      if (currentSpec.parameters) {
        Object.entries(currentSpec.parameters).forEach(([key, val]) => {
          const re = new RegExp(`^(${key}\\s*=\\s*)([\\d.]+)`, 'm');
          newScad = newScad.replace(re, `$1${val}`);
        });
      }
      currentScad = newScad;
      cadSourceEditor.value = newScad;

      if (activeCADLoop && activeCADLoop.isActive) {
        activeCADLoop.abort();
      }
      activeCADLoop = new CADAutonomousRepairLoop({
        maxIterations: 4,
        model: getCadModel(),
        chatContainer: cadChatMessages
      });
      await activeCADLoop.start(`Regenerate with parameters: ${JSON.stringify(currentSpec.parameters)}`, newScad);
    });
  }

  //  Preview from source editor 
  if (btnCadRunSource) {
    btnCadRunSource.addEventListener('click', async () => {
      const code = cadSourceEditor.value.trim();
      if (!code) return;
      currentScad = code;
      setStatus('Compiling with OpenSCAD WASM');
      try {
        const stlData = await compileScadToSTL(code);
        loadSTLIntoViewport(stlData);
        setStatus(`[OK] Compiled cleanly  ${(stlData.length / 1024).toFixed(0)} KB STL (0 Errors)`);
      } catch (err) {
        setStatus('[WARN] Compile error  engaging AI auto-healing loop');
        if (activeCADLoop && activeCADLoop.isActive) {
          activeCADLoop.abort();
        }
        activeCADLoop = new CADAutonomousRepairLoop({
          maxIterations: 4,
          model: getCadModel(),
          chatContainer: cadChatMessages
        });
        activeCADLoop.start('Compile and verify OpenSCAD source', code);
      }
    });
  }

  // Global entry point to launch CAD autonomous self-healing loop
  window.startCADAutonomousLoop = function(userGoal, initialCode, chatContainer) {
    openCADModal();
    if (activeCADLoop && activeCADLoop.isActive) {
      activeCADLoop.abort();
    }
    activeCADLoop = new CADAutonomousRepairLoop({
      maxIterations: 4,
      model: getCadModel(),
      chatContainer: chatContainer || cadChatMessages
    });
    activeCADLoop.start(userGoal, initialCode);
    return activeCADLoop;
  };


  //  Viewport controls 
  if (btnCadWireframe) {
    btnCadWireframe.addEventListener('click', () => {
      if (!cadMesh || !window.THREE) return;
      cadWireframe = !cadWireframe;
      cadMesh.material.wireframe = cadWireframe;
      btnCadWireframe.textContent = cadWireframe ? 'Solid' : 'Wire';
    });
  }

  if (btnCadResetView) {
    btnCadResetView.addEventListener('click', () => {
      if (cadControls && cadControls.reset) cadControls.reset();
    });
  }

  //  Copy source 
  if (btnCadCopySource) {
    btnCadCopySource.addEventListener('click', () => {
      navigator.clipboard.writeText(cadSourceEditor.value || '').then(() => {
        btnCadCopySource.textContent = 'Copied!';
        setTimeout(() => { btnCadCopySource.textContent = 'Copy'; }, 1500);
      });
    });
  }

  //  File downloads 
  function downloadText(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadBinary(filename, data) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function modelBaseName() {
    return (currentSpec && currentSpec.name) ? currentSpec.name : 'model';
  }

  if (btnCadDownloadScad) {
    btnCadDownloadScad.addEventListener('click', () => {
      const code = cadSourceEditor.value || currentScad;
      if (!code) { cadStatusBar.textContent = 'No source to download  generate a model first.'; return; }
      downloadText(`${modelBaseName()}.scad`, code);
    });
  }

  if (btnCadDownloadStl) {
    btnCadDownloadStl.addEventListener('click', () => {
      if (!currentStlData) { cadStatusBar.textContent = 'No STL  compile with Preview first.'; return; }
      downloadBinary(`${modelBaseName()}.stl`, currentStlData);
    });
  }

  //  OBJ Export  convert current Three.js mesh to Wavefront OBJ 
  const btnCadDownloadObj = document.getElementById('btnCadDownloadObj');
  if (btnCadDownloadObj) {
    btnCadDownloadObj.addEventListener('click', () => {
      if (!cadMesh || !window.THREE) { setStatus('No mesh  compile with Preview first.'); return; }
      const geo = cadMesh.geometry;
      const pos = geo.attributes.position;
      const nrm = geo.attributes.normal;
      if (!pos) { setStatus('No geometry to export.'); return; }
      let obj = `# RUN01 CAD Studio  OBJ Export\n# Model: ${modelBaseName()}\n# Triangles: ${pos.count / 3}\no ${modelBaseName()}\n`;
      for (let i = 0; i < pos.count; i++) {
        const scale = cadMesh.scale.x;
        obj += `v ${(pos.getX(i) * scale + cadMesh.position.x).toFixed(4)} ${(pos.getY(i) * scale + cadMesh.position.y).toFixed(4)} ${(pos.getZ(i) * scale + cadMesh.position.z).toFixed(4)}\n`;
      }
      if (nrm) {
        for (let i = 0; i < nrm.count; i++) {
          obj += `vn ${nrm.getX(i).toFixed(4)} ${nrm.getY(i).toFixed(4)} ${nrm.getZ(i).toFixed(4)}\n`;
        }
        for (let i = 0; i < pos.count; i += 3) {
          obj += `f ${i+1}//${i+1} ${i+2}//${i+2} ${i+3}//${i+3}\n`;
        }
      } else {
        for (let i = 0; i < pos.count; i += 3) {
          obj += `f ${i+1} ${i+2} ${i+3}\n`;
        }
      }
      downloadText(`${modelBaseName()}.obj`, obj);
      setStatus(`[OK] Exported ${(obj.length / 1024).toFixed(0)} KB OBJ`);
    });
  }

  if (btnCadDownloadJson) {
    btnCadDownloadJson.addEventListener('click', () => {
      if (!currentSpec) { cadStatusBar.textContent = 'No design spec  generate a model first.'; return; }
      downloadText(`${modelBaseName()}.json`, JSON.stringify(currentSpec, null, 2));
    });
  }

  //  IndexedDB Project Storage 
  const DB_NAME = 'run01_cad_projects';
  const DB_VER  = 1;
  const STORE   = 'projects';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  if (btnCadSaveProject) {
    btnCadSaveProject.addEventListener('click', async () => {
      if (!currentSpec && !currentScad) { cadStatusBar.textContent = 'Nothing to save  generate a model first.'; return; }
      const name = currentSpec?.title || currentSpec?.name || 'Untitled';
      const project = {
        id:           `proj_${Date.now()}`,
        name,
        engine:       'openscad',
        specification: currentSpec,
        source:        cadSourceEditor.value || currentScad,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString()
      };
      try {
        const db = await openDB();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(project);
        cadStatusBar.textContent = `[OK] Saved "${name}" to browser storage`;
      } catch (err) {
        cadStatusBar.textContent = `[ERROR] Save failed: ${err.message}`;
      }
    });
  }

  if (btnCadOpenProject) {
    btnCadOpenProject.addEventListener('click', async () => {
      try {
        const db = await openDB();
        const tx = db.transaction(STORE, 'readonly');
        const all = await new Promise((res, rej) => {
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = e => res(e.target.result);
          req.onerror   = e => rej(e.target.error);
        });

        if (all.length === 0) { cadStatusBar.textContent = 'No saved projects found.'; return; }

        // Simple picker using prompt (can be replaced with a real modal later)
        const names = all.map((p, i) => `${i + 1}. ${p.name} (${new Date(p.updated_at).toLocaleDateString()})`).join('\n');
        const choice = window.prompt(`Saved projects:\n${names}\n\nEnter number to open:`);
        if (!choice) return;

        const idx = parseInt(choice) - 1;
        if (idx < 0 || idx >= all.length) { cadStatusBar.textContent = 'Invalid selection.'; return; }

        const project = all[idx];
        currentSpec = project.specification;
        currentScad = project.source;
        cadSourceEditor.value = project.source;
        if (currentSpec && currentSpec.parameters) {
          renderParamControls(currentSpec.parameters, currentSpec.units || 'mm');
        }
        cadStatusBar.textContent = `Opened "${project.name}"  click Preview to compile`;
        appendChatMsg('assistant', `[OPEN] Opened project: **${project.name}**\n\nSource loaded into editor. Click **Preview** to compile.`);
      } catch (err) {
        cadStatusBar.textContent = `[ERROR] Open failed: ${err.message}`;
      }
    });
  }

  if (btnCadNewProject) {
    btnCadNewProject.addEventListener('click', () => {
      currentSpec = null; currentScad = ''; currentStlData = null;
      cadSourceEditor.value = '';
      cadParamsPanel.classList.add('hidden');
      if (cadMesh && cadScene) { cadScene.remove(cadMesh); cadMesh.geometry.dispose(); cadMesh.material.dispose(); cadMesh = null; }
      if (cadViewportPlaceholder) { cadViewportPlaceholder.style.display = 'flex'; cadViewportPlaceholder.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><p>3D model will appear here</p>`; }
      cadChatMessages.innerHTML = `<div class="cad-chat-msg cad-chat-system"><div class="cad-chat-bubble"><strong>AI CAD Studio</strong><br>New project. Describe the 3D object you want to create.</div></div>`;
      cadStatusBar.textContent = 'Ready  enter a description and click Generate';
    });
  }


  // ── Curated CAD Dataset Library ─────────────────────────────────────────
  let cadDatasetCache = null;
  let activeLibraryTab = 'all';

  async function fetchCadDataset() {
    if (cadDatasetCache) return cadDatasetCache;
    try {
      const resp = await fetch('/api/cad/dataset');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      cadDatasetCache = await resp.json();
      return cadDatasetCache;
    } catch (err) {
      console.warn('[CAD Library] Failed to fetch dataset catalog:', err);
      return null;
    }
  }

  function renderCadLibrary(catalog) {
    if (!cadLibraryGrid) return;
    if (!catalog || !catalog.datasets) {
      cadLibraryGrid.innerHTML = '<div class="cad-library-loading">Failed to load datasets. Please try again.</div>';
      return;
    }

    const mechanical = catalog.datasets.mechanical || [];
    const electrical = catalog.datasets.electrical || [];
    let items = [];
    if (activeLibraryTab === 'all') items = [...mechanical, ...electrical];
    else if (activeLibraryTab === 'mechanical') items = mechanical;
    else if (activeLibraryTab === 'electrical') items = electrical;

    if (!items.length) {
      cadLibraryGrid.innerHTML = '<div class="cad-library-loading">No models found in this category.</div>';
      return;
    }

    cadLibraryGrid.innerHTML = items.map(m => {
      const isMech = m.category === 'mechanical';
      const badgeClass = isMech ? 'mechanical' : 'electrical';
      const badgeLabel = isMech ? 'Mechanical' : 'Electrical';
      const dim = m.dimensions ? (m.dimensions.diameter ? `Ø${m.dimensions.diameter}×${m.dimensions.height || m.dimensions.length}mm` : `${m.dimensions.length}×${m.dimensions.width}×${m.dimensions.height || m.dimensions.thickness}mm`) : '';
      const sizeKb = m.stl_size_bytes ? `${Math.round(m.stl_size_bytes / 1024)} KB` : '';
      const featuresStr = (m.features || []).slice(0, 3).map(f => `• ${f}`).join('<br>');

      return `
        <div class="cad-card" data-id="${m.id}" data-category="${m.category}">
          <div class="cad-card-header">
            <div class="cad-card-title">${m.title}</div>
            <span class="cad-card-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="cad-card-meta">
            ${dim ? `<span>📏 ${dim}</span>` : ''}
            ${sizeKb ? `<span>💾 ${sizeKb}</span>` : ''}
            ${m.parts_count ? `<span>🧩 ${m.parts_count} parts</span>` : ''}
          </div>
          <div class="cad-card-features">${featuresStr}</div>
          <button class="cad-card-btn" data-id="${m.id}" data-category="${m.category}">Load Model</button>
        </div>
      `;
    }).join('');

    // Attach click listeners to cards and load buttons
    cadLibraryGrid.querySelectorAll('.cad-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = card.dataset.id;
        const category = card.dataset.category;
        loadDatasetModel(category, id);
      });
    });
  }

  async function openCadLibrary() {
    if (!cadLibraryOverlay) return;
    cadLibraryOverlay.classList.remove('hidden');
    const catalog = await fetchCadDataset();
    renderCadLibrary(catalog);
  }

  function closeCadLibrary() {
    if (cadLibraryOverlay) cadLibraryOverlay.classList.add('hidden');
  }

  async function loadDatasetModel(category, modelId) {
    closeCadLibrary();
    const catalog = await fetchCadDataset();
    if (!catalog || !catalog.datasets) return;
    const list = catalog.datasets[category] || [];
    const model = list.find(m => m.id === modelId);
    if (!model) return;

    setStatus(`Loading ${model.title}...`);
    try {
      // 1. Fetch spec.json
      let spec = null;
      try {
        const sResp = await fetch(model.spec_url);
        if (sResp.ok) spec = await sResp.json();
      } catch (e) {
        console.warn('Failed to load spec.json:', e);
      }

      // 2. Fetch model.scad
      let scadCode = '';
      try {
        const scResp = await fetch(model.scad_url);
        if (scResp.ok) scadCode = await scResp.text();
      } catch (e) {
        console.warn('Failed to load model.scad:', e);
      }

      // 3. Fetch model.stl (binary)
      const stlResp = await fetch(model.stl_url);
      if (!stlResp.ok) throw new Error(`Failed to fetch STL: HTTP ${stlResp.status}`);
      const stlBuffer = await stlResp.arrayBuffer();

      // Ensure Three.js viewport is initialized
      initThreeViewport();

      // Set current state
      currentSpec = spec || {
        title: model.title,
        category: model.category,
        type: model.type,
        dimensions: model.dimensions,
        parameters: model.parameters,
        features: model.features,
        standards: model.standards
      };
      currentScad = scadCode;
      cadSourceEditor.value = scadCode;

      // Render parameters panel
      if (currentSpec && currentSpec.parameters) {
        renderParamControls(currentSpec.parameters, (currentSpec.units || 'mm'));
      }

      // Render in Three.js viewport
      loadSTLIntoViewport(stlBuffer, model.default_material || 'steel');

      // Append assistant chat confirmation
      appendChatMsg('assistant',
        `[DATASET] **Loaded: ${model.title}**\n\n` +
        `• **Category**: ${model.category.toUpperCase()}\n` +
        `• **Source File**: \`${model.source_file}\`\n` +
        `• **Engineering Standards**: ${(model.standards || []).join(', ') || 'ISO / DIN'}\n` +
        `• **Component Count**: ${model.parts_count || 'N/A'}\n\n` +
        `The 3D model is rendered in the viewport and full parametric OpenSCAD source is in the editor.\n` +
        `You can use the parameter sliders or prompt AI to edit and enhance this design!`
      );
    } catch (err) {
      console.error('Failed to load dataset model:', err);
      setStatus(`[ERROR] Load failed: ${err.message}`);
      appendChatMsg('assistant', `[ERROR] Failed to load ${model.title}: ${err.message}`, true);
    }
  }

  if (btnCadLibrary) {
    btnCadLibrary.addEventListener('click', openCadLibrary);
  }
  if (btnCadLibraryClose) {
    btnCadLibraryClose.addEventListener('click', closeCadLibrary);
  }
  if (cadLibraryOverlay) {
    cadLibraryOverlay.addEventListener('click', (e) => {
      if (e.target === cadLibraryOverlay) closeCadLibrary();
    });
  }

  // Library category tab switching
  document.querySelectorAll('.cad-lib-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cad-lib-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeLibraryTab = tab.dataset.tab || 'all';
      if (cadDatasetCache) renderCadLibrary(cadDatasetCache);
    });
  });

  //  Chat helpers 

  function appendChatMsg(role, text, isError = false) {
    if (!cadChatMessages) return;
    const msg = document.createElement('div');
    msg.className = `cad-chat-msg cad-chat-${role}${isError ? ' cad-chat-error' : ''}`;
    const bubble = document.createElement('div');
    bubble.className = 'cad-chat-bubble';
    // Simple markdown-ish rendering
    bubble.innerHTML = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    msg.appendChild(bubble);
    cadChatMessages.appendChild(msg);
    cadChatMessages.scrollTop = cadChatMessages.scrollHeight;
  }

  function setStatus(msg) {
    if (cadStatusBar) cadStatusBar.textContent = msg;
  }

})();

// 
// VISION STUDIO  Video Computer Vision Panel
// Browser-first: ONNX Runtime Web (YOLOv8)  zero server cost
// 
(function initVisionStudio() {
  'use strict';

  //  Palette definitions 
  const PALETTES = {
    default: ['#9B5CF6','#F97316','#EC4899','#10B981','#3B82F6','#EAB308','#EF4444','#06B6D4','#8B5CF6','#84CC16','#F59E0B','#14B8A6'],
    neon:    ['#FF00FF','#00FFFF','#00FF00','#FFFF00','#FF6600','#FF0099','#00FF99','#9900FF','#0099FF','#FF9900','#FF0033','#33FF00'],
    pastel:  ['#FFB3BA','#FFDFBA','#FFFFBA','#BAFFC9','#BAE1FF','#D4BAFF','#FFB3E6','#B3FFE6','#FFE4B3','#B3D4FF','#FFC9BA','#C9FFB3'],
  };

  const COCO_CLASSES = [
    'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat',
    'traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat',
    'dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack',
    'umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball',
    'kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
    'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple',
    'sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair',
    'couch','potted plant','bed','dining table','toilet','tv','laptop','mouse',
    'remote','keyboard','cell phone','microwave','oven','toaster','sink',
    'refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush',
  ];

  // ONNX model CDN URLs
  const MODEL_URLS = {
    detect:  { nano: 'https://huggingface.co/onnx-community/yolov8n/resolve/main/yolov8n.onnx', small: 'https://huggingface.co/onnx-community/yolov8s/resolve/main/yolov8s.onnx', medium: 'https://huggingface.co/onnx-community/yolov8m/resolve/main/yolov8m.onnx' },
    track:   { nano: 'https://huggingface.co/onnx-community/yolov8n/resolve/main/yolov8n.onnx', small: 'https://huggingface.co/onnx-community/yolov8s/resolve/main/yolov8s.onnx', medium: 'https://huggingface.co/onnx-community/yolov8m/resolve/main/yolov8m.onnx' },
    segment: { nano: 'https://huggingface.co/onnx-community/yolov8n-seg/resolve/main/yolov8n-seg.onnx', small: 'https://huggingface.co/onnx-community/yolov8s-seg/resolve/main/yolov8s-seg.onnx', medium: 'https://huggingface.co/onnx-community/yolov8m-seg/resolve/main/yolov8m-seg.onnx' },
    pose:    { nano: 'https://huggingface.co/onnx-community/yolov8n-pose/resolve/main/yolov8n-pose.onnx', small: 'https://huggingface.co/onnx-community/yolov8s-pose/resolve/main/yolov8s-pose.onnx', medium: 'https://huggingface.co/onnx-community/yolov8m-pose/resolve/main/yolov8m-pose.onnx' },
  };

  //  State 
  let videoUrl = null;
  let cameraStream = null;
  let isCameraActive = false;
  let videoMeta = { w: 0, h: 0, duration: 0, fps: 25 };
  let ortSession = null;
  let allResults = [];       // FrameResult[]
  let totalDetections = 0;
  let currentFrame = 0;
  let totalFrames = 0;
  let abortController = null;
  let trackHistory = new Map();  // trackId -> [{x,y}]
  let activeTracks = [];         // [{ id, classId, bbox, lastSeen }]
  let nextTrackId = 1;
  let selectedModelSize = 'nano';
  let selectedPalette = 'default';
  let isProcessing = false;
  let isPlaying = false;

  //  DOM refs 
  const overlay       = document.getElementById('visionModalOverlay');
  const btnOpen       = document.getElementById('btnVision');
  const btnClose      = document.getElementById('btnCloseVisionModal');
  const uploadZone    = document.getElementById('visionUploadZone');
  const fileInput     = document.getElementById('visionFileInput');
  const uploadInfo    = document.getElementById('visionUploadInfo');
  const fileNameEl    = document.getElementById('visionFileName');
  const fileDimsEl    = document.getElementById('visionFileDims');
  const btnClear      = document.getElementById('btnVisionClear');
  const emptyState    = document.getElementById('visionEmptyState');
  const playerWrap    = document.getElementById('visionPlayerWrap');
  const videoEl       = document.getElementById('visionVideo');
  const canvas        = document.getElementById('visionCanvas');
  const ctx           = canvas ? canvas.getContext('2d') : null;
  const scrubber      = document.getElementById('visionScrubber');
  const scrubRange    = document.getElementById('visionScrubberRange');
  const scrubProcessed= document.getElementById('visionScrubberProcessed');
  const scrubberProcessed = scrubProcessed;
  const frameBadge    = document.getElementById('visionFrameBadge');
  const timeDisplay   = document.getElementById('visionTimeDisplay');
  const btnPlay       = document.getElementById('btnVisionPlay');
  const playIcon      = document.getElementById('visionPlayIcon');
  const pauseIcon     = document.getElementById('visionPauseIcon');
  const btnPrev       = document.getElementById('btnVisionPrev');
  const btnNext       = document.getElementById('btnVisionNext');
  const btnRun        = document.getElementById('btnVisionRun');
  const btnExport     = document.getElementById('btnVisionExport');
  const taskSelect    = document.getElementById('visionTask');
  const confSlider    = document.getElementById('visionConf');
  const confLabel     = document.getElementById('visionConfLabel');
  const strideSlider  = document.getElementById('visionStride');
  const strideLabel   = document.getElementById('visionStrideLabel');
  const statusPanel   = document.getElementById('visionStatusPanel');
  const statusText    = document.getElementById('visionStatusText');
  const progressFill  = document.getElementById('visionProgressFill');
  const progressPct   = document.getElementById('visionProgressPct');
  const statusBadge   = document.getElementById('visionStatusBadge');
  const detList       = document.getElementById('visionDetList');
  const detCount      = document.getElementById('visionDetCount');
  const detFooter     = document.getElementById('visionDetFooter');
  const promptInput   = document.getElementById('visionPromptInput');
  if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnRun) btnRun.click();
      }
    });
  }

  if (!overlay || !btnOpen) return; // panel not in DOM

  //  Open / Close 
  function openVisionModal() { overlay.classList.remove('hidden'); }
  function closeVisionModal() {
    overlay.classList.add('hidden');
    stopProcessing();
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
      isCameraActive = false;
    }
    if (videoEl) {
      videoEl.pause();
      videoEl.srcObject = null;
    }
    const btnCam = document.getElementById('btnVisionCamera');
    if (btnCam) {
      btnCam.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> USE LIVE CAMERA';
    }
  }

  window.btnVision = btnOpen;
  window.openVisionModal = openVisionModal;
  window.closeVisionModal = closeVisionModal;
  btnOpen.addEventListener('click', openVisionModal);
  btnClose.addEventListener('click', closeVisionModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeVisionModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeVisionModal(); });

  //  Slider labels 
  if (confSlider) confSlider.addEventListener('input', () => { if (confLabel) confLabel.textContent = confSlider.value + '%'; });
  if (strideSlider) strideSlider.addEventListener('input', () => { if (strideLabel) strideLabel.textContent = 'every ' + strideSlider.value + 'f'; });

  //  Model size pills 
  document.querySelectorAll('.vision-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vision-pill').forEach(b => b.classList.remove('vision-pill-active'));
      btn.classList.add('vision-pill-active');
      selectedModelSize = btn.dataset.size;
      ortSession = null; // reset cached session on size change
    });
  });

  //  Palette pills 
  document.querySelectorAll('.vision-palette-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vision-palette-btn').forEach(b => b.classList.remove('vision-palette-btn-active'));
      btn.classList.add('vision-palette-btn-active');
      selectedPalette = btn.dataset.palette;
      renderCurrentFrame();
    });
  });

  //  Video upload 
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('vision-upload-zone--active'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('vision-upload-zone--active'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('vision-upload-zone--active');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) loadVideoFile(file);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadVideoFile(fileInput.files[0]);
  });

  function loadVideoFile(file) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    videoEl.src = videoUrl;
    videoEl.onloadedmetadata = () => {
      videoMeta.w = videoEl.videoWidth;
      videoMeta.h = videoEl.videoHeight;
      videoMeta.duration = videoEl.duration;
      totalFrames = Math.floor(videoEl.duration * videoMeta.fps);

      // Update info bar
      fileNameEl.textContent = file.name.length > 28 ? file.name.slice(0, 25) + '' : file.name;
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      const dur = formatTime(videoEl.duration);
      fileDimsEl.textContent = videoMeta.w + '' + videoMeta.h + '  ' + dur + '  ' + mb + ' MB';

      uploadZone.classList.add('hidden');
      uploadInfo.classList.remove('hidden');
      emptyState.classList.add('hidden');
      playerWrap.classList.remove('hidden');
      scrubber.classList.remove('hidden');

      scrubRange.max = totalFrames - 1;
      updateScrubberDisplay(0);
      resetResults();
    };
  }

  const btnCamera = document.getElementById('btnVisionCamera');
  if (btnCamera) {
    btnCamera.addEventListener('click', async () => {
      try {
        if (isCameraActive && cameraStream) {
          // Toggle off if already active
          cameraStream.getTracks().forEach(t => t.stop());
          cameraStream = null;
          isCameraActive = false;
          stopProcessing();
          videoEl.pause();
          videoEl.srcObject = null;
          uploadZone.classList.remove('hidden');
          uploadInfo.classList.add('hidden');
          emptyState.classList.remove('hidden');
          playerWrap.classList.add('hidden');
          scrubber.classList.add('hidden');
          btnCamera.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> USE LIVE CAMERA';
          resetResults();
          setStatus('ready', 'READY');
          return;
        }

        if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
        videoEl.src = '';
        setStatus('loading', 'Requesting camera access');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });

        cameraStream = stream;
        isCameraActive = true;
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        await videoEl.play();

        videoMeta.w = videoEl.videoWidth || 1280;
        videoMeta.h = videoEl.videoHeight || 720;
        videoMeta.duration = 0;
        totalFrames = 1000;

        uploadZone.classList.add('hidden');
        uploadInfo.classList.remove('hidden');
        fileNameEl.textContent = 'Live Camera Feed';
        fileDimsEl.textContent = (videoEl.videoWidth || 1280) + '' + (videoEl.videoHeight || 720) + '  LIVE';
        emptyState.classList.add('hidden');
        playerWrap.classList.remove('hidden');
        scrubber.classList.add('hidden');
        btnCamera.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> STOP CAMERA';

        resetResults();
        setStatus('ready', 'CAMERA ACTIVE');

        // Automatically start real-time tracking on live camera!
        startProcessing();
      } catch (err) {
        console.error('[Vision Camera Error]', err);
        setStatus('error', 'Camera access failed: ' + err.message);
      }
    });
  }

  if (btnClear) btnClear.addEventListener('click', () => {
    stopProcessing();
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
      isCameraActive = false;
    }
    if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
    videoEl.src = '';
    videoEl.srcObject = null;
    uploadZone.classList.remove('hidden');
    uploadInfo.classList.add('hidden');
    emptyState.classList.remove('hidden');
    playerWrap.classList.add('hidden');
    scrubber.classList.add('hidden');
    if (btnExport) btnExport.style.display = 'none';
    if (btnCamera) btnCamera.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> USE LIVE CAMERA';
    resetResults();
    setStatus('ready', 'READY');
  });

  //  Playback 
  if (btnPlay) btnPlay.addEventListener('click', togglePlay);
  function togglePlay() {
    if (!videoEl.src) return;
    if (videoEl.paused) { videoEl.play(); isPlaying = true; }
    else { videoEl.pause(); isPlaying = false; }
    playIcon.style.display = isPlaying ? 'none' : '';
    pauseIcon.style.display = isPlaying ? '' : 'none';
  }
  if (videoEl) {
    videoEl.addEventListener('timeupdate', () => {
      const frame = Math.floor(videoEl.currentTime * videoMeta.fps);
      seekToFrame(frame, false);
    });
    videoEl.addEventListener('ended', () => {
      isPlaying = false;
      playIcon.style.display = '';
      pauseIcon.style.display = 'none';
    });
  }

  //  Scrubber 
  if (scrubRange) scrubRange.addEventListener('input', () => {
    const frame = parseInt(scrubRange.value);
    videoEl.currentTime = frame / videoMeta.fps;
    seekToFrame(frame, false);
  });
  if (btnPrev) btnPrev.addEventListener('click', () => {
    const frame = Math.max(0, currentFrame - 1);
    videoEl.currentTime = frame / videoMeta.fps;
    seekToFrame(frame, false);
  });
  if (btnNext) btnNext.addEventListener('click', () => {
    const frame = Math.min(totalFrames - 1, currentFrame + 1);
    videoEl.currentTime = frame / videoMeta.fps;
    seekToFrame(frame, false);
  });

  async function seekToFrame(frame, updateVideo = true) {
    currentFrame = frame;
    if (updateVideo) videoEl.currentTime = frame / videoMeta.fps;
    scrubRange.value = frame;
    updateScrubberDisplay(frame);

    const cached = allResults.find(r => r.frameIndex === frame);
    if (cached) {
      renderDetections(cached.detections);
      updateDetectionsList(cached);
    } else if (ortSession && !isProcessing && !isPlaying) {
      // Immediate single-frame detection when scrubbing before full analysis
      try {
        const pre = extractFrameImageData(640);
        const dets = await runFrameInference(ortSession, pre);
        renderDetections(dets);
        updateDetectionsList({ detections: dets });
      } catch (e) {
        renderCurrentFrame();
        updateDetectionsList();
      }
    } else {
      renderCurrentFrame();
      updateDetectionsList();
    }
  }

  function updateScrubberDisplay(frame) {
    const total = totalFrames || 1;
    frameBadge.textContent = 'Frame ' + frame;
    timeDisplay.textContent = formatTime(frame / videoMeta.fps) + ' / ' + formatTime(videoMeta.duration || 0);
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return m + ':' + sec;
  }

  //  ONNX Inference 
  async function ensureSession() {
    if (ortSession) return ortSession;
    setStatus('loading', 'Loading ONNX model');
    
    // Primary same-origin local model, with fallback CDN URLs
    const modelUrls = [
      '/models/yolov8n.onnx',
      'https://huggingface.co/onnx-community/yolov8n/resolve/main/yolov8n.onnx',
      'https://cdn.jsdelivr.net/gh/hyuto/yolov8-onnxruntime-web@master/public/model/yolov8n.onnx'
    ];

    if (!window.ort) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        // Use ort.all.min.js  bundles all WASM backends without dynamic .mjs imports
        s.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/ort.all.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load ONNX Runtime Web from CDN.'));
        document.head.appendChild(s);
      });
    }
    const ort = window.ort;
    if (!ort) throw new Error('ONNX Runtime Web library unavailable');

    //  CRITICAL FIX: point wasmPaths to the CDN matching the loaded ort.min.js 
    // The /ort/ local path does not exist on Vercel  it caused:
    // "Failed to fetch dynamically imported module: .../ort-wasm-simd-threaded.mjs"
    const ORT_CDN_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/';
    ort.env.wasm.wasmPaths = ORT_CDN_BASE;

    // Disable multi-threading: Vercel does NOT serve the COOP/COEP headers required
    // for SharedArrayBuffer. Threaded WASM always fails with the .mjs import error.
    ort.env.wasm.numThreads = 1;

    // Fetch model binary as ArrayBuffer with Cache API persistence
    let modelBuffer = null;
    const cacheKey = 'run01-yolov8n-v2';

    if ('caches' in window) {
      try {
        const cache = await caches.open('run01-vision-cache');
        const cachedResp = await cache.match(cacheKey);
        if (cachedResp) {
          modelBuffer = await cachedResp.arrayBuffer();
          console.log('[Vision] Model loaded from browser cache');
        }
      } catch (e) {
        console.warn('[Vision] Cache API lookup failed:', e);
      }
    }

    if (!modelBuffer) {
      setStatus('loading', 'Downloading YOLOv8 nano model (~12 MB, cached after first load)');
      let lastFetchErr = null;
      for (const url of modelUrls) {
        try {
          console.log('[Vision] Fetching model from:', url);
          const resp = await fetch(url);
          if (resp.ok) {
            modelBuffer = await resp.arrayBuffer();
            if ('caches' in window) {
              try {
                const cache = await caches.open('run01-vision-cache');
                await cache.put(cacheKey, new Response(modelBuffer.slice(0)));
              } catch (_) {}
            }
            break;
          }
        } catch (err) {
          console.warn('[Vision] Fetch failed for', url, ':', err.message);
          lastFetchErr = err;
        }
      }
      if (!modelBuffer) {
        throw new Error('Failed to download model: ' + (lastFetchErr ? lastFetchErr.message : 'network error'));
      }
    }

    setStatus('loading', 'Initialising inference engine');

    // WASM (SIMD) is the primary engine: complete operator coverage for YOLOv8 (including
    // Softmax on axis=1 in DFL layer which WebGPU rejects).
    const backends = [
      { ep: 'wasm',  label: 'WASM (SIMD)' },
      { ep: 'webgl', label: 'WebGL'       },
    ];
    for (const { ep, label } of backends) {
      try {
        const sess = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: [ep],
          graphOptimizationLevel: 'all',
        });
        // Warmup test run with dummy input to verify all model kernels execute without runtime error
        const inName = (sess.inputNames && sess.inputNames[0]) || 'images';
        const dummy = new ort.Tensor('float32', new Float32Array(3 * 640 * 640), [1, 3, 640, 640]);
        await sess.run({ [inName]: dummy });
        ortSession = sess;
        console.log('[Vision] Session ready & verified with backend:', label);
        setStatus('ready', `Model ready (${label})`);
        break;
      } catch (e) {
        console.warn('[Vision]', label, 'backend failed verification:', e.message || e);
      }
    }

    if (!ortSession) {
      throw new Error('No ONNX backend available (WASM / WebGL both failed).');
    }

    return ortSession;
  }

  function extractFrameImageData(targetSize = 640) {
    if (!videoEl || videoEl.readyState < 2) return null;
    const srcW = videoEl.videoWidth;
    const srcH = videoEl.videoHeight;
    if (!srcW || !srcH) return null;

    const offscreen = document.createElement('canvas');
    offscreen.width = targetSize;
    offscreen.height = targetSize;
    const octx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!octx) return null;

    // Standard YOLO neutral gray 114
    octx.fillStyle = 'rgb(114, 114, 114)';
    octx.fillRect(0, 0, targetSize, targetSize);

    const scale = Math.min(targetSize / srcW, targetSize / srcH);
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const padX = Math.floor((targetSize - newW) / 2);
    const padY = Math.floor((targetSize - newH) / 2);

    octx.drawImage(videoEl, padX, padY, newW, newH);
    return {
      imageData: octx.getImageData(0, 0, targetSize, targetSize),
      scale,
      padX,
      padY,
      srcW,
      srcH,
    };
  }

  function nms(boxes, scores, iouThresh) {
    const idxs = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).map(x => x.i);
    const kept = [], sup = new Set();
    for (const i of idxs) {
      if (sup.has(i)) continue;
      kept.push(i);
      for (const j of idxs) {
        if (i === j || sup.has(j)) continue;
        const [ax, ay, aw, ah] = boxes[i]; const [bx, by, bw, bh] = boxes[j];
        const ix = Math.max(0, Math.min(ax+aw, bx+bw) - Math.max(ax, bx));
        const iy = Math.max(0, Math.min(ay+ah, by+bh) - Math.max(ay, by));
        const inter = ix * iy, union = aw*ah + bw*bh - inter;
        if (union > 0 && inter/union > iouThresh) sup.add(j);
      }
    }
    return kept;
  }

  async function runFrameInference(session, preprocessed) {
    if (!preprocessed) return [];
    const ort = window.ort;
    const { imageData, scale, padX, padY, srcW, srcH } = preprocessed;
    const { data, width, height } = imageData;
    const tensor = new Float32Array(3 * width * height);
    for (let i = 0; i < width * height; i++) {
      tensor[i]                      = data[i*4]   / 255.0;
      tensor[i + width*height]       = data[i*4+1] / 255.0;
      tensor[i + 2*width*height]     = data[i*4+2] / 255.0;
    }
    const input = new ort.Tensor('float32', tensor, [1, 3, height, width]);
    const inputName = (session.inputNames && session.inputNames[0]) || 'images';
    const results = await session.run({ [inputName]: input });
    const outputKey = (session.outputNames && session.outputNames[0]) || (results.output0 ? 'output0' : Object.keys(results)[0]);
    const output = results[outputKey];
    if (!output) return [];

    const conf = confSlider ? parseInt(confSlider.value) / 100 : 0.25;
    return decodeYoloRaw(output.data, output.dims, scale, padX, padY, srcW, srcH, conf);
  }

  function decodeYoloRaw(raw, dims, scale, padX, padY, srcW, srcH, confThresh = 0.25) {
    let N, numChannels, isChannelsFirst;
    if (dims.length === 3) {
      if (dims[1] < dims[2]) {
        numChannels = dims[1]; // 84
        N = dims[2];           // 8400
        isChannelsFirst = true;
      } else {
        N = dims[1];           // 8400
        numChannels = dims[2]; // 84
        isChannelsFirst = false;
      }
    } else {
      N = dims[dims.length - 1];
      numChannels = 84;
      isChannelsFirst = true;
    }

    const numClasses = numChannels - 4;
    const iouThresh = 0.45;
    const boxes = [], scores = [], classIds = [];

    for (let i = 0; i < N; i++) {
      let cx, cy, w, h;
      let maxScore = 0, maxClass = 0;

      if (isChannelsFirst) {
        cx = raw[0 * N + i];
        cy = raw[1 * N + i];
        w  = raw[2 * N + i];
        h  = raw[3 * N + i];
        for (let c = 0; c < numClasses; c++) {
          const s = raw[(4 + c) * N + i];
          if (s > maxScore) { maxScore = s; maxClass = c; }
        }
      } else {
        const stride = numChannels;
        cx = raw[i * stride + 0];
        cy = raw[i * stride + 1];
        w  = raw[i * stride + 2];
        h  = raw[i * stride + 3];
        for (let c = 0; c < numClasses; c++) {
          const s = raw[i * stride + 4 + c];
          if (s > maxScore) { maxScore = s; maxClass = c; }
        }
      }

      if (maxScore < confThresh) continue;

      const origX = Math.max(0, (cx - w / 2 - padX) / scale);
      const origY = Math.max(0, (cy - h / 2 - padY) / scale);
      const origW = Math.min(srcW - origX, w / scale);
      const origH = Math.min(srcH - origY, h / scale);
      boxes.push([origX, origY, origW, origH]);
      scores.push(maxScore);
      classIds.push(maxClass);
    }

    const kept = nms(boxes, scores, iouThresh);
    return kept.map(idx => ({
      classId: classIds[idx],
      className: COCO_CLASSES[classIds[idx]] || 'obj_' + classIds[idx],
      confidence: scores[idx],
      bbox: boxes[idx],
    }));
  }

  //  Global YOLO Inference Bridge for Python 
  window.runVisionInferenceOnImage = async function(imageSource, conf = 0.25) {
    const session = await ensureSession();
    let img;
    if (typeof imageSource === 'string') {
      img = new Image();
      img.crossOrigin = 'anonymous';
      let src = imageSource.trim();
      if (!src.startsWith('data:') && !src.startsWith('http:') && !src.startsWith('https:') && !src.startsWith('blob:')) {
        src = 'data:image/png;base64,' + src;
      }
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('Failed to load image for YOLO inference: ' + src.slice(0, 50)));
        img.src = src;
      });
    } else {
      img = imageSource;
    }

    const targetSize = 640;
    const offscreen = document.createElement('canvas');
    offscreen.width = targetSize;
    offscreen.height = targetSize;
    const octx = offscreen.getContext('2d', { willReadFrequently: true });
    octx.fillStyle = 'rgb(114, 114, 114)';
    octx.fillRect(0, 0, targetSize, targetSize);

    const srcW = img.naturalWidth || img.videoWidth || img.width || 640;
    const srcH = img.naturalHeight || img.videoHeight || img.height || 640;
    const scale = Math.min(targetSize / srcW, targetSize / srcH);
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const padX = Math.floor((targetSize - newW) / 2);
    const padY = Math.floor((targetSize - newH) / 2);

    octx.drawImage(img, padX, padY, newW, newH);
    const imgData = octx.getImageData(0, 0, targetSize, targetSize);
    const { data } = imgData;

    const tensor = new Float32Array(3 * targetSize * targetSize);
    for (let i = 0; i < targetSize * targetSize; i++) {
      tensor[i]                                = data[i * 4]     / 255.0;
      tensor[i + targetSize * targetSize]     = data[i * 4 + 1] / 255.0;
      tensor[i + 2 * targetSize * targetSize] = data[i * 4 + 2] / 255.0;
    }

    const input = new ort.Tensor('float32', tensor, [1, 3, targetSize, targetSize]);
    const inName = (session.inputNames && session.inputNames[0]) || 'images';
    const results = await session.run({ [inName]: input });
    const outKey = (session.outputNames && session.outputNames[0]) || (results.output0 ? 'output0' : Object.keys(results)[0]);
    const output = results[outKey];
    if (!output) return JSON.stringify({ detections: [], width: srcW, height: srcH });

    const detections = decodeYoloRaw(output.data, output.dims, scale, padX, padY, srcW, srcH, conf);
    return JSON.stringify({ detections, width: srcW, height: srcH });
  };

  //  Run button 
  if (btnRun) btnRun.addEventListener('click', async () => {
    if (isProcessing) { stopProcessing(); return; }
    if (!videoEl.src && !cameraStream) { alert('Please upload a video or click "USE LIVE CAMERA" first.'); return; }
    await startProcessing();
  });

  function assignTracks(currentDets) {
    const updated = [];
    const usedPrev = new Set();
    const now = Date.now();

    currentDets.sort((a, b) => b.confidence - a.confidence);

    for (const det of currentDets) {
      let bestMatchIdx = -1;
      let bestIoU = 0;
      const [ax, ay, aw, ah] = det.bbox;

      for (let j = 0; j < activeTracks.length; j++) {
        if (usedPrev.has(j)) continue;
        const prev = activeTracks[j];
        if (prev.classId !== det.classId) continue;
        const [bx, by, bw, bh] = prev.bbox;

        const ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
        const iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
        const inter = ix * iy;
        const union = aw * ah + bw * bh - inter;
        const iou = union > 0 ? inter / union : 0;

        const acx = ax + aw / 2, acy = ay + ah / 2;
        const bcx = bx + bw / 2, bcy = by + bh / 2;
        const dist = Math.hypot(acx - bcx, acy - bcy);
        const maxDist = Math.max(aw, ah, bw, bh, 100);

        if (iou > 0.25 && iou > bestIoU) {
          bestIoU = iou;
          bestMatchIdx = j;
        } else if (bestIoU === 0 && dist < maxDist * 0.75) {
          bestMatchIdx = j;
        }
      }

      if (bestMatchIdx !== -1) {
        usedPrev.add(bestMatchIdx);
        const track = activeTracks[bestMatchIdx];
        track.bbox = det.bbox;
        track.lastSeen = now;
        updated.push({ ...det, trackId: track.id });
      } else {
        const newId = nextTrackId++;
        activeTracks.push({
          id: newId,
          classId: det.classId,
          bbox: det.bbox,
          lastSeen: now,
        });
        updated.push({ ...det, trackId: newId });
      }
    }

    activeTracks = activeTracks.filter(t => now - t.lastSeen < 1500);

    for (const det of updated) {
      if (det.trackId !== undefined) {
        if (!trackHistory.has(det.trackId)) trackHistory.set(det.trackId, []);
        const [bx, by, bw, bh] = det.bbox;
        const trail = trackHistory.get(det.trackId);
        trail.push({ x: bx + bw / 2, y: by + bh / 2 });
        if (trail.length > 30) trail.shift();
      }
    }

    return updated;
  }

  async function startProcessing() {
    if (isProcessing) return;
    isProcessing = true;
    abortController = new AbortController();
    btnRun.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> STOP';
    setStatus('processing', 'Starting AI engine');
    if (statusPanel) statusPanel.style.display = '';

    try {
      const session = await ensureSession();

      if (isCameraActive && cameraStream) {
        setStatus('processing', 'LIVE TRACKING ACTIVE');

        while (!abortController.signal.aborted && isCameraActive) {
          const imgData = extractFrameImageData(640);
          if (!imgData) {
            await new Promise(r => setTimeout(r, 40));
            continue;
          }

          let detections = await runFrameInference(session, imgData);
          detections = assignTracks(detections);

          totalDetections += detections.length;
          renderDetections(detections);
          updateDetectionsList({ detections });

          if (detFooter) detFooter.textContent = `${detections.length} objects visible`;
          setStatus('processing', `TRACKING LIVE: ${detections.length} OBJECTS`);

          await new Promise(r => requestAnimationFrame(r));
        }
        return;
      }

      const stride = strideSlider ? parseInt(strideSlider.value) : 1;
      const fps = videoMeta.fps || 25;
      videoEl.pause();
      isPlaying = false;
      if (playIcon) playIcon.style.display = '';
      if (pauseIcon) pauseIcon.style.display = 'none';
      videoEl.currentTime = 0;

      for (let frame = 0; frame < totalFrames; frame += stride) {
        if (abortController.signal.aborted) break;
        await seekVideoAsync(frame / fps);
        const imgData = extractFrameImageData(640);
        let detections = imgData ? await runFrameInference(session, imgData) : [];

        const task = taskSelect ? taskSelect.value : 'detect';
        if (task === 'track' || task === 'detect') {
          detections = assignTracks(detections);
        }

        const result = { frameIndex: frame, timestamp: frame / fps, detections };
        allResults.push(result);
        totalDetections += detections.length;
        const pct = Math.round(((frame + 1) / totalFrames) * 100);
        setProgress(pct, `Frame ${frame + 1} / ${totalFrames}`);
        detFooter.textContent = totalDetections + ' total detections';
        scrubberProcessedUpdate(frame);
        // Show current frame annotations live
        if (frame === currentFrame || Math.abs(frame - currentFrame) < stride) {
          renderDetections(result.detections);
          updateDetectionsList(result);
        }
        await yieldToUI();
      }

      setStatus('done', 'ANALYSIS COMPLETE (' + totalDetections + ' detections)');
      btnRun.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> RE-ANALYSE';
      if (btnExport) btnExport.style.display = '';
      seekToFrame(0, true);
      videoEl.play();
      isPlaying = true;
      playIcon.style.display = 'none';
      pauseIcon.style.display = '';
    } catch (err) {
      setStatus('error', 'ERROR: ' + err.message);
      btnRun.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> ANALYSE & TRACK VIDEO';
    } finally {
      isProcessing = false;
    }
  }

  function stopProcessing() {
    if (abortController) abortController.abort();
    isProcessing = false;
    btnRun.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> ANALYSE & TRACK VIDEO';
    setStatus('ready', 'READY');
  }

  function seekVideoAsync(time) {
    return new Promise(resolve => {
      if (Math.abs(videoEl.currentTime - time) < 0.008) {
        resolve();
        return;
      }
      let timer = null;
      const onSeeked = () => {
        if (timer) clearTimeout(timer);
        videoEl.removeEventListener('seeked', onSeeked);
        resolve();
      };
      timer = setTimeout(() => {
        videoEl.removeEventListener('seeked', onSeeked);
        resolve();
      }, 250);
      videoEl.addEventListener('seeked', onSeeked);
      videoEl.currentTime = time;
    });
  }

  function yieldToUI() { return new Promise(r => setTimeout(r, 0)); }

  //  Annotation rendering 
  function getColor(classId, trackId) {
    const pal = PALETTES[selectedPalette] || PALETTES.default;
    const idx = (trackId !== undefined ? trackId : classId) % pal.length;
    return pal[idx];
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function renderDetections(detections) {
    if (!ctx || !canvas || !videoEl) return;
    const containerW = videoEl.clientWidth;
    const containerH = videoEl.clientHeight;
    if (containerW < 1 || containerH < 1) return;

    // Retina High-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(containerW * dpr);
    const targetH = Math.round(containerH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    if (ctx.resetTransform) ctx.resetTransform();
    else ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, containerW, containerH);

    // Compute exact active video viewport accounting for object-fit: contain letterbox
    const videoRatio = (videoMeta.w || videoEl.videoWidth || 1) / (videoMeta.h || videoEl.videoHeight || 1);
    const containerRatio = containerW / containerH;

    let renderW, renderH, offsetX, offsetY;
    if (containerRatio > videoRatio) {
      renderH = containerH;
      renderW = renderH * videoRatio;
      offsetX = (containerW - renderW) / 2;
      offsetY = 0;
    } else {
      renderW = containerW;
      renderH = renderW / videoRatio;
      offsetX = 0;
      offsetY = (containerH - renderH) / 2;
    }

    const sx = renderW / (videoMeta.w || videoEl.videoWidth || 1);
    const sy = renderH / (videoMeta.h || videoEl.videoHeight || 1);
    const showLabels = document.getElementById('visionShowLabels')?.checked !== false;
    const showConf   = document.getElementById('visionShowConf')?.checked !== false;
    ctx.font = 'bold 11px "DM Mono", monospace';
    // Draw motion trails
    const showTrails = document.getElementById('visionShowTrails')?.checked !== false;
    if (showTrails) {
      for (const det of detections) {
        if (det.trackId !== undefined && trackHistory.has(det.trackId)) {
          const trail = trackHistory.get(det.trackId);
          if (trail.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = getColor(det.classId, det.trackId);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let t = 0; t < trail.length; t++) {
              const tx = trail[t].x * sx;
              const ty = trail[t].y * sy;
              if (t === 0) ctx.moveTo(tx, ty);
              else ctx.lineTo(tx, ty);
            }
            ctx.stroke();
          }
        }
      }
    }

    // Bounded boxes around detected objects with label above each box
    for (const det of detections) {
      const color = getColor(det.classId, det.trackId);
      const [bx, by, bw, bh] = det.bbox;
      const x = Math.round(offsetX + bx * sx);
      const y = Math.round(offsetY + by * sy);
      const w = Math.round(bw * sx);
      const h = Math.round(bh * sy);

      if (w < 4 || h < 4) continue;

      // 1. Box bounded on object detected
      ctx.fillStyle = hexToRgba(color, 0.15);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // 2. Above the box: label what the object is
      const objName = det.trackId !== undefined 
        ? '#' + det.trackId + ' ' + det.className + ' ' + Math.round(det.confidence * 100) + '%'
        : det.className + ' ' + Math.round(det.confidence * 100) + '%';

      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "DM Mono", monospace';
      const textW = ctx.measureText(objName).width;
      const badgeH = 18;
      const badgeW = Math.round(textW + 10);
      const badgeY = y - badgeH >= 0 ? y - badgeH : y;

      ctx.fillStyle = color;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, badgeY, badgeW, badgeH, [3, 3, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x, badgeY, badgeW, badgeH);
      }

      ctx.fillStyle = '#000000';
      ctx.fillText(objName, x + 5, badgeY + 13);
    }
  }

  function renderCurrentFrame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const result = allResults.find(r => r.frameIndex === currentFrame);
    if (result && result.detections.length > 0) renderDetections(result.detections);
  }

  function scrubberProcessedUpdate(frame) {
    const pct = totalFrames > 0 ? (frame / totalFrames) * 100 : 0;
    scrubberProcessed && (scrubberProcessed.style.width = pct + '%');
  }

  //  Detections sidebar 
  function updateDetectionsList(result) {
    const res = result || allResults.find(r => r.frameIndex === currentFrame);
    const dets = res ? res.detections : [];
    detCount.textContent = dets.length + ' this frame';
    if (dets.length === 0) {
      detList.innerHTML = '<li class="vision-det-empty">' + (allResults.length ? 'No detections this frame' : 'Process video to see results') + '</li>';
      return;
    }
    const pal = PALETTES[selectedPalette] || PALETTES.default;
    detList.innerHTML = dets.map((det, i) => {
      const color = pal[(det.trackId !== undefined ? det.trackId : det.classId) % pal.length];
      const [bx, by, bw, bh] = det.bbox;
      return `<li class="vision-det-item">
        <span class="vision-det-color" style="background:${color}"></span>
        <div class="vision-det-info">
          <span class="vision-det-class">${det.className}${det.trackId !== undefined ? ' <span style="color:rgba(155,92,246,.7)">#'+det.trackId+'</span>' : ''}</span>
          <span class="vision-det-bbox">${Math.round(bx)},${Math.round(by)} ${Math.round(bw)}${Math.round(bh)}</span>
        </div>
        <span class="vision-det-conf" style="color:${color}">${Math.round(det.confidence*100)}</span>
      </li>`;
    }).join('');
  }

  //  Status helpers 
  function setStatus(state, text) {
    statusText.textContent = text;
    statusBadge.textContent = text;
    statusBadge.className = 'vision-status-badge vision-status-badge--' + state;
  }

  function setProgress(pct, label) {
    progressFill.style.width = pct + '%';
    progressPct.textContent = pct + '%';
    if (label) statusText.textContent = label;
  }

  function resetResults() {
    allResults = []; totalDetections = 0; currentFrame = 0;
    trackHistory.clear();
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    detList.innerHTML = '<li class="vision-det-empty">Process video to see results</li>';
    detCount.textContent = '0 this frame';
    detFooter.textContent = '0 total detections';
    if (progressFill) progressFill.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';
    if (scrubberProcessed) scrubberProcessed.style.width = '0%';
    if (btnExport) btnExport.style.display = 'none';
    statusPanel.style.display = 'none';
  }

  //  Export 
  if (btnExport) btnExport.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(allResults, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'run01-cv-detections.json'; a.click();
    URL.revokeObjectURL(url);
  });

  //  Canvas resize observer 
  if (videoEl && canvas) {
    const ro = new ResizeObserver(() => {
      const rect = videoEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width; canvas.height = rect.height;
        renderCurrentFrame();
      }
    });
    ro.observe(videoEl);
  }

  console.log('[RUN01] Vision Studio panel initialised.');
})();
