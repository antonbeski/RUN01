// Curated model catalog — verified Groq free-tier models (Oct 24, 2026)
const MODEL_CATALOG = [
  // ── Primary Chat / Code Models ──────────────────────────────────────────────
  { id: 'llama-3.3-70b-versatile',    name: 'Groq - Llama 3.3 70B Versatile',   provider: 'Groq', tier: 'primary' },
  { id: 'llama-3.1-8b-instant',       name: 'Groq - Llama 3.1 8B Instant',      provider: 'Groq', tier: 'primary' },
  { id: 'qwen/qwen3.8-27b',           name: 'Groq - Qwen 3.8 27B (Multimodal)', provider: 'Groq', tier: 'primary' },
  { id: 'openai/gpt-oss-120b',        name: 'Groq - GPT-OSS 120B',              provider: 'Groq', tier: 'primary' },
  { id: 'openai/gpt-oss-20b',         name: 'Groq - GPT-OSS 20B',               provider: 'Groq', tier: 'primary' },
  // ── Specialized Models ──────────────────────────────────────────────────────
  { id: 'allam-2-7b',                              name: 'Groq - ALLAM 2 7B',                     provider: 'Groq', tier: 'specialized' },
  { id: 'openai/gpt-oss-safeguard-20b',            name: 'Groq - GPT-OSS Safeguard 20B',           provider: 'Groq', tier: 'safety' },
  { id: 'meta-llama/llama-prompt-guard-2-86m',     name: 'Groq - Llama Prompt Guard 2 86M',        provider: 'Groq', tier: 'safety' },
  { id: 'meta-llama/llama-prompt-guard-2-22m',     name: 'Groq - Llama Prompt Guard 2 22M',        provider: 'Groq', tier: 'safety' },
];

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
