"""
============================================================
RUN01 - Dynamic Panel-Specific AI Skills System
File: pyrunner/skills.py

Loads, parses, and injects authoritative panel-specific skills
into the AI chat completion pipeline, ensuring the AI operates
at its peak with exact prompt engineering for the active panel:
  - Code Editor (Python Data Science / Pyodide WASM)
  - AI Parametric CAD Studio (OpenSCAD WASM)
  - Desmos Mathematical Graphing Calculator
  - Macroeconomic & Financial Data Explorer (FRED / yfinance)
============================================================
"""

import os
import re
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger("run01.skills")

# Base directory for repository skills
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SKILLS_DIR = os.path.join(_BASE_DIR, ".agents", "skills")

# Mapping of active panel context keys to their respective skill definition files
PANEL_SKILL_MAP = {
    "cad": os.path.join(_SKILLS_DIR, "cad-studio", "SKILL.md"),
    "cad-studio": os.path.join(_SKILLS_DIR, "cad-studio", "SKILL.md"),
    "desmos": os.path.join(_SKILLS_DIR, "desmos", "SKILL.md"),
    "math": os.path.join(_SKILLS_DIR, "desmos", "SKILL.md"),
    "data": os.path.join(_SKILLS_DIR, "data-explorer", "SKILL.md"),
    "financial": os.path.join(_SKILLS_DIR, "data-explorer", "SKILL.md"),
    "editor": os.path.join(_SKILLS_DIR, "python-data-science", "SKILL.md"),
    "python": os.path.join(_SKILLS_DIR, "python-data-science", "SKILL.md"),
}

# Cache structure: { file_path: { "mtime": float, "metadata": dict, "content": str } }
_SKILL_CACHE: Dict[str, Dict[str, Any]] = {}


def _parse_yaml_frontmatter(text: str) -> tuple[Dict[str, str], str]:
    """Extracts simple YAML frontmatter key-values and returns (meta, markdown_body)."""
    meta: Dict[str, str] = {}
    body = text

    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            raw_yaml = parts[1]
            body = parts[2].strip()
            for line in raw_yaml.splitlines():
                line = line.strip()
                if not line or line.startswith("#") or ":" not in line:
                    continue
                k, _, v = line.partition(":")
                meta[k.strip()] = v.strip().strip('"').strip("'")

    return meta, body


def load_skill_file(file_path: str) -> Optional[Dict[str, Any]]:
    """
    Loads and parses a SKILL.md file.
    Reuses memory cache if file modification time (mtime) has not changed.
    """
    if not os.path.isfile(file_path):
        logger.warning(f"Skill file not found: {file_path}")
        return None

    try:
        current_mtime = os.path.getmtime(file_path)
        cached = _SKILL_CACHE.get(file_path)
        if cached and cached.get("mtime") == current_mtime:
            return cached

        with open(file_path, "r", encoding="utf-8") as fh:
            raw_content = fh.read()

        metadata, body = _parse_yaml_frontmatter(raw_content)
        parsed = {
            "mtime": current_mtime,
            "path": file_path,
            "name": metadata.get("name", os.path.basename(os.path.dirname(file_path))),
            "description": metadata.get("description", ""),
            "version": metadata.get("version", "1.0.0"),
            "content": body,
        }
        _SKILL_CACHE[file_path] = parsed
        return parsed

    except Exception as exc:
        logger.error(f"Error reading skill file {file_path}: {exc}")
        return None


def resolve_panel_skill(panel_key: Optional[str]) -> Dict[str, Any]:
    """
    Resolves a panel context key (e.g. 'cad', 'desmos', 'editor') to its skill.
    Defaults to 'editor' if unrecognized or empty.
    """
    key = (panel_key or "editor").strip().lower()
    target_path = PANEL_SKILL_MAP.get(key)

    if not target_path:
        # Fallback to editor
        target_path = PANEL_SKILL_MAP["editor"]
        key = "editor"

    skill = load_skill_file(target_path)
    if not skill:
        # Emergency minimal fallback if file missing
        return {
            "key": key,
            "name": f"{key}-assistant",
            "description": "Standard RUN01 Assistant",
            "content": "You are the specialized AI assistant embedded in RUN01. Provide concise, runnable solutions.",
        }

    skill["key"] = key
    return skill


