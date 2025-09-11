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
        // For GroundingDINO servers that expect multipart/form-data.
        // Prefer the "image" field (as in newer servers), then fall back to "file".
        const buildForm = (fieldName) => {
          const fd = new FormData();
          const mime = imageBlob?.type || 'image/png';
          const ext = mime.includes('jpeg') ? 'jpg' : (mime.split('/')[1] || 'png');
          const fname = `image.${ext}`;
          const p = String(prompt ?? '');
          const filePart = (imageBlob instanceof File) ? imageBlob : new File([imageBlob], fname, { type: mime });
          fd.append(fieldName, filePart, fname);
          fd.append('prompt', p);
          if (dinoBoxThreshold != null) fd.append('box_threshold', String(dinoBoxThreshold));
          if (dinoTextThreshold != null) fd.append('text_threshold', String(dinoTextThreshold));
          return fd;
        };

        headers = this._sanitizeForMultipart(headers); // remove JSON content-type so browser sets multipart boundary
        // Attempt 1: send as 'image'
        res = await fetch(url, { method: 'POST', headers, body: buildForm('image'), signal: controller.signal });
        let attempt = 'multipart-image';

        // If server rejects multipart with generic client/server errors, try 'file' field next
        if (!res.ok && [400, 401, 403, 404, 405, 406, 415, 422].includes(res.status)) {
          try { await res.clone().text(); } catch {}
          const controller2 = new AbortController();
          const to2 = setTimeout(() => controller2.abort('timeout'), timeoutMs);
          const res2 = await fetch(url, { method: 'POST', headers, body: buildForm('file'), signal: controller2.signal });
          clearTimeout(to2);
          res = res2;
          attempt = 'multipart-file';
        }

        // If still not OK and clearly a client/server issue, retry with JSON body
        if (!res.ok && [400, 401, 403, 404, 405, 406, 415].includes(res.status)) {
          const jsonBody = buildRequestBody({ endpointType, baseURL, model, temperature, maxTokens, prompt, sysPrompt, imageB64: b64, reasoningEffort, dinoBoxThreshold, dinoTextThreshold });
          const jsonHeaders = { 'Content-Type': 'application/json' };
          const controller3 = new AbortController();
          const to3 = setTimeout(() => controller3.abort('timeout'), timeoutMs);
          const res3 = await fetch(url, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(jsonBody), signal: controller3.signal });
          clearTimeout(to3);
          res = res3;
          attempt = `${attempt} -> retry-json`;
        }

        attemptKind = attempt;
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
          ? (attemptKind.includes('retry-json')
              ? `${attemptKind} (prompt, thresholds)`
              : `${attemptKind} (prompt, thresholds)`)
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
          ? (attemptKind.includes('retry-json')
              ? `${attemptKind} (prompt, thresholds)`
              : `${attemptKind} (prompt, thresholds)`)
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
    // Previous heuristics were too aggressive and retried JSON even on valid results
    // (e.g., model_version containing "fallback" or zero-width boxes from some servers).
    // Keep conservative: do not trigger heuristic retries here.
    // We already retry JSON on clear client/server errors in callModel.
    void serverResponse; void userPrompt;
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
      const points = [];

      // Shape A: { results: [ { result: [ { type:'rectanglelabels', value: { x,y,width,height,score,text } } ], score } ] }
      if (Array.isArray(serverResponse.results)) {
        for (const group of serverResponse.results) {
          const arr = Array.isArray(group?.result) ? group.result : [];
          for (const item of arr) {
            const v = item?.value || {};
            if (item?.type === 'rectanglelabels' && v) {
              // Some servers return normalized [0..1]; others use percents [0..100].
              // Detect fractions when all values are <= 1. Otherwise assume percents.
              const vx = Number(v.x || 0);
              const vy = Number(v.y || 0);
              const vw = Number(v.width || 0);
              const vh = Number(v.height || 0);
              const vals = [vx, vy, vw, vh].map(a => Math.abs(a));
              const isFraction = vals.every(val => val <= 1);
              const sx = isFraction ? w : 0.01 * w;
              const sy = isFraction ? h : 0.01 * h;
              // Compute edges with floor/ceil to preserve tiny positive boxes
              const fx1 = vx * sx, fy1 = vy * sy;
              const fx2 = (vx + vw) * sx, fy2 = (vy + vh) * sy;
              let x1 = Math.max(0, Math.floor(fx1));
              let y1 = Math.max(0, Math.floor(fy1));
              let x2 = Math.min(w, Math.ceil(fx2));
              let y2 = Math.min(h, Math.ceil(fy2));
              let bw = Math.max(0, x2 - x1);
              let bh = Math.max(0, y2 - y1);
              const bx = x1, by = y1;
              // If degenerate, record a point candidate at top-left
              if (bw <= 0 || bh <= 0) {
                points.push({ x: Math.round(vx * sx), y: Math.round(vy * sy), confidence: Number(v.score != null ? v.score : (group?.score ?? 0)) || 0 });
                continue;
              }
              const conf = Number(v.score != null ? v.score : (group?.score ?? 0));
              boxes.push({ x: bx, y: by, width: bw, height: bh, confidence: Math.max(0, Math.min(1, conf || 0)) });
            }
          }
        }
      }

      // Shape B: { detections: [{ x,y,width,height,confidence }] } in pixel units
      // Also support nested: { detections: [{ bbox: { x,y,width,height }, score, label }] }
      if (Array.isArray(serverResponse.detections)) {
        for (const d of serverResponse.detections) {
          const hasFlat = Number.isFinite(Number(d?.x)) || Number.isFinite(Number(d?.width));
          const bb = d?.bbox;
          const x = hasFlat ? Number(d.x || 0) : Number(bb?.x || 0);
          const y = hasFlat ? Number(d.y || 0) : Number(bb?.y || 0);
          const w2 = hasFlat ? Number(d.width || 0) : Number(bb?.width || 0);
          const h2 = hasFlat ? Number(d.height || 0) : Number(bb?.height || 0);
          const conf = (d.confidence != null) ? Number(d.confidence) : (d.score != null ? Number(d.score) : 0);
          boxes.push({
            x: Math.max(0, Math.round(x || 0)),
            y: Math.max(0, Math.round(y || 0)),
            width: Math.max(0, Math.round(w2 || 0)),
            height: Math.max(0, Math.round(h2 || 0)),
            confidence: Math.max(0, Math.min(1, Number(conf || 0)))
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
          const vals = [x1, y1, x2, y2].map(a => Math.abs(a));
          const isFraction = vals.every(val => val <= 1);
          const sx = isFraction ? w : 0.01 * w;
          const sy = isFraction ? h : 0.01 * h;
          // Compute edges with floor/ceil to preserve tiny positive boxes
          const fx1 = x1 * sx, fy1 = y1 * sy;
          const fx2 = x2 * sx, fy2 = y2 * sy;
          const px1 = Math.max(0, Math.floor(fx1));
          const py1 = Math.max(0, Math.floor(fy1));
          const px2 = Math.min(w, Math.ceil(fx2));
          const py2 = Math.min(h, Math.ceil(fy2));
          const bw = Math.max(0, px2 - px1), bh = Math.max(0, py2 - py1);
          if (bw <= 0 || bh <= 0) {
            points.push({ x: Math.round(x1 * sx), y: Math.round(y1 * sy), confidence: Math.max(0, Math.min(1, Number(scores[i] || 0))) });
            continue;
          }
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
        // If top box somehow lacks area (should be filtered), fallback to top-left point
        const top = ordered[0];
        if ((top.width || 0) > 0 && (top.height || 0) > 0) {
          primary = { type: 'bbox', ...top };
        } else {
          primary = { type: 'point', x: Math.round(top.x), y: Math.round(top.y), confidence: top.confidence };
        }
        others = ordered.slice(1).map(b => ((b.width || 0) > 0 && (b.height || 0) > 0)
          ? ({ type: 'bbox', ...b })
          : ({ type: 'point', x: Math.round(b.x), y: Math.round(b.y), confidence: b.confidence }));
      } else if (points.length > 0) {
        // Use best point candidate from degenerate detections
        points.sort((a,b) => (b.confidence || 0) - (a.confidence || 0));
        const p0 = points[0];
        primary = { type: 'point', x: Math.max(0, Math.min(w, Math.round(p0.x))), y: Math.max(0, Math.min(h, Math.round(p0.y))), confidence: p0.confidence };
        others = points.slice(1).map(p => ({ type:'point', x: Math.max(0, Math.min(w, Math.round(p.x))), y: Math.max(0, Math.min(h, Math.round(p.y))), confidence: p.confidence }));
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
