# PyRunner 🐍

A browser-based Python IDE — edit and run Python instantly, no server execution, no setup. Built with Flask, Monaco Editor, and Pyodide (WebAssembly).

## Stack

| Layer | Technology |
|-------|------------|
| Server | Flask (serves one page only) |
| Editor | Monaco Editor (from CDN) |
| Runtime | Pyodide — Python in WebAssembly |
| Hosting | Vercel (auto-deploy from GitHub) |

## Project Structure

```
pyrunner/
├── app.py              # Flask entrypoint
├── requirements.txt    # Flask dependency
├── vercel.json         # Vercel routing config
├── templates/
│   └── index.html      # Single app page
└── static/
    ├── app.js          # Monaco + Pyodide logic
    └── style.css       # UI theme
```

## Run Locally

```bash
pip install -r requirements.txt
python app.py
# → open http://localhost:5000
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repository
4. Vercel auto-detects Flask via `app.py` — click **Deploy**
5. Done. Every `git push` triggers a new deployment.

## How it works

- Flask only serves `index.html` and static files — it never executes Python code
- Monaco Editor loads from CDN and provides the code editing experience
- Pyodide loads from CDN and runs Python entirely in the browser via WebAssembly
- Clicking **Run** passes code from Monaco to Pyodide; output appears instantly

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Run code |

## Features

- ✅ Syntax highlighting (Python, Monaco)
- ✅ Custom dark theme (violet/cyan accent)
- ✅ Draggable split pane (editor / output)
- ✅ Run history with timing per execution
- ✅ Error highlighting in output
- ✅ Keyboard shortcut to run
- ✅ Reset to starter code

## Limitations (intentional MVP scope)

- No file save/load — refresh resets everything
- No package install UI (Pyodide includes many stdlib packages)
- No authentication or user accounts
- No backend code execution
