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

export function buildRequestBody({ endpointType, baseURL, model, temperature, maxTokens, prompt, sysPrompt, imageB64, reasoningEffort, dinoBoxThreshold, dinoTextThreshold }) {
  const ctx = { endpointType, baseURL, model, temperature, maxTokens, prompt, sysPrompt, imageB64, reasoningEffort, dinoBoxThreshold, dinoTextThreshold };
  if (endpointType === 'responses') return buildResponsesPayload(ctx);
  if (endpointType === 'groundingdino') {
    // For GroundingDINO, expect the Base URL to point directly to the detection endpoint.
    // The server should accept: { image: DataURL, prompt: string, box_threshold?: number, text_threshold?: number }
    // Thresholds may be provided via extra headers or the model string; however, the UI stores
    // them on the model config as dinoBoxThreshold / dinoTextThreshold and ApiClient injects them
    // into this builder by packing them into the "model" field in a simple way, or via extraHeaders.
    const payload = {
      image: imageB64,
      prompt: prompt || '',
    };
    // Allow callers to pass thresholds using a simple convention on model string, e.g. "GroundingDINO:0.35:0.25"
    // but prefer explicit fields if present via ctx.temperature/maxTokens abuse is not great. ApiClient will pass
    // dino thresholds via special symbols on ctx.
    if (ctx.dinoBoxThreshold != null) payload.box_threshold = ctx.dinoBoxThreshold;
    if (ctx.dinoTextThreshold != null) payload.text_threshold = ctx.dinoTextThreshold;
    return payload;
  }
  return buildChatPayload(ctx);
}

export function detectProviderKind(baseURL) {
  return detectProvider(baseURL);
}
