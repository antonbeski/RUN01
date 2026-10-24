// Curated model catalog — verified Groq free-tier models (Oct 24, 2026)
// Llama 3.3 70B is the default: most reliable, best coding, great context.
const MODEL_CATALOG = [
  // ── Primary Chat / Code Models ──────────────────────────────────────────────
  { id: 'llama-3.3-70b-versatile',    name: 'Llama 3.3 70B Versatile ⭐',    provider: 'Groq', tier: 'primary' },
  { id: 'openai/gpt-oss-120b',        name: 'GPT-OSS 120B (~500 tok/s)',      provider: 'Groq', tier: 'primary' },
  { id: 'openai/gpt-oss-20b',         name: 'GPT-OSS 20B',                   provider: 'Groq', tier: 'primary' },
  { id: 'qwen/qwen3.8-27b',           name: 'Qwen 3.8 27B (Multimodal)',     provider: 'Groq', tier: 'primary' },
  { id: 'llama-3.1-8b-instant',       name: 'Llama 3.1 8B Instant (Fast)',   provider: 'Groq', tier: 'primary' },
  { id: 'minimaxai/minimax-m2.7',     name: 'MiniMax M2.7 (196K ctx)',       provider: 'Groq', tier: 'primary' },
  // ── Specialized Models ──────────────────────────────────────────────────────
  { id: 'allam-2-7b',                              name: 'ALLAM 2 7B [Arabic/Multilingual]',  provider: 'Groq', tier: 'specialized' },
  { id: 'openai/gpt-oss-safeguard-20b',            name: 'GPT-OSS Safeguard 20B [Safety]',    provider: 'Groq', tier: 'safety' },
  { id: 'meta-llama/llama-prompt-guard-2-86m',     name: 'Llama Prompt Guard 2 86M [Guard]',  provider: 'Groq', tier: 'safety' },
  { id: 'meta-llama/llama-prompt-guard-2-22m',     name: 'Llama Prompt Guard 2 22M [Guard]',  provider: 'Groq', tier: 'safety' },
];

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
