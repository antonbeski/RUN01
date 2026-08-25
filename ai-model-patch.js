/* ============================================================
   PATCH — pyrunner/static/app.js
   ------------------------------------------------------------
   In app.js, inside the `initAIAssistant` IIFE, find this block
   (search for the comment "Confirmed-active Groq models"):

     // Confirmed-active Groq models (verified Aug 2026 — deprecated models removed)
     const GROQ_MODELS = [ ... ];

     // Pre-seed dropdown immediately so there is always a valid selection
     function seedModelSelect(models) { ... }
     seedModelSelect(GROQ_MODELS);

   Delete that whole block and paste the code below in its place.
   Nothing else in app.js needs to change — loadModels() below it
   already calls seedModelSelect(models) generically and will pick
   up the "provider" field returned by the updated /api/ai/models
   endpoint automatically.
   ============================================================ */

  // Curated model catalog — NVIDIA NIM (best $/token + high quality) first,
  // Groq second as a fast automatic fallback. Mirrors MODEL_CATALOG in app.py.
  // Verified against build.nvidia.com / console.groq.com docs, Aug 2026.
  const MODEL_CATALOG = [
    { id: 'deepseek-ai/deepseek-v4-flash-0731',      name: 'DeepSeek V4 Flash — Fastest & Cheapest', provider: 'NVIDIA NIM' },
    { id: 'nvidia/llama-3.1-nemotron-70b-instruct',  name: 'Nemotron 70B — High Quality',            provider: 'NVIDIA NIM' },
    { id: 'qwen/qwen2.5-coder-32b-instruct',         name: 'Qwen 2.5 Coder 32B — Code Specialist',   provider: 'NVIDIA NIM' },
    { id: 'meta/llama-3.3-70b-instruct',             name: 'Llama 3.3 70B',                          provider: 'NVIDIA NIM' },
    { id: 'openai/gpt-oss-120b',  name: 'GPT-OSS 120B — Fastest',  provider: 'Groq' },
    { id: 'openai/gpt-oss-20b',   name: 'GPT-OSS 20B — Balanced',  provider: 'Groq' },
    { id: 'qwen/qwen3.6-27b',     name: 'Qwen 3.6 27B',            provider: 'Groq' },
    { id: 'groq/compound',        name: 'Groq Compound (Agentic)', provider: 'Groq' },
    { id: 'groq/compound-mini',   name: 'Groq Compound Mini',      provider: 'Groq' },
  ];

  // Default model — DeepSeek V4 Flash on NVIDIA NIM: cheapest per-token,
  // long context, tuned for coding/agentic use. Falls back to Groq
  // automatically server-side if NVIDIA_API_KEY isn't set or is rate-limited.
  const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-flash-0731';

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
