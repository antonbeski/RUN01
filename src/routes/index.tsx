import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUpRight, Check, Play } from "lucide-react";
import heroAsset from "../assets/run01-product-full-color.png.asset.json";
import logoAsset from "../assets/run01-logo.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RUN01 — Python Data Science in Your Browser" },
      {
        name: "description",
        content: "A full browser-based Python data science IDE powered by WebAssembly. Zero installs, zero server compute, instant visual output.",
      },
      { property: "og:title", content: "RUN01 — Think. Code. Run." },
      {
        property: "og:description",
        content: "The fastest path from an idea to a working mathematical model, entirely in your browser.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const capabilities = [
  ["01", "Full data science stack", "NumPy, Pandas, SciPy, Scikit-learn, Statsmodels, Matplotlib, Seaborn and Plotly."],
  ["10", "A data layer no one else built", "Live yfinance plus 930k+ FRED series, normalized into one clean API call."],
  ["11", "AI that edits", "Surgical code edits applied live. Accept or reject, then run in one click."],
];

const pipelineSteps = [
  ["01", "ASK", "Start with a question, a dataset, or a rough Python idea."],
  ["10", "COMPUTE", "A real Python runtime executes locally through WebAssembly."],
  ["11", "SEE", "Charts, tables, and statistical output appear in the same workspace."],
  ["100", "REFINE", "AI applies precise edits while you stay in control of the code."],
];

function BinaryRail() {
  return (
    <div className="binary-rail" aria-hidden="true">
      01001010&nbsp;11010100&nbsp;00110101&nbsp;RUN01&nbsp;01101001&nbsp;10010110&nbsp;00101101&nbsp;PYTHON.WASM&nbsp;01010110
    </div>
  );
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`logo-crop ${className}`}>
      <img src={logoAsset.url} alt="RUN01" />
    </div>
  );
}

function ComputeModel() {
  return (
    <div className="compute-model" aria-hidden="true">
      <div className="data-orbit orbit-a"><i /><i /><i /><i /></div>
      <div className="data-orbit orbit-b"><i /><i /><i /><i /></div>
      <div className="compute-core">
        <span>PY</span><span>WASM</span><span>LOCAL</span><span>01</span><span>RUN</span><span>DATA</span>
      </div>
      <div className="chart-plane">
        <i /><i /><i /><i /><i /><i /><i />
      </div>
      <div className="code-planes"><span>+ model.fit()</span><span>→ result.plot()</span><span>✓ output.ready</span></div>
      <div className="model-shadow" />
    </div>
  );
}

