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
    let res;
    if (model.endpointType === 'groundingdino') {
      // Use a very simple GET without custom headers to avoid preflight.
      // Some DINO servers don't support GET and return 405; that's acceptable for Test.
      res = await fetch(url, { method: 'GET' });
    } else {
      const body = (model.endpointType === 'responses')
        // Responses API expects input_* types; use top-level max_output_tokens (Azure-compatible)
        ? { model: model.model, max_output_tokens: 16, input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }] }
        // Chat API can accept either string or array. Use simple string for ping.
        : { model: model.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] };
      res = await fetch(url, {
        method: 'POST',
        headers: this._headers({ apiKey: model.apiKey, extraHeaders: model.extraHeaders, baseURL: model.baseURL }),
        body: JSON.stringify(body),
      });
    }
    const timeMs = Math.round(performance.now() - t0);
    return { ok: res.ok, status: res.status, timeMs };
  }

  async callModel({ model, baseURL, apiKey, endpointType, temperature=0, maxTokens=2048, extraHeaders, timeoutMs=60000, apiVersion, reasoningEffort, dinoBoxThreshold, dinoTextThreshold }, imageBlob, prompt, onLogSanitized, imageW, imageH, systemPromptTemplate) {
    const url = this._endpointUrl({ baseURL, endpointType, apiVersion });
    // For GroundingDINO, avoid custom headers to prevent CORS preflight (OPTIONS) on many servers.
    // Use bare headers and FormData for a simple CORS request.
    let headers = (endpointType === 'groundingdino')
      ? {}
      : this._headers({ apiKey, extraHeaders, baseURL });
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
    // Build request body (JSON for LLMs; will override for GroundingDINO with FormData)
    const body = buildRequestBody({
      endpointType,
      baseURL,
      model,
      temperature,
      maxTokens,
      prompt,
      sysPrompt,
      imageB64: b64,
      reasoningEffort,
      dinoBoxThreshold,
      dinoTextThreshold
    });

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const t0 = performance.now();
    let status = 0;
    let rawText = '';
    let attemptKind = 'single';
    try {
      let res;
      attemptKind = 'single';
      if (endpointType === 'groundingdino') {
        // For GroundingDINO servers that expect multipart/form-data
        // Build FormData: file, prompt, thresholds. Include common synonyms to maximize compatibility.
        const fd = new FormData();
        const mime = imageBlob?.type || 'image/png';
        const ext = mime.includes('jpeg') ? 'jpg' : (mime.split('/')[1] || 'png');
        const fname = `image.${ext}`;
        const p = String(prompt ?? '');
        // Append as file field named 'file' (common), and also 'image' to support other servers.
        fd.append('file', imageBlob, fname);
        try { fd.append('image', imageBlob, fname); } catch {}
        // Prompt field synonyms used by various GroundingDINO servers
        fd.append('prompt', p);
        try { fd.append('text', p); } catch {}
        try { fd.append('caption', p); } catch {}
        try { fd.append('text_prompt', p); } catch {}
        try { fd.append('query', p); } catch {}
        // Some servers accept an array; sending a string is generally ignored by others
        try { fd.append('phrases', p); } catch {}
        try { fd.append('classes', p); } catch {}
        if (dinoBoxThreshold != null) fd.append('box_threshold', String(dinoBoxThreshold));
        if (dinoTextThreshold != null) fd.append('text_threshold', String(dinoTextThreshold));
        // Remove JSON content-type so browser sets multipart boundary
        headers = this._sanitizeForMultipart(headers);
        res = await fetch(url, { method: 'POST', headers, body: fd, signal: controller.signal });
        // Inspect and optionally retry with JSON if the server rejects multipart or demands different keys
        let contentType0 = res.headers.get('content-type') || '';
        let j0 = null;
        if (contentType0.includes('application/json')) {
          try { j0 = await res.clone().json(); } catch {}
        } else {
          try { await res.clone().text(); } catch {}
        }
        const shouldRetryJson = (
          this._shouldRetryGroundingDino(j0, p)
          || (!res.ok && [400, 401, 403, 404, 405, 406, 415, 422].includes(res.status))
          || (j0 && Array.isArray(j0.detail) && j0.detail.some(d => String(d?.loc?.join('.')).includes('file') || String(d?.loc?.join('.')).includes('prompt')))
        );
        if (shouldRetryJson) {
          // Retry with JSON body including broader keys (may trigger preflight but improves compatibility)
          const jsonBody = buildRequestBody({ endpointType, baseURL, model, temperature, maxTokens, prompt, sysPrompt, imageB64: b64, reasoningEffort, dinoBoxThreshold, dinoTextThreshold });
          const jsonHeaders = { 'Content-Type': 'application/json' };
          const controller2 = new AbortController();
          const to2 = setTimeout(() => controller2.abort('timeout'), timeoutMs);
          const res2 = await fetch(url, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(jsonBody), signal: controller2.signal });
          clearTimeout(to2);
          res = res2;
          attemptKind = 'retry-json';
        }
      } else {
        res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      }
      status = res.status;
      // Try to parse JSON; if not JSON, fall back to text
      let contentType = res.headers.get('content-type') || '';
      let j;
      if (contentType.includes('application/json')) {
        j = await res.json();
        if (endpointType === 'groundingdino') {
          rawText = this._adaptGroundingDinoToJson(j, imageW, imageH);
        } else {
          rawText = this._extractTextFromResponse(j, endpointType);
        }
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
      if (endpointType !== 'responses' && endpointType !== 'groundingdino' && j && Array.isArray(j.choices) && j.choices[0]?.finish_reason === 'length') {
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
        bodyPreview: (endpointType === 'groundingdino')
          ? (attemptKind === 'retry-json' ? 'multipart (initial) -> retried JSON (image+prompt+thresholds)' : 'multipart/form-data (file, prompt, thresholds)')
          : truncate(JSON.stringify(body), 1200)
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
        bodyPreview: (endpointType === 'groundingdino')
          ? (attemptKind === 'retry-json' ? 'multipart (initial) -> retried JSON (image+prompt+thresholds)' : 'multipart/form-data (file, prompt, thresholds)')
          : truncate(JSON.stringify(body), 1200)
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
      if (endpointType === 'groundingdino') {
        // Use baseURL as-is for custom servers
      } else {
        const alreadyHas = /\/(responses|chat\/completions)$/.test(path);
        if (!alreadyHas) {
          u.pathname = path + (endpointType === 'responses' ? '/responses' : '/chat/completions');
        }
      }
      // Append api-version if provided and not present
      const hasApiVersion = u.searchParams.has('api-version');
      if (apiVersion && !hasApiVersion) u.searchParams.set('api-version', apiVersion);
      return u.toString();
    } catch (_) {
      // Not an absolute URL; fallback to simple concatenation
      const base = String(baseURL || '').replace(/\/$/, '');
      if (endpointType === 'groundingdino') return base;
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
  _sanitizeForMultipart(h) {
    const clone = { ...h };
    delete clone['Content-Type'];
    delete clone['content-type'];
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

  _shouldRetryGroundingDino(serverResponse, userPrompt) {
    try {
      const p = String(userPrompt || '').trim().toLowerCase();
      if (!p) return false;
      const mv = String(serverResponse?.model_version || '');
      if (/fallback/i.test(mv)) return true;
      // Label Studio-like fallback: value.text === 'object' and boxes have zero area
      if (Array.isArray(serverResponse?.results)) {
        let any = false;
        let allZero = true;
        let allObject = true;
        for (const group of serverResponse.results) {
          const arr = Array.isArray(group?.result) ? group.result : [];
          for (const item of arr) {
            if (item?.type !== 'rectanglelabels') continue;
            const v = item?.value || {};
            any = true;
            const w = Number(v.width || 0);
            const h = Number(v.height || 0);
            if (w > 0 && h > 0) allZero = false;
            const txt = String(v.text || '').trim().toLowerCase();
            if (txt !== 'object') allObject = false;
          }
        }
        if (any && (allZero || allObject)) return true;
      }
    } catch {}
    return false;
  }

  _adaptGroundingDinoToJson(serverResponse, imageW, imageH) {
    // Adapt various possible server shapes to canonical detection JSON.
    // Specifically supports Label Studio-like structure returned by
    // https://dino.d2.wopee.io/predict (see user's curl example).
    try {
      const w = Number(serverResponse.width || imageW || 0);
      const h = Number(serverResponse.height || imageH || 0);

      const boxes = [];

      // Shape A: { results: [ { result: [ { type:'rectanglelabels', value: { x,y,width,height,score,text } } ], score } ] }
      if (Array.isArray(serverResponse.results)) {
        for (const group of serverResponse.results) {
          const arr = Array.isArray(group?.result) ? group.result : [];
          for (const item of arr) {
            const v = item?.value || {};
            if (item?.type === 'rectanglelabels' && v) {
              // Some servers return normalized [0..1]; others use percents [0..100].
              // Detect heuristically: if any value > 1, treat as percent.
              const vx = Number(v.x || 0);
              const vy = Number(v.y || 0);
              const vw = Number(v.width || 0);
              const vh = Number(v.height || 0);
              const usePercent = [vx, vy, vw, vh].some(val => Math.abs(val) > 1);
              const sx = usePercent ? 0.01 * w : w;
              const sy = usePercent ? 0.01 * h : h;
              const bx = Math.round(vx * sx);
              const by = Math.round(vy * sy);
              const bw = Math.round(vw * sx);
              const bh = Math.round(vh * sy);
              const conf = Number(v.score != null ? v.score : (group?.score ?? 0));
              // Some responses might provide width/height=0 (point-like). Filter non-positive boxes later.
              boxes.push({ x: bx, y: by, width: bw, height: bh, confidence: Math.max(0, Math.min(1, conf || 0)) });
            }
          }
        }
      }

      // Shape B: { detections: [{ x,y,width,height,confidence }] } in pixel units
      if (Array.isArray(serverResponse.detections)) {
        for (const d of serverResponse.detections) {
          boxes.push({
            x: Math.max(0, Math.round(d.x || 0)),
            y: Math.max(0, Math.round(d.y || 0)),
            width: Math.max(0, Math.round(d.width || 0)),
            height: Math.max(0, Math.round(d.height || 0)),
            confidence: Math.max(0, Math.min(1, Number(d.confidence || 0)))
          });
        }
      }

      // Shape C (typical GroundingDINO raw): { boxes: [[x1,y1,x2,y2], ...], scores:[], labels:[] } normalized to [0..1]
      if (Array.isArray(serverResponse.boxes)) {
        const boxesArr = serverResponse.boxes;
        const scores = Array.isArray(serverResponse.scores) ? serverResponse.scores : [];
        for (let i = 0; i < boxesArr.length; i++) {
          const b = boxesArr[i] || [];
          const x1 = Number(b[0] || 0), y1 = Number(b[1] || 0), x2 = Number(b[2] || 0), y2 = Number(b[3] || 0);
          const usePercent = [x1, y1, x2, y2].some(val => Math.abs(val) > 1);
          const sx = usePercent ? 0.01 * w : w;
          const sy = usePercent ? 0.01 * h : h;
          const px1 = Math.round(x1 * sx), py1 = Math.round(y1 * sy);
          const px2 = Math.round(x2 * sx), py2 = Math.round(y2 * sy);
          const bw = Math.max(0, px2 - px1), bh = Math.max(0, py2 - py1);
          const conf = Math.max(0, Math.min(1, Number(scores[i] || 0)));
          boxes.push({ x: px1, y: py1, width: bw, height: bh, confidence: conf });
        }
      }

      // Order by confidence desc
      const ordered = boxes
        .filter(b => Number.isFinite(b.x) && Number.isFinite(b.y))
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

      let primary, others = [];
      if (ordered.length > 0) {
        // If top box lacks area, fallback to point primary
        const top = ordered[0];
        if ((top.width || 0) > 0 && (top.height || 0) > 0) {
          primary = { type: 'bbox', ...top };
        } else {
          primary = { type: 'point', x: top.x, y: top.y, confidence: top.confidence };
        }
        others = ordered.slice(1).map(b => ((b.width || 0) > 0 && (b.height || 0) > 0)
          ? ({ type: 'bbox', ...b })
          : ({ type: 'point', x: b.x, y: b.y, confidence: b.confidence }));
      } else {
        // Fallback to center point guess
        primary = { type: 'point', x: Math.round(w / 2), y: Math.round(h / 2), confidence: 0.1 };
      }

      const out = {
        coordinate_system: 'pixel',
        origin: 'top-left',
        image_size: { width: w, height: h },
        primary,
        others
      };
      return JSON.stringify(out);
    } catch (e) {
      // As a last resort, stringify the server response
      return JSON.stringify(serverResponse);
    }
  }
}
