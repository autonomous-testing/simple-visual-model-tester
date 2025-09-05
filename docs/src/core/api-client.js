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
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers(model),
      body: JSON.stringify({ model: model.model, max_tokens: 1, messages: [{ role:'user', content:[{type:'text', text:'ping'}]}] }),
    });
    const timeMs = Math.round(performance.now() - t0);
    return { ok: res.ok, status: res.status, timeMs };
  }

  async callModel({ model, baseURL, apiKey, endpointType, temperature=0, maxTokens=300, extraHeaders, timeoutMs=60000 }, imageBlob, prompt, onLogSanitized) {
    const url = this._endpointUrl({ baseURL, endpointType });
    const headers = this._headers({ apiKey, extraHeaders });
    const b64 = await blobToDataURL(imageBlob);

    const sysPrompt = `You are a strictly JSON-only assistant. Output ONLY valid JSON with no extra text.
Task: Given one image and an instruction, locate the UI element and return coordinates.

Schema (must match exactly):
{
  "coordinate_system": "pixel",
  "origin": "top-left",
  "image_size": { "width": int, "height": int },
  "primary": { "type": "point" | "bbox", "...numbers as defined..." },
  "others": [ Detection objects ... ],
  "notes": string (optional)
}

Rules:
- If unsure, still return your best guess with a confidence in [0.0, 1.0].
- Coordinates must be within image bounds.
- If both point and bbox are reasonable, prefer "point" as primary.
- Do not include any commentary or code fences; return JSON only.`;

    let body;
    if (endpointType === 'responses') {
      body = {
        model, temperature, max_output_tokens: maxTokens,
        input: [
          { role:'system', content:[{ type:'text', text: sysPrompt }]},
          { role:'user', content:[
            { type:'input_text', text: prompt },
            { type:'input_image', image_url: b64 }
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
            { type:'input_text', text: prompt },
            { type:'input_image', image_url: b64 }
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
    return {
      'Content-Type': 'application/json',
      'Authorization': apiKey ? `Bearer ${apiKey}` : undefined,
      ...(extraHeaders || {}),
    };
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

