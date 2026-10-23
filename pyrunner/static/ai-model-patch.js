  // Curated model catalog — Groq production IDs (Oct 2026, NVIDIA NIM temporarily disabled)
  const MODEL_CATALOG = [
    { id: 'openai/gpt-oss-120b',                 name: 'Groq - GPT-OSS 120B (~500 tok/s)',       provider: 'Groq' },
    { id: 'openai/gpt-oss-20b',                  name: 'Groq - GPT-OSS 20B',                    provider: 'Groq' },
    { id: 'qwen/qwen3.8-27b',                    name: 'Groq - Qwen 3.8 27B',                   provider: 'Groq' },
    { id: 'allam-2-7b',                          name: 'Groq - ALLAM 2 7B',                     provider: 'Groq' },
    { id: 'openai/gpt-oss-safeguard-20b',        name: 'Groq - GPT-OSS Safeguard 20B',           provider: 'Groq' },
    { id: 'meta-llama/llama-prompt-guard-2-86m', name: 'Groq - Llama Prompt Guard 2 86M',        provider: 'Groq' },
    { id: 'meta-llama/llama-prompt-guard-2-22m', name: 'Groq - Llama Prompt Guard 2 22M',        provider: 'Groq' },
  ];

  const DEFAULT_MODEL = 'openai/gpt-oss-120b';
