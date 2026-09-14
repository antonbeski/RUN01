# Run01 ⬡

A premium, browser-based Python sandbox — edit and run Python instantly with zero server execution and zero setup. Built with Flask, Monaco Editor, and Pyodide (WebAssembly).

This repository features an ultra-premium, minimalist **Monochrome Glassmorphic** theme.

## Architecture & Stack

| Layer | Technology |
|-------|------------|
| **Server** | Flask (WSGI serving static templates, CORS proxies & AI chat) |
| **Editor** | Monaco Editor (fully customized monochrome theme with transparent integration) |
| **Runtime** | Pyodide — Python 3.11 compiled to WebAssembly (running 100% client-side) |
| **CAD Studio** | OpenSCAD WASM + Three.js hardware-accelerated 3D viewport |
| **Math Engine** | Desmos Graphing Calculator API (interactive LaTeX plotting & parametric curves) |
| **Data Layer** | FRED (930,000+ indicators) & Yahoo Finance CORS-bypassed streaming APIs |
| **AI Skills** | Dynamic panel-specific prompt engineering with hot-reload caching |
| **Hosting** | Vercel (pre-configured serverless WSGI routing) |

## Features

- **Typographic Branding**: High-end minimalist branding with a custom badge and no heavy visual logos.
- **Glassmorphic Design**: Floating frosted-glass containers featuring deep-layered shadows and custom background blur effects.
- **Strict Monochrome Theme**: A design built entirely around black, white, and varying shades of gray (grayscale syntax highlighting and monochrome status markers).
- **Draggable Splitting**: Fluent resize handle separating the editor and console output.
- **AI Parametric CAD Studio**: In-browser OpenSCAD WASM 3D CSG modeling, dynamic UI parameter sliders, and 1-click STL export.
- **Desmos Graphing Calculator**: Interactive 2D/3D math plotting and simulation proofs embedded directly into the workspace.
- **Data Explorer**: Dedicated bottom dock for exploring and querying 930k+ FRED macroeconomic indicators and live Yahoo Finance series.
- **Dynamic Panel-Specific AI**: The embedded AI automatically detects active panels and loads only the authoritative skill for that domain.
- **Run History**: Live timing metrics and status reporting for each execution.
- **WASM execution**: Runs Python in-browser via Pyodide. Supports standard input/output and inline Matplotlib/Plotly rendering.

## Project Structure

```text
code_editor/
├── .agents/skills/         # Authoritative panel-specific AI skills (cad, desmos, data, editor)
├── api/
│   └── index.py            # Vercel serverless entrypoint
├── pyrunner/
│   ├── app.py              # Flask app, CORS proxies, AI chat endpoint
│   ├── skills.py           # Panel skills loader & prompt generator
│   ├── requirements.txt    # Flask dependencies
│   ├── static/
│   │   ├── app.js          # Monaco, Pyodide, CAD Studio, Desmos, Data Explorer
│   │   ├── style.css       # Glassmorphic Monochrome stylesheet
│   │   └── sw.js           # Service Worker: cache-first CDN strategy
│   └── templates/
│       └── index.html      # Float layout page template
├── tests/
│   ├── test_panel_skills.py       # Panel skill isolation test suite
│   └── test_isolation_security.py  # User authentication & data isolation test suite
├── vercel.json             # Routing configs
└── requirements.txt        # Root requirements
```

## Running Locally

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the application:
   ```bash
   python pyrunner/app.py
   ```
3. Open [http://localhost:5000](http://localhost:5000) in your web browser.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Link your repository in [Vercel](https://vercel.com).
3. The platform will automatically deploy your app using the configuration in `vercel.json` and `api/index.py`.