function Index() {
  return (
    <main className="overflow-hidden bg-background text-foreground">
      <header className="site-header">
        <a href="#top" aria-label="RUN01 home"><Logo /></a>
        <nav aria-label="Primary navigation" className="hidden items-center gap-7 md:flex">
          <a href="#engine">ENGINE</a>
          <a href="#stack">STACK</a>
          <a href="#why">WHY RUN01</a>
        </nav>
        <a className="pixel-button pixel-button-dark" href="#engine">RUN IDE <Play size={13} fill="currentColor" /></a>
      </header>

      <BinaryRail />

      <section id="top" className="hero-grid">
        <div className="hero-copy">
          <div className="floating-pixels" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>
          <div className="eyebrow"><span className="status-dot" /> PYTHON // ONLINE</div>
          <h1>IDEAS IN.<br /><span>MODELS OUT.</span></h1>
          <p className="hero-lede">A full data science stack in your browser. No installation. No server. No waiting.</p>
          <div className="flex flex-wrap gap-3">
            <a className="pixel-button pixel-button-accent" href="#engine">START RUNNING <ArrowUpRight size={16} /></a>
            <a className="text-link" href="#why">HOW IT WORKS <ArrowDown size={14} /></a>
          </div>
          <div className="boot-line"><span>SYS.READY</span><span>PYODIDE.WASM</span><span>0ms SERVER TIME</span></div>
        </div>
        <div className="hero-visual">
          <div className="corner-code">[ 01 ]<br />LOCAL_EXEC</div>
          <img src={heroAsset.url} alt="RUN01 browser Python IDE running a financial data model" />
          <div className="glass-stat glass-stat-a"><span>RUNTIME</span><strong>LOCAL</strong></div>
          <div className="glass-stat glass-stat-b"><span>COMPUTE</span><strong>0.00</strong></div>
        </div>
      </section>

      <section id="engine" className="manifesto-band">
        <div className="section-index">01—03</div>
        <div>
          <p className="kicker">THE ENGINE</p>
          <h2>PYTHON, WITHOUT<br />THE WAITING ROOM.</h2>
        </div>
        <div className="manifesto-copy">
          <p>Python itself, compiled to WebAssembly. Your code executes 100% inside the browser—no server in the loop, no attack surface, no compute bill per run.</p>
          <div className="terminal-note"><span>$</span> runtime.boot("pyodide")<br /><span>&gt;</span> stack ready in browser_</div>
        </div>
      </section>

      <section id="stack" className="capabilities-section">
        <div className="cube-scene" aria-hidden="true">
          <div className="pixel-cube"><span /><span /><span /><span /><span /><span /></div>
        </div>
        <div className="section-heading">
          <p className="kicker">BUILT FOR THINKERS</p>
          <h2>EVERYTHING BETWEEN<br />QUESTION &amp; ANSWER.</h2>
        </div>
        <div className="capability-grid">
          {capabilities.map(([number, title, description]) => (
            <article key={number} className="capability-card">
              <div className="capability-number">{number}</div>
              <h3>{title}</h3>
              <p>{description}</p>
              <div className="pixel-rule" />
            </article>
          ))}
        </div>
      </section>

      <section className="pipeline-section" aria-labelledby="pipeline-title">
        <div className="pipeline-visual">
          <div className="pipeline-sticky">
            <div className="pipeline-label"><span>RUN01://PIPELINE</span><span>SCROLL_TO_COMPUTE</span></div>
            <ComputeModel />
            <div className="pipeline-readout"><span>INPUT</span><strong>IDEA</strong><span>OUTPUT</span><strong>MODEL</strong></div>
          </div>
        </div>
        <div className="pipeline-copy">
          <div className="pipeline-intro">
            <p className="kicker">ONE CONTINUOUS WORKFLOW</p>
            <h2 id="pipeline-title">THOUGHT BECOMES<br />COMPUTE.</h2>
          </div>
          {pipelineSteps.map(([number, title, description]) => (
            <article className="pipeline-step" key={number}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section id="why" className="proof-section">
        <div className="proof-terminal" aria-label="RUN01 system benefits">
          <div className="terminal-bar"><span>RUN01://ADVANTAGE</span><span>● ● ●</span></div>
          {[
            ["ZERO_COMPUTE_COST", "Python runs client-side. Near-100% margins."],
            ["ZERO_INSTALL", "Open a tab. The full stack is ready."],
            ["FAST_VISUAL_LOOP", "Inline charts, live graphing and AI-assisted code."],
            ["FREE_TO_SCALE", "The free tier can grow without burning cash."],
          ].map(([label, text]) => (
            <div className="terminal-row" key={label}><Check size={16} /><strong>{label}</strong><span>{text}</span></div>
          ))}
        </div>
        <div className="proof-copy">
          <p className="kicker">WHY RUN01</p>
          <h2>THE FASTEST PATH FROM IDEA TO WORKING MODEL.</h2>
          <p>Built for people who would rather test the thought than configure the environment.</p>
          <a className="pixel-button pixel-button-accent" href="#top">OPEN RUN01 <ArrowUpRight size={16} /></a>
        </div>
      </section>

      <BinaryRail />
      <footer>
        <Logo className="footer-logo" />
        <p>PYTHON × WASM × YOUR BROWSER</p>
        <p>© 2026 RUN01</p>
      </footer>
    </main>
  );
}