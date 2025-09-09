import { blobToDataURL, truncate } from './utils.js';
import { buildRequestBody } from './providers/builder.js';

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
      // Responses API expects input_* types; use top-level max_output_tokens (Azure-compatible)
      ? { model: model.model, max_output_tokens: 16, input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }] }
      // Chat API can accept either string or array. Use simple string for ping.
      : { model: model.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] };
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers({ apiKey: model.apiKey, extraHeaders: model.extraHeaders, baseURL: model.baseURL }),
      body: JSON.stringify(body),
    });
    const timeMs = Math.round(performance.now() - t0);
    return { ok: res.ok, status: res.status, timeMs };
  }

  async callModel({ model, baseURL, apiKey, endpointType, temperature=0, maxTokens=2048, extraHeaders, timeoutMs=60000, apiVersion, reasoningEffort }, imageBlob, prompt, onLogSanitized, imageW, imageH, systemPromptTemplate) {
    const url = this._endpointUrl({ baseURL, endpointType, apiVersion });
    const headers = this._headers({ apiKey, extraHeaders, baseURL });
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

    // Build provider/mode-specific body using the new builder
    const body = buildRequestBody({
      endpointType,
      baseURL,
      model,
      temperature,
      maxTokens,
      prompt,
      sysPrompt,
      imageB64: b64,
      reasoningEffort
    });

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const t0 = performance.now();
    let status = 0;
    let rawText = '';
    try {
      let res = await fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: controller.signal
      });
      status = res.status;
      // Try to parse JSON; if not JSON, fall back to text
      let contentType = res.headers.get('content-type') || '';
      let j;
      if (contentType.includes('application/json')) {
        j = await res.json();
        rawText = this._extractTextFromResponse(j, endpointType);
        var rawFull = JSON.stringify(j);
      } else {
        rawText = await res.text();
      }
      clearTimeout(to);
      // Auto-retry for Responses when stopped by max_output_tokens
      if (endpointType === 'responses' && j && j.status === 'incomplete' && j.incomplete_details?.reason === 'max_output_tokens') {
        const increased = Math.min(Math.max(Number(maxTokens) || 300, 300) * 2, 4096);
        const retryBody = buildRequestBody({
          endpointType,
          baseURL,
          model,
          temperature,
          maxTokens: increased,
          prompt,
          sysPrompt,
          imageB64: b64,
          reasoningEffort
        });
        const controller2 = new AbortController();
        const to2 = setTimeout(() => controller2.abort('timeout'), timeoutMs);
        res = await fetch(url, { method:'POST', headers, body: JSON.stringify(retryBody), signal: controller2.signal });
        status = res.status;
        contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          j = await res.json();
          rawText = this._extractTextFromResponse(j, endpointType);
          rawFull = JSON.stringify(j);
        } else {
          rawText = await res.text();
          rawFull = undefined;
        }
        clearTimeout(to2);
      }
      // Auto-retry for Chat when finish_reason === 'length'
      if (endpointType !== 'responses' && j && Array.isArray(j.choices) && j.choices[0]?.finish_reason === 'length') {
        const increased = Math.min(Math.max(Number(maxTokens) || 300, 300) * 2, 4096);
        const retryBody = {
          ...body,
          max_tokens: increased
        };
        const controller2 = new AbortController();
        const to2 = setTimeout(() => controller2.abort('timeout'), timeoutMs);
        const res2 = await fetch(url, { method: 'POST', headers, body: JSON.stringify(retryBody), signal: controller2.signal });
        status = res2.status;
        const contentType2 = res2.headers.get('content-type') || '';
        if (contentType2.includes('application/json')) {
          const j2 = await res2.json();
          j = j2;
          rawText = this._extractTextFromResponse(j2, endpointType);
          rawFull = JSON.stringify(j2);
        } else {
          rawText = await res2.text();
          rawFull = undefined;
        }
        clearTimeout(to2);
      }
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
      return { status, rawText, rawFull, latencyMs: latency };
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

  _endpointUrl({ baseURL, endpointType, apiVersion }) {
    // Be tolerant of full URLs (with query strings like ?api-version=...) and plain bases.
    // If there's a query string, append the endpoint path to the pathname, not after the query.
    try {
      const u = new URL(baseURL);
      const path = (u.pathname || '').replace(/\/$/, '');
      const alreadyHas = /\/(responses|chat\/completions)$/.test(path);
      if (!alreadyHas) {
        u.pathname = path + (endpointType === 'responses' ? '/responses' : '/chat/completions');
      }
      // Append api-version if provided and not present
      const hasApiVersion = u.searchParams.has('api-version');
      if (apiVersion && !hasApiVersion) u.searchParams.set('api-version', apiVersion);
      return u.toString();
    } catch (_) {
      // Not an absolute URL; fallback to simple concatenation
      const base = String(baseURL || '').replace(/\/$/, '');
      const url = endpointType === 'responses' ? `${base}/responses` : `${base}/chat/completions`;
      if (apiVersion && !/api-version=/.test(url)) {
        return url + (url.includes('?') ? `&api-version=${apiVersion}` : `?api-version=${apiVersion}`);
      }
      return url;
    }
  }
  _fillTemplate(template, data) {
    if (!template || typeof template !== 'string') return '';
    return template.replace(/\$\{(\w+)\}/g, (m, k) => {
      const v = data.hasOwnProperty(k) ? data[k] : undefined;
      return v == null ? m : String(v);
    });
  }
  _headers({ apiKey, extraHeaders, baseURL }) {
    const base = {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    };
    const hasAuth = Object.keys(base).some(k => /^(authorization|api-key)$/i.test(k));
    if (apiKey && !hasAuth) {
      const isAzure = /\.azure\.com$/i.test(new URL(String(baseURL || 'http://x')).host) || /\.azure\.com\//i.test(String(baseURL || ''));
      if (isAzure) {
        base['api-key'] = apiKey;
      } else {
        base['Authorization'] = `Bearer ${apiKey}`;
      }
    }
    return base;
  }
  _sanitizeHeaders(h) {
    const clone = { ...h };
    delete clone['Authorization'];
    delete clone['authorization'];
    delete clone['api-key'];
    delete clone['Api-Key'];
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
      // Some providers return choices[0].text
      const t2 = j?.choices?.[0]?.text;
      if (typeof t2 === 'string') return t2;
    }
    // Fallback
    return JSON.stringify(j);
  }
}
