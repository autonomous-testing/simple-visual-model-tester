// Provider/mode-specific request builder for model calls.
// Keeps ApiClient slim by encapsulating payload differences.

function detectProvider(baseURL = '') {
  const u = String(baseURL || '').toLowerCase();
  if (u.includes('openrouter.ai')) return 'openrouter';
  try {
    const host = new URL(baseURL).host.toLowerCase();
    if (host.endsWith('.azure.com')) return 'azure';
  } catch {}
  return 'generic';
}

function isQwenVLModel(model = '') {
  const m = String(model || '').toLowerCase();
  return /qwen/.test(m) && /vl/.test(m);
}

function buildChatPayload(ctx) {
  const { model, temperature = 0, maxTokens = 2048, prompt, sysPrompt, baseURL } = ctx;
  const provider = detectProvider(baseURL);

  // Some providers expect image_url as a string (OpenRouter + Qwen VL)
  const useStringChatImageUrl = provider === 'openrouter' && isQwenVLModel(model);
  const imagePartChat = useStringChatImageUrl
    ? { type: 'image_url', image_url: ctx.imageB64 }
    : { type: 'image_url', image_url: { url: ctx.imageB64 } };

  // Some providers expect system content as a plain string (OpenRouter + Qwen VL)
  const systemMessage = (provider === 'openrouter' && isQwenVLModel(model))
    ? { role: 'system', content: sysPrompt }
    : { role: 'system', content: [{ type: 'text', text: sysPrompt }] };

  return {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      systemMessage,
      { role: 'user', content: [ { type: 'text', text: prompt }, imagePartChat ] }
    ],
    response_format: { type: 'json_object' }
  };
}

function buildResponsesPayload(ctx) {
  const { model, maxTokens = 2048, prompt, sysPrompt, reasoningEffort } = ctx;
  return {
    model,
    input: [
      { role: 'system', content: [ { type: 'input_text', text: sysPrompt } ] },
      { role: 'user', content: [ { type: 'input_text', text: prompt }, { type: 'input_image', image_url: ctx.imageB64 } ] }
    ],
    // JSON-only response formatting
    text: { format: { type: 'json_object' } },
    // Azure GPT-5 compatible: top-level max_output_tokens; omit temperature entirely
    max_output_tokens: maxTokens,
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {})
  };
}

export function buildRequestBody({ endpointType, baseURL, model, temperature, maxTokens, prompt, sysPrompt, imageB64, reasoningEffort }) {
  const ctx = { endpointType, baseURL, model, temperature, maxTokens, prompt, sysPrompt, imageB64, reasoningEffort };
  if (endpointType === 'responses') return buildResponsesPayload(ctx);
  return buildChatPayload(ctx);
}

export function detectProviderKind(baseURL) {
  return detectProvider(baseURL);
}

