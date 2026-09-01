  // Curated model catalog — NVIDIA NIM & Groq production IDs (Sept 2026)
  const MODEL_CATALOG = [
    { id: 'deepseek-v4-flash-0731',        name: 'NVIDIA — DeepSeek V4 Flash',       provider: 'NVIDIA NIM' },
    { id: 'deepseek-v4-pro-0813',          name: 'NVIDIA — DeepSeek V4 Pro',         provider: 'NVIDIA NIM' },
    { id: 'nemotron-3.5-lightning-30b-a3b',name: 'NVIDIA — Nemotron 3.5 Lightning',  provider: 'NVIDIA NIM' },
    { id: 'openai/gpt-oss-120b',           name: 'Groq — GPT-OSS 120B',              provider: 'Groq' },
    { id: 'openai/gpt-oss-20b',            name: 'Groq — GPT-OSS 20B',               provider: 'Groq' },
    { id: 'groq/compound',                 name: 'Groq — Compound',                  provider: 'Groq' },
    { id: 'groq/compound-mini',            name: 'Groq — Compound Mini',             provider: 'Groq' },
  ];

  // Default model — DeepSeek V4 Flash on NVIDIA NIM: 284B MoE, 1M context
  const DEFAULT_MODEL = 'deepseek-v4-flash-0731';