def _model_token_guidelines(model: Optional[str]) -> str:
    """Returns tailored instructions based on the active model's architecture and output token budget."""
    if not model:
        return ""
    m = model.lower()

    if any(k in m for k in ["r1", "reasoning", "qwq"]):
        return (
            "\n--- MODEL-SPECIFIC DIRECTIVE: REASONING ARCHITECTURE ---\n"
            "• Provide clear mathematical and algorithmic derivation, followed immediately by the complete, runnable code block.\n"
            "• Ensure the final code block is 100% complete and self-contained; do not let reasoning consume the entire completion.\n"
        )
    elif any(k in m for k in ["gpt-oss-120b", "llama-3.3-70b", "minimax-m2.7"]):
        return (
            "\n--- MODEL-SPECIFIC DIRECTIVE: HIGH-CAPACITY PRODUCTION TIER (32K TOKEN BUDGET) ---\n"
            "• You have an expansive 32,768 token output budget. Generate rich, robust, production-grade solutions.\n"
            "• Include comprehensive error handling, full type annotations, docstrings, and edge-case validation.\n"
            "• Never truncate or abbreviate: provide the full script from imports to visualization/output.\n"
        )
    elif any(k in m for k in ["8b-instant", "llama-3.1-8b", "allam-2-7b"]):
        return (
            "\n--- MODEL-SPECIFIC DIRECTIVE: HIGH-SPEED COMPACT TIER (4K-8K TOKEN BUDGET) ---\n"
            "• Maximize code density. Omit conversational filler, long introductions, and closing chatter.\n"
            "• Focus 95% of token budget directly on the executable code block so the entire solution completes without truncation.\n"
            "• Keep implementations clean, direct, and immediately runnable.\n"
        )
    elif any(k in m for k in ["prompt-guard", "safeguard"]):
        return (
            "\n--- MODEL-SPECIFIC DIRECTIVE: SAFETY/CLASSIFIER MODEL ---\n"
            "• This model is specialized for safety classification, not code generation.\n"
            "• Provide short, direct safety assessments only.\n"
        )
    else:
        return (
            "\n--- MODEL-SPECIFIC DIRECTIVE: BALANCED TIER (16K TOKEN BUDGET) ---\n"
            "• Provide a self-contained, clean, fully functional solution with targeted inline documentation.\n"
            "• Ensure all components are fully written out with zero missing functions.\n"
        )


def build_panel_system_prompt(panel_key: Optional[str], model: Optional[str] = None) -> str:
    """
    Synthesizes the complete, authoritative system prompt for the specified panel,
    fine-tuned individually for the active model's token limits and architecture.
    """
    skill = resolve_panel_skill(panel_key)
    active_key = skill.get("key", "editor")
    skill_content = skill.get("content", "")

    header = (
        f"You are the authoritative, specialized AI Assistant embedded in RUN01's [{active_key.upper()}] workspace.\n"
        f"Operating Mode: Pure peak-performance prompt engineering for {active_key}.\n"
        "Completely adhere to the following environment rules, runtime specifications, and output conventions:\n\n"
    )

    model_tuning = _model_token_guidelines(model)

    footer = (
        "\n\n--- GENERAL RUN01 PROTOCOL & CODE EXECUTION RULES ---\n"
        "1. STRICT: NEVER WRITE 'import yfinance' or 'import yf'! yfinance is NOT installed in Pyodide WASM and causes ModuleNotFoundError.\n"
        "   Use RUN01's built-in async functions directly: df = await yf_download('AAPL', period='1mo', interval='1d'), await yf_info('AAPL'), await yf_fetch('AAPL', 'category').\n"
        "2. For Desmos interactive math: use desmos.plot('y = sin(x)') or show_desmos(...).\n"
        "3. FORMAT & AUTO-EXECUTION: All executable Python code MUST be enclosed inside standard ```python ... ``` fences. RUN01 automatically extracts this block, injects it into the Monaco Code Editor, runs it in Pyodide WASM, and auto-repairs any errors until clean execution with 0 errors.\n"
        "4. ZERO PLACEHOLDERS: Never use '# TODO' or '...'. Always provide 100% complete, runnable code from imports to final output/plot.\n"
        "5. Matplotlib plots must end with plt.show(); Plotly charts must end with fig.show()."
    )

    return header + skill_content + model_tuning + footer


def list_registered_panel_skills() -> List[Dict[str, Any]]:
    """Returns a summary catalog of all registered panel skills."""
    skills = []
    seen = set()
    for key, path in PANEL_SKILL_MAP.items():
        if path in seen:
            continue
        seen.add(path)
        parsed = load_skill_file(path)
        if parsed:
            skills.append({
                "panel_key": key,
                "name": parsed.get("name"),
                "description": parsed.get("description"),
                "version": parsed.get("version"),
                "file": os.path.relpath(path, _BASE_DIR).replace("\\", "/")
            })
    return skills
