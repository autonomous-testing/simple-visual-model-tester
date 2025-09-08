import { blobToDataURL, truncate } from './utils.js';

/**
 * ApiClient
 * - Builds OpenAI-compatible requests for /chat/completions or /responses
 * - Sends fetch with timeout, returns raw text and timing.
 */
export class ApiClient {
  async testConnection(model) {
    const url = this._endpointUrl(model);
    const t0 = performance.now();
    // Build a minimal payload appropriate for the endpoint type
    const body = (model.endpointType === 'responses')
      ? { model: model.model, max_output_tokens: 1, input: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }] }
      : { model: model.model, max_tokens: 1, messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }] };
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers(model),
      body: JSON.stringify(body),
    });
    const timeMs = Math.round(performance.now() - t0);
    return { ok: res.ok, status: res.status, timeMs };
  }

  async callModel({ model, baseURL, apiKey, endpointType, temperature=0, maxTokens=300, extraHeaders, timeoutMs=60000 }, imageBlob, prompt, onLogSanitized, imageW, imageH) {
    const url = this._endpointUrl({ baseURL, endpointType });
    const headers = this._headers({ apiKey, extraHeaders });
    const b64 = await blobToDataURL(imageBlob);

    const sysPrompt = `You are a strictly JSON-only assistant. Output ONLY a single valid JSON object — no prose, no code fences, no keys missing, no trailing commas.
Task: Given one image and an instruction, locate the UI element and return coordinates.

Return exactly this schema (keys and types must match):
{
  "coordinate_system": "pixel",
  "origin": "top-left",
  "image_size": { "width": ${Number.isFinite(imageW) ? imageW : 'WIDTH_INT'}, "height": ${Number.isFinite(imageH) ? imageH : 'HEIGHT_INT'} },
  "primary":
    { "type": "point", "x": INT, "y": INT, "confidence": NUMBER_0_TO_1 }
    OR
    { "type": "bbox",  "x": INT, "y": INT, "width": INT, "height": INT, "confidence": NUMBER_0_TO_1 },
  "others": [
    zero or more detection objects with the same shape as "primary"
  ],
  "notes": STRING (optional)
}

Hard rules:
- Output JSON only. No markdown, no explanations. The first character must be '{' and the last must be '}'.
- Use integer pixels for coordinates; confidence is a float in [0.0, 1.0].
- Coordinates must be within the image bounds: width=${Number.isFinite(imageW) ? imageW : 'W'}, height=${Number.isFinite(imageH) ? imageH : 'H'}.
- Always include all required top-level keys: coordinate_system, origin, image_size, primary, others.
- If uncertain, still return your best guess with a reasonable confidence.
- Prefer a "point" primary when both point and bbox are reasonable.
- If you cannot find anything, set primary to a point guess near the most likely area with low confidence (e.g., 0.1) and others to [].

Good example (point):
{"coordinate_system":"pixel","origin":"top-left","image_size":{"width":${Number.isFinite(imageW) ? imageW : 1280},"height":${Number.isFinite(imageH) ? imageH : 720}},"primary":{"type":"point","x":214,"y":358,"confidence":0.83},"others":[]}

Good example (bbox):
{"coordinate_system":"pixel","origin":"top-left","image_size":{"width":${Number.isFinite(imageW) ? imageW : 1280},"height":${Number.isFinite(imageH) ? imageH : 720}},"primary":{"type":"bbox","x":180,"y":300,"width":120,"height":80,"confidence":0.78},"others":[]}`;

    let body;
    if (endpointType === 'responses') {
      body = {
        model, temperature, max_output_tokens: maxTokens,
        input: [
          { role:'system', content:[{ type:'text', text: sysPrompt }]},
          { role:'user', content:[
            { type:'text', text: prompt },
            { type:'image_url', image_url: { url: b64 } }
          ]}
        ],
        response_format: { type:'json_object' }
      };
    } else {
      // chat
      body = {
        model, temperature, max_tokens: maxTokens,
        messages: [
          { role:'system', content:[{ type:'text', text: sysPrompt }]},
          { role:'user', content:[
            { type:'text', text: prompt },
            { type:'image_url', image_url: { url: b64 } }
          ]}
        ],
        response_format: { type:'json_object' }
      };
    }

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const t0 = performance.now();
    let status = 0;
    let rawText = '';
    try {
      const res = await fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: controller.signal
      });
      status = res.status;
      // Try to parse JSON; if not JSON, fall back to text
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const j = await res.json();
        rawText = this._extractTextFromResponse(j, endpointType);
      } else {
        rawText = await res.text();
      }
      clearTimeout(to);
      const latency = Math.round(performance.now() - t0);
      const sanitizedReq = {
        url,
        headers: this._sanitizeHeaders(headers),
        bodyPreview: truncate(JSON.stringify(body), 1200)
      };
      const log = {
        request: sanitizedReq,
        response: { status, rawText, parsedStatus: 'ok' },
        timing: { startedAtIso: new Date(t0 + performance.timeOrigin).toISOString(), finishedAtIso: new Date().toISOString(), latencyMs: latency }
      };
      onLogSanitized?.(log);
      return { status, rawText, latencyMs: latency };
    } catch (e) {
      clearTimeout(to);
      const latency = Math.round(performance.now() - t0);
      const errText = String(e?.message || e);
      const sanitizedReq = {
        url,
        headers: this._sanitizeHeaders(headers),
        bodyPreview: truncate(JSON.stringify(body), 1200)
      };
      const log = {
        request: sanitizedReq,
        response: { status: status || 0, rawText: errText, parsedStatus: 'error' },
        timing: { startedAtIso: new Date(t0 + performance.timeOrigin).toISOString(), finishedAtIso: new Date().toISOString(), latencyMs: latency }
      };
      onLogSanitized?.(log);
      throw e;
    }
  }

  _endpointUrl({ baseURL, endpointType }) {
    const base = baseURL.replace(/\/$/, '');
    return endpointType === 'responses' ? `${base}/responses` : `${base}/chat/completions`;
  }
  _headers({ apiKey, extraHeaders }) {
    const base = {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    };
    if (apiKey) base['Authorization'] = `Bearer ${apiKey}`;
    return base;
  }
  _sanitizeHeaders(h) {
    const clone = { ...h };
    delete clone['Authorization'];
    return clone;
  }
  _extractTextFromResponse(j, endpointType) {
    // OpenAI-style
    if (endpointType === 'responses') {
      // Try .output_text or first text item in output
      if (j && typeof j.output_text === 'string') return j.output_text;
      // Some servers return { output: [ { content: [{type:'output_text', text:'...'}] } ] }
      if (Array.isArray(j.output)) {
        const block = j.output.find(o => o?.content);
        if (block) {
          const t = block.content.find(c => c.type?.includes('text') && c.text);
          if (t) return t.text;
        }
      }
    } else {
      // chat/completions
      const t = j?.choices?.[0]?.message?.content;
      if (typeof t === 'string') return t;
      if (Array.isArray(t)) {
        const first = t.find(x => x.type && (x.type.includes('text') || x.type === 'output_text'));
        if (first && first.text) return first.text;
      }
    }
    // Fallback
    return JSON.stringify(j);
  }
}
