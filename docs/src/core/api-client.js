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

  async callModel({ model, baseURL, apiKey, endpointType, temperature=0, maxTokens=300, extraHeaders, timeoutMs=60000 }, imageBlob, prompt, onLogSanitized, imageW, imageH, systemPromptTemplate) {
    const url = this._endpointUrl({ baseURL, endpointType });
    const headers = this._headers({ apiKey, extraHeaders });
    const b64 = await blobToDataURL(imageBlob);

    const sysPrompt = this._fillTemplate(systemPromptTemplate || '', {
      image_width: Number.isFinite(imageW) ? imageW : '',
      image_height: Number.isFinite(imageH) ? imageH : '',
      coordinate_system: 'pixel',
      origin: 'top-left',
      user_prompt: prompt || '',
      model_id: model,
      endpoint_type: endpointType,
      temperature,
      max_tokens: (endpointType === 'responses') ? undefined : maxTokens
    });

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
  _fillTemplate(template, data) {
    if (!template || typeof template !== 'string') return '';
    return template.replace(/\$\{(\w+)\}/g, (m, k) => {
      const v = data.hasOwnProperty(k) ? data[k] : undefined;
      return v == null ? m : String(v);
    });
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
