var App = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // docs/src/core/utils.js
  function onKey(code, fn) {
    window.addEventListener("keydown", (e) => {
      if (e.code === code && !e.repeat) {
        const el = document.activeElement;
        const isEditable = !!(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || // HTMLElement check guards against non-Element activeElement in edge cases
        el instanceof HTMLElement && el.isContentEditable));
        if (isEditable) return;
        fn();
        e.preventDefault();
      }
    });
  }
  function csvRow(val) {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  async function blobToDataURL(blob) {
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }
  async function sha256(blob) {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function uuid() {
    try {
      if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch {
    }
    try {
      const arr = new Uint8Array(16);
      crypto && crypto.getRandomValues ? crypto.getRandomValues(arr) : arr.fill(Math.random() * 255);
      arr[6] = arr[6] & 15 | 64;
      arr[8] = arr[8] & 63 | 128;
      const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    } catch {
      return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }
  function ulid() {
    const t = Date.now().toString(36).padStart(8, "0");
    const r = Array.from(crypto.getRandomValues(new Uint8Array(10))).map((b) => b.toString(36).slice(-1)).join("");
    return (t + r).slice(0, 18);
  }
  function truncate(s, max = 2e3) {
    s = String(s || "");
    return s.length > max ? s.slice(0, max) + "\u2026" : s;
  }
  var clamp;
  var init_utils = __esm({
    "docs/src/core/utils.js"() {
      clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    }
  });

  // docs/src/components/image-loader.js
  var ImageLoader;
  var init_image_loader = __esm({
    "docs/src/components/image-loader.js"() {
      init_utils();
      ImageLoader = class {
        constructor(canvas) {
          this.canvas = canvas;
          this.ctx = canvas.getContext("2d");
          this.current = null;
        }
        async loadFile(file) {
          const blob = file;
          const name = file.name;
          return await this._loadBlob(blob, name);
        }
        async loadBlob(blob, name = "image") {
          return await this._loadBlob(blob, name);
        }
        async _loadBlob(blob, name) {
          let bitmap;
          try {
            bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
          } catch {
            bitmap = await createImageBitmap(blob);
          }
          const width = bitmap.width;
          const height = bitmap.height;
          const dpr = window.devicePixelRatio || 1;
          this.canvas.width = width * dpr;
          this.canvas.height = height * dpr;
          this.canvas.style.aspectRatio = `${width} / ${height}`;
          this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          this.ctx.clearRect(0, 0, width, height);
          this.ctx.drawImage(bitmap, 0, 0, width, height);
          this.current = { bitmap, width, height, blob, name };
          return this.current;
        }
        getCurrent() {
          return this.current;
        }
      };
    }
  });

  // docs/src/components/overlay-renderer.js
  var OverlayRenderer;
  var init_overlay_renderer = __esm({
    "docs/src/components/overlay-renderer.js"() {
      init_utils();
      OverlayRenderer = class {
        constructor(canvas, legendEl) {
          this.canvas = canvas;
          this.ctx = canvas.getContext("2d");
          this.legendEl = legendEl;
          this.image = null;
          this.observer = new ResizeObserver(() => this.redraw());
          this.observer.observe(this.canvas.parentElement);
          window.addEventListener("resize", () => this.redraw());
        }
        clear() {
          const { width, height } = this.canvas;
          this.ctx.clearRect(0, 0, width, height);
          this.legendEl.innerHTML = "";
        }
        setImage(bitmap, width, height, name) {
          this.image = { bitmap, width, height, name };
          this.redraw();
        }
        drawDetections(items) {
          this._detections = items.filter((i) => i.det);
          this.redraw();
        }
        redraw() {
          if (!this.image) return;
          const parent = this.canvas.parentElement;
          const cssW = parent.clientWidth;
          const cssH = parent.clientHeight;
          if (cssW === 0 || cssH === 0) return;
          const imgW = this.image.width;
          const imgH = this.image.height;
          const scale = Math.min(cssW / imgW, cssH / imgH);
          const dispW = Math.max(1, Math.floor(imgW * scale));
          const dispH = Math.max(1, Math.floor(imgH * scale));
          const dpr = window.devicePixelRatio || 1;
          this.canvas.width = dispW * dpr;
          this.canvas.height = dispH * dpr;
          this.canvas.style.width = dispW + "px";
          this.canvas.style.height = dispH + "px";
          const ctx = this.ctx;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, dispW, dispH);
          ctx.drawImage(this.image.bitmap, 0, 0, dispW, dispH);
          if (this._detections && this._detections.length) {
            for (const item of this._detections) {
              this._drawDetection(ctx, item, dispW / imgW, dispH / imgH);
            }
          }
          this._renderLegend();
        }
        _renderLegend() {
          const items = this._detections || [];
          if (!items.length) {
            this.legendEl.innerHTML = "";
            return;
          }
          this.legendEl.innerHTML = items.map((i) => `<span class="item"><span class="swatch" style="background:${i.color}"></span>${i.model}</span>`).join(" ");
        }
        _drawDetection(ctx, item, scaleX, scaleY) {
          const { det, color, model } = item;
          ctx.save();
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = 2;
          ctx.font = "12px ui-monospace, monospace";
          if (det.type === "point") {
            const x = det.x * scaleX;
            const y = det.y * scaleY;
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x - 8, y);
            ctx.lineTo(x + 8, y);
            ctx.moveTo(x, y - 8);
            ctx.lineTo(x, y + 8);
            ctx.stroke();
            this._label(ctx, x + 8, y - 8, model);
          } else if (det.type === "bbox") {
            const x = det.x * scaleX;
            const y = det.y * scaleY;
            const w = det.width * scaleX;
            const h = det.height * scaleY;
            ctx.strokeRect(x, y, w, h);
            this._label(ctx, x, Math.max(0, y - 6), model);
          }
          ctx.restore();
        }
        _label(ctx, x, y, text) {
          const pad = 3;
          const metrics = ctx.measureText(text);
          const w = metrics.width + pad * 2;
          const h = 14 + pad * 2;
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(x, y - h, w, h);
          ctx.fillStyle = "#fff";
          ctx.fillText(text, x + pad, y - pad);
          ctx.restore();
        }
      };
    }
  });

  // docs/src/core/storage.js
  function randomColor(exclude) {
    const pick = () => COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    let c = pick();
    if (exclude && typeof exclude === "string") {
      const ex = exclude.toLowerCase();
      if (c.toLowerCase() === ex) {
        const i = COLOR_PALETTE.indexOf(c);
        c = COLOR_PALETTE[(i + 1) % COLOR_PALETTE.length];
      }
    }
    return c;
  }
  function defaultModels() {
    return [
      {
        id: uuid(),
        color: "#ff7a7a",
        enabled: true,
        baseURL: "https://api.openai.com/v1",
        apiKey: "",
        endpointType: "chat",
        model: "gpt-4o-mini",
        temperature: 0,
        maxTokens: 300,
        extraHeaders: void 0,
        timeoutMs: 6e4
      },
      {
        id: uuid(),
        color: "#7ad1ff",
        enabled: false,
        baseURL: "https://api.example.com/v1",
        apiKey: "",
        endpointType: "responses",
        model: "gpt-4o-mini",
        temperature: 0,
        maxTokens: 300,
        extraHeaders: void 0,
        timeoutMs: 6e4
      }
    ];
  }
  var COLOR_PALETTE, LS_MODELS, LS_LAST_PROMPT, Storage;
  var init_storage = __esm({
    "docs/src/core/storage.js"() {
      init_utils();
      COLOR_PALETTE = ["#ff7a7a", "#7ad1ff", "#c38bff", "#3ecf8e", "#ff5f6a", "#6aa6ff", "#f5c542", "#9b59b6", "#f0932b", "#e056fd", "#badc58"];
      LS_MODELS = "ui-detective:model-configs";
      LS_LAST_PROMPT = "ui-detective:last-prompt";
      Storage = class {
        getModelConfigs() {
          const s = localStorage.getItem(LS_MODELS);
          if (!s) {
            const d = defaultModels();
            localStorage.setItem(LS_MODELS, JSON.stringify(d));
            return d;
          }
          try {
            return JSON.parse(s);
          } catch {
            return defaultModels();
          }
        }
        setModelConfigs(arr) {
          localStorage.setItem(LS_MODELS, JSON.stringify(arr));
        }
        addDefaultModel() {
          const all = this.getModelConfigs();
          const last = all[all.length - 1];
          const model = {
            id: uuid(),
            color: randomColor(last?.color),
            enabled: true,
            baseURL: last?.baseURL ?? "https://api.example.com/v1",
            apiKey: last?.apiKey ?? "",
            endpointType: last?.endpointType ?? "chat",
            model: last?.model ?? "gpt-4o-mini",
            temperature: last?.temperature ?? 0,
            maxTokens: last?.maxTokens ?? 300,
            extraHeaders: last?.extraHeaders ? { ...last.extraHeaders } : void 0,
            timeoutMs: last?.timeoutMs ?? 6e4
          };
          all.push(model);
          this.setModelConfigs(all);
          return model;
        }
        updateModel(updated) {
          const all = this.getModelConfigs();
          const idx = all.findIndex((m) => m.id === updated.id);
          if (idx >= 0) all[idx] = updated;
          this.setModelConfigs(all);
        }
        deleteModel(id) {
          const all = this.getModelConfigs().filter((x) => x.id !== id);
          this.setModelConfigs(all);
        }
        getLastPrompt() {
          return localStorage.getItem(LS_LAST_PROMPT) || "";
        }
        setLastPrompt(s) {
          localStorage.setItem(LS_LAST_PROMPT, s);
        }
      };
    }
  });

  // docs/src/core/api-client.js
  var ApiClient;
  var init_api_client = __esm({
    "docs/src/core/api-client.js"() {
      init_utils();
      ApiClient = class {
        async testConnection(model) {
          const url = this._endpointUrl(model);
          const t0 = performance.now();
          const body = model.endpointType === "responses" ? { model: model.model, max_output_tokens: 1, input: [{ role: "user", content: [{ type: "text", text: "ping" }] }] } : { model: model.model, max_tokens: 1, messages: [{ role: "user", content: [{ type: "text", text: "ping" }] }] };
          const res = await fetch(url, {
            method: "POST",
            headers: this._headers(model),
            body: JSON.stringify(body)
          });
          const timeMs = Math.round(performance.now() - t0);
          return { ok: res.ok, status: res.status, timeMs };
        }
        async callModel({ model, baseURL, apiKey, endpointType, temperature = 0, maxTokens = 300, extraHeaders, timeoutMs = 6e4 }, imageBlob, prompt, onLogSanitized) {
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
          if (endpointType === "responses") {
            body = {
              model,
              temperature,
              max_output_tokens: maxTokens,
              input: [
                { role: "system", content: [{ type: "text", text: sysPrompt }] },
                { role: "user", content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: b64 } }
                ] }
              ],
              response_format: { type: "json_object" }
            };
          } else {
            body = {
              model,
              temperature,
              max_tokens: maxTokens,
              messages: [
                { role: "system", content: [{ type: "text", text: sysPrompt }] },
                { role: "user", content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: b64 } }
                ] }
              ],
              response_format: { type: "json_object" }
            };
          }
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort("timeout"), timeoutMs);
          const t0 = performance.now();
          let status = 0;
          let rawText = "";
          try {
            const res = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify(body),
              signal: controller.signal
            });
            status = res.status;
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
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
              response: { status, rawText, parsedStatus: "ok" },
              timing: { startedAtIso: new Date(t0 + performance.timeOrigin).toISOString(), finishedAtIso: (/* @__PURE__ */ new Date()).toISOString(), latencyMs: latency }
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
              response: { status: status || 0, rawText: errText, parsedStatus: "error" },
              timing: { startedAtIso: new Date(t0 + performance.timeOrigin).toISOString(), finishedAtIso: (/* @__PURE__ */ new Date()).toISOString(), latencyMs: latency }
            };
            onLogSanitized?.(log);
            throw e;
          }
        }
        _endpointUrl({ baseURL, endpointType }) {
          const base = baseURL.replace(/\/$/, "");
          return endpointType === "responses" ? `${base}/responses` : `${base}/chat/completions`;
        }
        _headers({ apiKey, extraHeaders }) {
          const base = {
            "Content-Type": "application/json",
            ...extraHeaders || {}
          };
          if (apiKey) base["Authorization"] = `Bearer ${apiKey}`;
          return base;
        }
        _sanitizeHeaders(h) {
          const clone = { ...h };
          delete clone["Authorization"];
          return clone;
        }
        _extractTextFromResponse(j, endpointType) {
          if (endpointType === "responses") {
            if (j && typeof j.output_text === "string") return j.output_text;
            if (Array.isArray(j.output)) {
              const block = j.output.find((o) => o?.content);
              if (block) {
                const t = block.content.find((c) => c.type?.includes("text") && c.text);
                if (t) return t.text;
              }
            }
          } else {
            const t = j?.choices?.[0]?.message?.content;
            if (typeof t === "string") return t;
            if (Array.isArray(t)) {
              const first = t.find((x) => x.type && (x.type.includes("text") || x.type === "output_text"));
              if (first && first.text) return first.text;
            }
          }
          return JSON.stringify(j);
        }
      };
    }
  });

  // docs/src/core/parser.js
  var Parser;
  var init_parser = __esm({
    "docs/src/core/parser.js"() {
      Parser = class {
        parse(rawText, imgW, imgH) {
          let obj;
          try {
            obj = JSON.parse(rawText);
          } catch {
            return { ok: false, status: "invalid_json", value: null, error: "Invalid JSON" };
          }
          const image_size = obj.image_size;
          const primary = obj.primary;
          if (!image_size || !primary) {
            return { ok: false, status: "invalid_json", value: null, error: "Missing required keys" };
          }
          const width = this._toNum(image_size.width);
          const height = this._toNum(image_size.height);
          if (!Number.isFinite(width) || !Number.isFinite(height)) {
            return { ok: false, status: "invalid_json", value: null, error: "Invalid image_size" };
          }
          const normalized = {
            imageSize: { width, height },
            primary: this._normDet(primary, width, height),
            others: Array.isArray(obj.others) ? obj.others.map((d) => this._normDet(d, width, height)).filter(Boolean) : [],
            notes: typeof obj.notes === "string" ? obj.notes : void 0
          };
          if (!normalized.primary) {
            return { ok: false, status: "invalid_json", value: null, error: "Invalid primary" };
          }
          return { ok: true, status: "ok", value: normalized };
        }
        _toNum(x) {
          const n = Number(x);
          return Number.isFinite(n) ? n : NaN;
        }
        _normDet(d, w, h) {
          if (!d || d.type !== "point" && d.type !== "bbox") return null;
          if (d.type === "point") {
            const x = this._clampNum(d.x, 0, w);
            const y = this._clampNum(d.y, 0, h);
            const conf = d.confidence != null ? Number(d.confidence) : null;
            return { type: "point", x, y, confidence: Number.isFinite(conf) ? conf : null };
          } else {
            const x = this._clampNum(d.x, 0, w);
            const y = this._clampNum(d.y, 0, h);
            const width = this._clampNum(d.width, 0, w);
            const height = this._clampNum(d.height, 0, h);
            const conf = d.confidence != null ? Number(d.confidence) : null;
            return { type: "bbox", x, y, width, height, confidence: Number.isFinite(conf) ? conf : null };
          }
        }
        _clampNum(x, min, max) {
          const n = Number(x);
          if (!Number.isFinite(n)) return min;
          if (n < min) return min;
          if (n > max) return max;
          return n;
        }
      };
    }
  });

  // docs/src/components/model-tabs.js
  var ModelTabs;
  var init_model_tabs = __esm({
    "docs/src/components/model-tabs.js"() {
      init_storage();
      init_api_client();
      init_parser();
      init_utils();
      ModelTabs = class {
        constructor(tabsHeaderEl, tabsBodyEl, storage) {
          this.header = tabsHeaderEl;
          this.body = tabsBodyEl;
          this.storage = storage;
          this.parser = new Parser();
          this.activeId = null;
          this.render();
        }
        getEnabledModels() {
          return this.storage.getModelConfigs().filter((m) => m.enabled);
        }
        render() {
          const configs = this.storage.getModelConfigs();
          if (!this.activeId || !configs.find((m) => m.id === this.activeId)) {
            this.activeId = configs[0]?.id || null;
          }
          this.header.innerHTML = "";
          this.body.innerHTML = "";
          configs.forEach((cfg) => {
            const btn = document.createElement("button");
            btn.className = "tab-btn" + (cfg.id === this.activeId ? " active" : "");
            btn.dataset.modelId = cfg.id;
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-selected", cfg.id === this.activeId ? "true" : "false");
            btn.setAttribute("aria-controls", `model-pane-${cfg.id}`);
            const swatch = document.createElement("span");
            swatch.className = "swatch";
            swatch.setAttribute("role", "switch");
            swatch.setAttribute("aria-checked", String(cfg.enabled));
            swatch.title = cfg.enabled ? "Enabled \u2014 click to disable" : "Disabled \u2014 click to enable";
            swatch.style.background = cfg.enabled ? cfg.color : "transparent";
            swatch.style.borderColor = cfg.color;
            const label = document.createElement("span");
            label.className = "label";
            label.textContent = cfg.model || "(model id)";
            swatch.addEventListener("click", (e) => {
              e.stopPropagation();
              const toggled = { ...cfg, enabled: !cfg.enabled };
              this.storage.updateModel(toggled);
              cfg.enabled = toggled.enabled;
              swatch.setAttribute("aria-checked", String(cfg.enabled));
              swatch.title = cfg.enabled ? "Enabled \u2014 click to disable" : "Disabled \u2014 click to enable";
              swatch.style.background = cfg.enabled ? cfg.color : "transparent";
              swatch.style.borderColor = cfg.color;
              const paneCard = this.body.querySelector(`#model-${cfg.id}`);
              if (paneCard) {
                const chk = paneCard.querySelector('input[type="checkbox"]');
                if (chk) chk.checked = cfg.enabled;
              }
            });
            btn.appendChild(swatch);
            btn.appendChild(label);
            btn.addEventListener("click", () => this.setActive(cfg.id));
            this.header.appendChild(btn);
            const pane = document.createElement("div");
            pane.id = `model-pane-${cfg.id}`;
            pane.className = "tab-pane" + (cfg.id === this.activeId ? " active" : "");
            pane.setAttribute("role", "tabpanel");
            pane.setAttribute("aria-label", `${cfg.model || "Model"} settings`);
            pane.appendChild(this._renderCard(cfg));
            this.body.appendChild(pane);
          });
          const addBtn = document.createElement("button");
          addBtn.className = "btn";
          addBtn.id = "addModelBtn";
          addBtn.textContent = "+ Add Model";
          addBtn.addEventListener("click", () => {
            const newCfg = this.storage.addDefaultModel();
            this.activeId = newCfg.id;
            this.render();
            setTimeout(() => {
              const el = this.body.querySelector(`#model-${newCfg.id}`) || this.body.querySelector(`#model-pane-${newCfg.id}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 0);
          });
          this.header.appendChild(addBtn);
          const actionsWrap = document.createElement("div");
          actionsWrap.style.marginLeft = "auto";
          actionsWrap.style.display = "flex";
          actionsWrap.style.gap = "8px";
          actionsWrap.style.alignItems = "center";
          const exportBtn = document.createElement("button");
          exportBtn.className = "btn";
          exportBtn.id = "exportModelsBtn";
          exportBtn.textContent = "Export Models";
          actionsWrap.appendChild(exportBtn);
          const importInput = document.createElement("input");
          importInput.type = "file";
          importInput.id = "importModelsInput";
          importInput.accept = "application/json";
          importInput.setAttribute("aria-label", "Import model configurations");
          actionsWrap.appendChild(importInput);
          exportBtn.onclick = () => {
            const data = this.storage.getModelConfigs();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "model-configs.json";
            a.click();
            URL.revokeObjectURL(url);
          };
          importInput.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const text = await file.text();
            try {
              const json = JSON.parse(text);
              this.storage.setModelConfigs(json);
              const first = this.storage.getModelConfigs()[0];
              this.activeId = first?.id || null;
              this.render();
              alert("Imported model configurations.");
            } catch (err) {
              alert("Invalid JSON.");
            }
          };
          this.header.appendChild(actionsWrap);
        }
        setActive(id) {
          this.activeId = id;
          Array.from(this.header.querySelectorAll(".tab-btn")).forEach((b) => {
            const isActive = b.dataset.modelId === id;
            b.classList.toggle("active", isActive);
            b.setAttribute("aria-selected", isActive ? "true" : "false");
          });
          Array.from(this.body.querySelectorAll(".tab-pane")).forEach((p) => {
            p.classList.toggle("active", p.id === `model-pane-${id}`);
          });
        }
        _renderCard(cfg) {
          const card = document.createElement("div");
          card.className = "model-card";
          card.id = `model-${cfg.id}`;
          card.innerHTML = `
      <div class="header">
        <span class="title">${cfg.model || "(model id)"}</span>
        <label style="margin-left:auto;"><input type="checkbox" ${cfg.enabled ? "checked" : ""}/> Enabled</label>
      </div>
      <div class="model-grid">
        <div>
          <label>Color (hex)</label>
          <input data-field="color" type="text" value="${cfg.color}"/>
        </div>
        <div>
          <label>Endpoint Type</label>
          <select data-field="endpointType">
            <option value="chat" ${cfg.endpointType === "chat" ? "selected" : ""}>chat</option>
            <option value="responses" ${cfg.endpointType === "responses" ? "selected" : ""}>responses</option>
          </select>
        </div>
        <div>
          <label>Base URL</label>
          <input data-field="baseURL" type="text" value="${cfg.baseURL}" placeholder="https://api.example.com/v1"/>
        </div>
        <div>
          <label>Model ID</label>
          <input data-field="model" type="text" value="${cfg.model}" placeholder="gpt-4o-mini"/>
        </div>
        <div>
          <label>API Key</label>
          <input data-field="apiKey" type="password" value="${cfg.apiKey || ""}" placeholder="sk-..."/>
        </div>
        <div>
          <label>Temperature</label>
          <input data-field="temperature" type="number" value="${cfg.temperature ?? 0}" step="0.1"/>
        </div>
        <div>
          <label>Max tokens</label>
          <input data-field="maxTokens" type="number" value="${cfg.maxTokens ?? 300}"/>
        </div>
        <div>
          <label>Timeout (ms)</label>
          <input data-field="timeoutMs" type="number" value="${cfg.timeoutMs ?? 6e4}"/>
        </div>
      </div>
      <div class="row">
        <div style="flex:1">
          <label>Extra headers (JSON)</label>
          <textarea data-field="extraHeaders" rows="3" placeholder='{"X-Org":"..."}'>${cfg.extraHeaders ? JSON.stringify(cfg.extraHeaders) : ""}</textarea>
        </div>
      </div>
      <div class="row">
        <button class="btn" data-act="test">Test Connection</button>
        <button class="btn danger" data-act="delete" title="Remove model">Delete</button>
      </div>
      <div class="row">
        <div style="flex:1">
          <label>Log</label>
          <pre class="log-area" data-log>\u2014</pre>
        </div>
      </div>
    `;
          const enabled = card.querySelector('.header input[type="checkbox"]');
          const color = card.querySelector('input[data-field="color"]');
          const endpointSelect = card.querySelector('select[data-field="endpointType"]');
          const baseURL = card.querySelector('input[data-field="baseURL"]');
          const model = card.querySelector('input[data-field="model"]');
          const key = card.querySelector('input[data-field="apiKey"]');
          const temp = card.querySelector('input[data-field="temperature"]');
          const maxTok = card.querySelector('input[data-field="maxTokens"]');
          const timeout = card.querySelector('input[data-field="timeoutMs"]');
          const headersTa = card.querySelector('textarea[data-field="extraHeaders"]');
          const logEl = card.querySelector("[data-log]");
          let colorPopover = null;
          const closeColorPopover = () => {
            if (colorPopover) {
              document.body.removeChild(colorPopover);
              document.removeEventListener("mousedown", onDocDown, true);
              document.removeEventListener("keydown", onDocKey, true);
              colorPopover = null;
            }
          };
          const onDocDown = (ev) => {
            if (!colorPopover) return;
            if (ev.target === color || colorPopover.contains(ev.target)) return;
            closeColorPopover();
          };
          const onDocKey = (ev) => {
            if (ev.key === "Escape") closeColorPopover();
          };
          const showColorPopover = () => {
            if (colorPopover) return;
            const rect = color.getBoundingClientRect();
            const pop = document.createElement("div");
            pop.className = "color-popover";
            pop.innerHTML = `
        <div class="row" style="align-items:center; gap:8px;">
          <input type="color" value="${(color.value || "#ffffff").substring(0, 7)}" aria-label="Pick color" />
          <div class="swatches"></div>
        </div>
      `;
            const presets = ["#ff7a7a", "#7ad1ff", "#c38bff", "#3ecf8e", "#ff5f6a", "#6aa6ff", "#f5c542", "#9b59b6"];
            const swWrap = pop.querySelector(".swatches");
            presets.forEach((hex) => {
              const s = document.createElement("span");
              s.className = "mini-swatch";
              s.style.background = hex;
              s.title = hex;
              s.addEventListener("click", () => {
                color.value = hex;
                persist();
              });
              swWrap.appendChild(s);
            });
            const nativePicker = pop.querySelector('input[type="color"]');
            nativePicker.addEventListener("input", () => {
              color.value = nativePicker.value;
              persist();
            });
            pop.style.position = "absolute";
            pop.style.left = `${window.scrollX + rect.left}px`;
            pop.style.top = `${window.scrollY + rect.bottom + 6}px`;
            pop.style.zIndex = "1000";
            document.body.appendChild(pop);
            colorPopover = pop;
            setTimeout(() => {
              document.addEventListener("mousedown", onDocDown, true);
              document.addEventListener("keydown", onDocKey, true);
            }, 0);
          };
          color.addEventListener("focus", showColorPopover);
          color.addEventListener("blur", () => {
          });
          const persist = () => {
            let extra = void 0;
            try {
              extra = headersTa.value.trim() ? JSON.parse(headersTa.value) : void 0;
            } catch (e) {
              alert("Extra headers must be valid JSON.");
              return;
            }
            const updated = {
              ...cfg,
              enabled: enabled.checked,
              color: color.value,
              endpointType: endpointSelect.value,
              baseURL: baseURL.value,
              model: model.value,
              apiKey: key.value,
              temperature: Number(temp.value),
              maxTokens: Number(maxTok.value),
              timeoutMs: Number(timeout.value),
              extraHeaders: extra
            };
            this.storage.updateModel(updated);
            const tabBtn = this.header.querySelector(`.tab-btn[data-model-id="${cfg.id}"]`);
            if (tabBtn) {
              const sw = tabBtn.querySelector(".swatch");
              if (sw) {
                sw.setAttribute("aria-checked", String(updated.enabled));
                sw.title = updated.enabled ? "Enabled \u2014 click to disable" : "Disabled \u2014 click to enable";
                sw.style.background = updated.enabled ? updated.color : "transparent";
                sw.style.borderColor = updated.color;
              }
              const lab = tabBtn.querySelector(".label");
              if (lab) lab.textContent = updated.model || "(model id)";
            }
            const titleEl = card.querySelector(".title");
            if (titleEl) titleEl.textContent = updated.model || "(model id)";
            const pane = this.body.querySelector(`#model-pane-${cfg.id}`);
            if (pane) pane.setAttribute("aria-label", `${updated.model || "Model"} settings`);
            Object.assign(cfg, updated);
          };
          card.querySelector('[data-act="delete"]').onclick = () => {
            if (!confirm("Delete this model?")) return;
            const deletedId = cfg.id;
            this.storage.deleteModel(deletedId);
            const remaining = this.storage.getModelConfigs();
            if (this.activeId === deletedId) {
              this.activeId = remaining[0]?.id || null;
            }
            this.render();
          };
          card.querySelector('[data-act="test"]').onclick = async () => {
            persist();
            const s = this.storage.getModelConfigs().find((m) => m.id === cfg.id);
            const client = new ApiClient();
            logEl.textContent = "Testing\u2026";
            try {
              const { ok, status, timeMs } = await client.testConnection(s);
              logEl.textContent = ok ? `OK \u2022 HTTP ${status} \u2022 ${timeMs} ms` : `HTTP ${status}`;
            } catch (e) {
              logEl.textContent = `Error: ${e?.message || e}`;
            }
          };
          enabled.addEventListener("change", persist);
          color.addEventListener("input", persist);
          endpointSelect.addEventListener("change", persist);
          baseURL.addEventListener("input", persist);
          model.addEventListener("input", persist);
          key.addEventListener("input", persist);
          temp.addEventListener("input", persist);
          maxTok.addEventListener("input", persist);
          timeout.addEventListener("input", persist);
          headersTa.addEventListener("input", persist);
          return card;
        }
      };
    }
  });

  // docs/src/components/results-table.js
  var ResultsTable;
  var init_results_table = __esm({
    "docs/src/components/results-table.js"() {
      init_utils();
      ResultsTable = class {
        constructor(rootEl, historyStore) {
          this.root = rootEl;
          this.historyStore = historyStore;
          this.scope = "run";
          this.current = null;
          this.renderScopeBar();
        }
        renderScopeBar() {
          this.root.innerHTML = "";
          const bar = document.createElement("div");
          bar.className = "scope-bar";
          bar.innerHTML = `
      <label>Scope</label>
      <select id="scopeSel">
        <option value="run">This run</option>
        <option value="batch">This batch</option>
        <option value="all">All runs</option>
      </select>
      <button class="btn" id="exportCsvBtn">Export CSV</button>
    `;
          this.root.appendChild(bar);
          bar.querySelector("#scopeSel").value = this.scope;
          bar.querySelector("#scopeSel").onchange = (e) => {
            this.scope = e.target.value;
            this.renderTable();
          };
          bar.querySelector("#exportCsvBtn").onclick = () => this.exportCsv();
          const wrap = document.createElement("div");
          wrap.className = "table-wrap";
          wrap.innerHTML = `<table id="resultsTable"><thead></thead><tbody></tbody></table>`;
          this.root.appendChild(wrap);
        }
        clear() {
          this.current = null;
          this.renderTable();
        }
        showRun(runMeta, runData) {
          this.current = { runMeta, runData };
          this.renderTable();
        }
        _columns() {
          return [
            "batchId",
            "batchSeq",
            "runId",
            "runLabel",
            "timestampIso",
            "imageName",
            "imageW",
            "imageH",
            "prompt",
            "modelDisplayName",
            "baseURL",
            "model",
            "detectionType",
            "x",
            "y",
            "width",
            "height",
            "confidence",
            "latencyMs",
            "status",
            "error",
            "rawTextShort"
          ];
        }
        async _rowsForScope() {
          const cols = this._columns();
          const rows = [];
          if (this.scope === "run") {
            if (!this.current) return [];
            const { runMeta, runData } = this.current;
            for (const r of runData.results) {
              rows.push(this._row(runMeta, r));
            }
            return rows;
          }
          if (this.scope === "batch") {
            if (!this.current) return [];
            const batchId = this.current.runMeta.batchId;
            const runs = await this.historyStore.listRunsInBatch(batchId);
            for (const rm of runs) {
              const data = await this.historyStore.getRunData(rm.id);
              for (const r of data.results) rows.push(this._row(rm, r));
            }
            return rows;
          }
          if (this.scope === "all") {
            const all = await this.historyStore.listAllRuns();
            for (const rm of all) {
              const data = await this.historyStore.getRunData(rm.id);
              for (const r of data.results) rows.push(this._row(rm, r));
            }
            return rows;
          }
        }
        _row(runMeta, r) {
          const runLabel = this.historyStore.labelForRun(runMeta.id);
          const det = r.parsed?.primary || null;
          return {
            batchId: runMeta.batchId,
            batchSeq: runMeta.batchSeq,
            runId: runMeta.id,
            runLabel: `Run #${runLabel}`,
            timestampIso: runMeta.createdAtIso,
            imageName: runMeta.imageName,
            imageW: runMeta.imageW,
            imageH: runMeta.imageH,
            prompt: runMeta.prompt,
            modelDisplayName: r.modelDisplayName,
            baseURL: this.historyStore.snapshotBaseURL(runMeta, r.modelDisplayName),
            model: this.historyStore.snapshotModelId(runMeta, r.modelDisplayName),
            detectionType: det?.type || "",
            x: det?.x ?? "",
            y: det?.y ?? "",
            width: det?.width ?? "",
            height: det?.height ?? "",
            confidence: det?.confidence ?? "",
            latencyMs: r.latencyMs ?? "",
            status: r.status,
            error: r.errorMessage || "",
            rawTextShort: (r.rawText || "").slice(0, 200)
          };
        }
        async renderTable() {
          const thead = this.root.querySelector("#resultsTable thead");
          const tbody = this.root.querySelector("#resultsTable tbody");
          if (!thead || !tbody) return;
          const cols = this._columns();
          thead.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
          tbody.innerHTML = `<tr><td colspan="${cols.length}">Loading\u2026</td></tr>`;
          const rows = await this._rowsForScope();
          if (!rows || rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${cols.length}">No data.</td></tr>`;
            return;
          }
          tbody.innerHTML = rows.map((r) => `<tr>${cols.map((c) => `<td>${String(r[c] ?? "")}</td>`).join("")}</tr>`).join("");
        }
        async exportCsv() {
          const cols = this._columns();
          const rows = await this._rowsForScope();
          const header = cols.join(",");
          const lines = [header, ...rows.map((r) => cols.map((c) => csvRow(r[c])).join(","))];
          const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `results-${this.scope}-${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }
      };
    }
  });

  // docs/src/components/history-table.js
  var HistoryTable;
  var init_history_table = __esm({
    "docs/src/components/history-table.js"() {
      HistoryTable = class {
        constructor(rootEl, historyStore) {
          this.root = rootEl;
          this.historyStore = historyStore;
          this.handlers = [];
          this.selectedRunId = null;
          this._init();
        }
        _init() {
          this.root.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Image</th>
              <th>Prompt</th>
              <th>OK</th>
              <th>Err</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;
          this.root.addEventListener("click", async (e) => {
            const tr = e.target.closest("tr[data-run-id]");
            if (!tr) return;
            const runId = tr.getAttribute("data-run-id");
            if (!runId) return;
            const entry = await this.historyStore.loadRunById(runId);
            this.handlers.forEach((fn) => fn(entry));
          });
        }
        onSelect(fn) {
          this.handlers.push(fn);
        }
        labelForRun(runId) {
          return this.historyStore.labelForRun(runId);
        }
        async refresh(limit = 50) {
          const tbody = this.root.querySelector("tbody");
          if (!tbody) return;
          const list = await this.historyStore.listAllRuns();
          const recent = list.slice(0, limit);
          if (recent.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6">No runs yet.</td></tr>`;
            return;
          }
          tbody.innerHTML = recent.map((r) => {
            const time = new Date(r.createdAtIso).toLocaleTimeString();
            const prompt = (r.prompt || "").slice(0, 80);
            const sel = r.id === this.selectedRunId ? " selected" : "";
            return `
        <tr data-run-id="${r.id}" class="clickable${sel}">
          <td>${this.labelForRun(r.id)}</td>
          <td>${time}</td>
          <td title="${r.imageName}">${r.imageName}</td>
          <td class="prompt-cell" title="${r.prompt?.replaceAll('"', "&quot;") || ""}">${prompt}</td>
          <td>${r.summary?.okCount ?? ""}</td>
          <td>${r.summary?.errorCount ?? ""}</td>
        </tr>
      `;
          }).join("");
        }
        setSelected(runId) {
          this.selectedRunId = runId || null;
          const rows = Array.from(this.root.querySelectorAll("tr[data-run-id]"));
          rows.forEach((tr) => {
            if (tr.getAttribute("data-run-id") === this.selectedRunId) tr.classList.add("selected");
            else tr.classList.remove("selected");
          });
        }
      };
    }
  });

  // docs/src/components/history-dialog.js
  var HistoryDialog;
  var init_history_dialog = __esm({
    "docs/src/components/history-dialog.js"() {
      HistoryDialog = class {
        constructor(dialogEl, historyStore, overlay, resultsTable, imageLoader) {
          this.dialog = dialogEl;
          this.historyStore = historyStore;
          this.overlay = overlay;
          this.resultsTable = resultsTable;
          this.imageLoader = imageLoader;
          this.groupByBatch = false;
          document.getElementById("groupByBatchToggle").addEventListener("change", (e) => {
            this.groupByBatch = e.target.checked;
            this.renderBody();
          });
        }
        async open() {
          await this.renderBody();
          this.dialog.showModal();
        }
        async renderBody() {
          const body = document.getElementById("historyDialogBody");
          const runs = await this.historyStore.listAllRuns();
          if (!this.groupByBatch) {
            body.innerHTML = this._tableHtml(runs);
          } else {
            const groups = /* @__PURE__ */ new Map();
            for (const r of runs) {
              const g = groups.get(r.batchId) || [];
              g.push(r);
              groups.set(r.batchId, g);
            }
            body.innerHTML = Array.from(groups.entries()).map(([batchId, arr]) => {
              const header = `<h3>Batch ${batchId}</h3>`;
              return header + this._tableHtml(arr);
            }).join("");
          }
          body.querySelectorAll("[data-load]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const runId = btn.getAttribute("data-load");
              const { runMeta, runData } = await this.historyStore.loadRunById(runId);
              const img = await this.historyStore.getImage(runMeta.imageRef);
              const { bitmap } = await this.imageLoader.loadBlob(img, runMeta.imageName);
              this.overlay.setImage(bitmap, runMeta.imageW, runMeta.imageH, runMeta.imageName);
              this.overlay.drawDetections(runData.results.map((r) => ({ color: r.color, model: r.modelDisplayName, det: r.parsed?.primary || null })));
              this.resultsTable.showRun(runMeta, runData);
              this.dialog.close();
            });
          });
          body.querySelectorAll("[data-export]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const runId = btn.getAttribute("data-export");
              const { runMeta, runData } = await this.historyStore.loadRunById(runId);
              const rt = this.resultsTable;
              const prev = rt.current;
              rt.current = { runMeta, runData };
              const prevScope = rt.scope;
              rt.scope = "run";
              await rt.exportCsv();
              rt.current = prev;
              rt.scope = prevScope;
            });
          });
        }
        _tableHtml(rows) {
          return `<div class="table-wrap"><table><thead><tr>
      <th>#</th><th>Run ID</th><th>Batch</th><th>Seq</th><th>Time</th><th>Image</th><th>Prompt</th><th>OK</th><th>Errors</th><th>Actions</th>
    </tr></thead><tbody>
      ${rows.map((r) => `
        <tr>
          <td>${this.historyStore.labelForRun(r.id)}</td>
          <td>${r.id}</td>
          <td>${r.batchId}</td>
          <td>${r.batchSeq}</td>
          <td>${new Date(r.createdAtIso).toLocaleString()}</td>
          <td>${r.imageName}</td>
          <td>${r.prompt.slice(0, 80)}</td>
          <td>${r.summary.okCount}</td>
          <td>${r.summary.errorCount}</td>
          <td>
            <button class="btn" data-load="${r.id}">Load</button>
            <button class="btn" data-export="${r.id}">Export CSV</button>
          </td>
        </tr>
      `).join("")}
    </tbody></table></div>`;
        }
      };
    }
  });

  // docs/src/core/batch-runner.js
  var BatchRunner;
  var init_batch_runner = __esm({
    "docs/src/core/batch-runner.js"() {
      init_api_client();
      init_parser();
      BatchRunner = class {
        constructor(historyStore, overlay, resultsTable, modelTabs) {
          this.history = historyStore;
          this.overlay = overlay;
          this.resultsTable = resultsTable;
          this.modelTabs = modelTabs;
          this.cancelRequested = false;
        }
        cancel() {
          this.cancelRequested = true;
        }
        async runBatch({ iterations, imageBlob, imageName, prompt, enabledModels }, onProgress, onRunStart) {
          this.cancelRequested = false;
          const client = new ApiClient();
          const parser = new Parser();
          const batchMeta = await this.history.createBatchMeta({ iterations, imageBlob, imageName, prompt, enabledModels });
          await this.history.addBatchMeta(batchMeta);
          let done = 0;
          for (let seq = 1; seq <= iterations; seq++) {
            if (this.cancelRequested) break;
            const imgBitmap = await createImageBitmap(imageBlob, { imageOrientation: "from-image" });
            const imageW = imgBitmap.width;
            const imageH = imgBitmap.height;
            if (seq === 1) {
              batchMeta.imageW = imageW;
              batchMeta.imageH = imageH;
              await this.history.updateBatchMeta(batchMeta);
            }
            const runMeta = this.history.createRunMeta({ batchMeta, batchSeq: seq, imageW, imageH });
            await this.history.addRunMeta(runMeta);
            await this.history.putRunData(runMeta.id, { id: runMeta.id, results: [], logs: {} });
            onRunStart?.({ batchId: batchMeta.id, runId: runMeta.id, runMeta });
            const promises = enabledModels.map(async (m) => {
              let status = "ok", latencyMs = null, rawText = "", parsed = null, errorMessage = void 0;
              const onLog = (log) => this._appendLog(runMeta.id, m.id, log);
              try {
                const res = await client.callModel(m, imageBlob, prompt, onLog);
                latencyMs = res.latencyMs;
                rawText = res.rawText;
                const p = parser.parse(rawText, imageW, imageH);
                if (!p.ok) {
                  status = p.status;
                  errorMessage = p.error;
                }
                parsed = p.value;
              } catch (e) {
                status = String(e).includes("timeout") ? "timeout" : "error";
                errorMessage = String(e?.message || e);
              }
              const result = {
                modelId: m.id,
                modelDisplayName: m.model,
                color: m.color,
                status,
                latencyMs,
                rawText,
                parsed,
                errorMessage
              };
              await this._appendResult(runMeta.id, result);
              return result;
            });
            const settled = await Promise.all(promises);
            const items = settled.filter((r) => r.status === "ok" && r.parsed?.primary).map((r) => ({
              color: r.color,
              model: r.modelDisplayName,
              det: r.parsed.primary
            }));
            const ctxImage = await createImageBitmap(imageBlob, { imageOrientation: "from-image" });
            this.overlay.setImage(ctxImage, imageW, imageH, imageName);
            this.overlay.drawDetections(items);
            const okCount = settled.filter((r) => r.status === "ok").length;
            const errCount = settled.length - okCount;
            const avgLatency = (() => {
              const arr = settled.map((s) => s.latencyMs || 0).filter(Boolean);
              return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
            })();
            runMeta.summary = { okCount, errorCount: errCount, latencyAvgMs: avgLatency };
            await this.history.updateRunMeta(runMeta);
            batchMeta.summary.runsDone = seq;
            batchMeta.summary.okCount += okCount;
            batchMeta.summary.errorCount += errCount;
            const prevAvg = batchMeta.summary.avgLatencyMs;
            batchMeta.summary.avgLatencyMs = avgLatency != null ? prevAvg == null ? avgLatency : Math.round((prevAvg + avgLatency) / 2) : prevAvg;
            await this.history.updateBatchMeta(batchMeta);
            const runData = await this.history.getRunData(runMeta.id);
            this.resultsTable.showRun(runMeta, runData);
            done = seq;
            onProgress?.({ done, total: iterations, runLabel: this.history.labelForRun(runMeta.id), batchId: batchMeta.id, runId: runMeta.id, runMeta });
          }
        }
        async _appendLog(runId, modelId, log) {
          const data = await this.history.getRunData(runId);
          data.logs[modelId] = log;
          await this.history.putRunData(runId, data);
        }
        async _appendResult(runId, result) {
          const data = await this.history.getRunData(runId);
          data.results.push(result);
          await this.history.putRunData(runId, data);
        }
      };
    }
  });

  // docs/src/core/idb.js
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains(RUN_STORE)) db.createObjectStore(RUN_STORE);
        if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function withStore(store, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const st = tx.objectStore(store);
      const p = Promise.resolve(fn(st));
      tx.oncomplete = () => resolve(p);
      tx.onerror = () => reject(tx.error);
    });
  }
  var DB_NAME, DB_VER, RUN_STORE, IMG_STORE, IDB;
  var init_idb = __esm({
    "docs/src/core/idb.js"() {
      DB_NAME = "ui-detective";
      DB_VER = 1;
      RUN_STORE = "runs";
      IMG_STORE = "images";
      IDB = {
        async putRun(id, data) {
          return withStore(RUN_STORE, "readwrite", (st) => st.put(data, id));
        },
        async getRun(id) {
          return withStore(RUN_STORE, "readonly", (st) => new Promise((res, rej) => {
            const r = st.get(id);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          }));
        },
        async putImage(key, blob) {
          return withStore(IMG_STORE, "readwrite", (st) => st.put(blob, key));
        },
        async getImage(key) {
          return withStore(IMG_STORE, "readonly", (st) => new Promise((res, rej) => {
            const r = st.get(key);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          }));
        },
        async clearAll() {
          return withStore(RUN_STORE, "readwrite", (st) => st.clear()).then(() => withStore(IMG_STORE, "readwrite", (st) => st.clear()));
        }
      };
    }
  });

  // docs/src/core/history-store.js
  var LS_RUNS, LS_BATCHES, HistoryStore;
  var init_history_store = __esm({
    "docs/src/core/history-store.js"() {
      init_idb();
      init_utils();
      LS_RUNS = "ui-detective:history-index";
      LS_BATCHES = "ui-detective:batch-index";
      HistoryStore = class {
        constructor() {
          this.runs = this._loadJson(LS_RUNS, []);
          this.batches = this._loadJson(LS_BATCHES, []);
        }
        _save() {
          localStorage.setItem(LS_RUNS, JSON.stringify(this.runs));
          localStorage.setItem(LS_BATCHES, JSON.stringify(this.batches));
        }
        _loadJson(k, d) {
          try {
            return JSON.parse(localStorage.getItem(k) || "null") || d;
          } catch {
            return d;
          }
        }
        async putImage(hash, blob) {
          await IDB.putImage(hash, blob);
        }
        async getImage(imageRef) {
          if (imageRef.kind === "idb-blob") return await IDB.getImage(imageRef.key);
          if (imageRef.kind === "data-url") {
            const res = await fetch(imageRef.key);
            return await res.blob();
          }
          return null;
        }
        async addBatchMeta(meta) {
          this.batches.unshift(meta);
          this._save();
        }
        async updateBatchMeta(meta) {
          const i = this.batches.findIndex((b) => b.id === meta.id);
          if (i >= 0) this.batches[i] = meta;
          this._save();
        }
        async addRunMeta(meta) {
          this.runs.unshift(meta);
          this._save();
        }
        async updateRunMeta(meta) {
          const i = this.runs.findIndex((r) => r.id === meta.id);
          if (i >= 0) this.runs[i] = meta;
          this._save();
        }
        async putRunData(runId, data) {
          await IDB.putRun(runId, data);
        }
        async getRunData(runId) {
          return await IDB.getRun(runId);
        }
        async wipeAll() {
          this.runs = [];
          this.batches = [];
          this._save();
          await IDB.clearAll();
        }
        async listAllRuns() {
          return this.runs;
        }
        async listRunsInBatch(batchId) {
          return this.runs.filter((r) => r.batchId === batchId);
        }
        batchIterations(batchId) {
          const b = this.batches.find((x) => x.id === batchId);
          return b?.iterations || 1;
        }
        labelForRun(runId) {
          const idx = this.runs.findIndex((r) => r.id === runId);
          return idx >= 0 ? this.runs.length - idx : "?";
        }
        snapshotBaseURL(runMeta, modelDisplayName) {
          const s = runMeta.modelSnapshots.find((m) => m.model === modelDisplayName || m.displayName === modelDisplayName);
          return s?.baseURL || "";
        }
        snapshotModelId(runMeta, modelDisplayName) {
          const s = runMeta.modelSnapshots.find((m) => m.model === modelDisplayName || m.displayName === modelDisplayName);
          return s?.model || "";
        }
        async loadRunById(runId) {
          const runMeta = this.runs.find((r) => r.id === runId);
          const runData = await this.getRunData(runId);
          return { runMeta, runData };
        }
        // Factory helpers for Batch/Run meta
        async createBatchMeta({ iterations, imageBlob, imageName, prompt, enabledModels }) {
          const id = ulid();
          const createdAtIso = (/* @__PURE__ */ new Date()).toISOString();
          const imgHash = await sha256(imageBlob);
          await this.putImage(imgHash, imageBlob);
          const meta = {
            id,
            createdAtIso,
            iterations,
            imageName,
            imageW: 0,
            imageH: 0,
            // filled on first run
            prompt,
            imageRef: { kind: "idb-blob", key: imgHash },
            modelSnapshots: enabledModels.map((m) => ({
              modelConfigId: m.id,
              color: m.color,
              baseURL: m.baseURL,
              model: m.model,
              endpointType: m.endpointType,
              temperature: m.temperature,
              maxTokens: m.maxTokens
            })),
            summary: { runsDone: 0, okCount: 0, errorCount: 0, avgLatencyMs: null }
          };
          return meta;
        }
        createRunMeta({ batchMeta, batchSeq, imageW, imageH }) {
          const id = ulid();
          const createdAtIso = (/* @__PURE__ */ new Date()).toISOString();
          return {
            id,
            createdAtIso,
            batchId: batchMeta.id,
            batchSeq,
            imageName: batchMeta.imageName,
            imageW,
            imageH,
            prompt: batchMeta.prompt,
            enabledModelIds: batchMeta.modelSnapshots.map((m) => m.modelConfigId),
            modelSnapshots: batchMeta.modelSnapshots,
            imageRef: batchMeta.imageRef,
            summary: { okCount: 0, errorCount: 0, latencyAvgMs: null }
          };
        }
      };
    }
  });

  // docs/src/main.js
  var require_main = __commonJS({
    "docs/src/main.js"() {
      init_image_loader();
      init_overlay_renderer();
      init_model_tabs();
      init_results_table();
      init_history_table();
      init_history_dialog();
      init_batch_runner();
      init_storage();
      init_history_store();
      init_utils();
      var fileInput = document.getElementById("fileInput");
      var promptEl = document.getElementById("prompt");
      var runBtn = document.getElementById("runBtn");
      var cancelBtn = document.getElementById("cancelBtn");
      var iterationsEl = document.getElementById("iterations");
      var badge = document.getElementById("badge");
      var canvas = document.getElementById("previewCanvas");
      var legendEl = document.getElementById("legend");
      var historyTableEl = document.getElementById("historyTable");
      var viewAllHistoryBtn = document.getElementById("viewAllHistoryBtn");
      var batchStatus = document.getElementById("batchStatus");
      var batchText = document.getElementById("batchText");
      var batchProgressBar = document.getElementById("batchProgressBar");
      var modelsTabsHeader = document.getElementById("models-tabs-header");
      var modelsTabsBody = document.getElementById("models-tabs-body");
      var previewTabButtons = Array.from(document.querySelectorAll(".panel.preview .tab-btn"));
      var previewPanes = {
        preview: document.getElementById("preview-pane"),
        results: document.getElementById("results-pane")
      };
      previewTabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          previewTabButtons.forEach((b) => b.classList.remove("active"));
          Object.values(previewPanes).forEach((p) => p.classList.remove("active"));
          btn.classList.add("active");
          previewPanes[btn.dataset.tab].classList.add("active");
          if (btn.dataset.tab === "preview") {
            requestAnimationFrame(() => {
              window.dispatchEvent(new Event("resize"));
            });
          }
        });
      });
      var storage = new Storage();
      var historyStore = new HistoryStore();
      var imageLoader = new ImageLoader(canvas);
      var overlay = new OverlayRenderer(canvas, legendEl);
      var resultsTable = new ResultsTable(previewPanes.results, historyStore);
      var modelTabs = new ModelTabs(modelsTabsHeader, modelsTabsBody, storage);
      var historyTable = new HistoryTable(historyTableEl, historyStore);
      var historyDialog = new HistoryDialog(document.getElementById("historyDialog"), historyStore, overlay, resultsTable, imageLoader);
      var storageRoot = document.getElementById("sidebar-storage");
      var activeBatch = null;
      promptEl.value = storage.getLastPrompt() || "";
      modelTabs.render();
      resultsTable.renderScopeBar();
      historyTable.refresh();
      function setBadge(text) {
        badge.textContent = text;
      }
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const { bitmap, width, height, name } = await imageLoader.loadFile(file);
        overlay.setImage(bitmap, width, height, name);
        setBadge("Working: Unsaved");
      });
      promptEl.addEventListener("input", () => {
        storage.setLastPrompt(promptEl.value);
        setBadge("Working: Unsaved");
      });
      onKey("KeyR", () => runBtn.click());
      onKey("Escape", () => {
        if (!cancelBtn.hidden) cancelBtn.click();
      });
      function showBatchStatus(x, y) {
        batchStatus.hidden = false;
        batchText.textContent = `Batch progress: ${x}/${y}`;
        batchProgressBar.style.width = `${x / y * 100}%`;
      }
      function hideBatchStatus() {
        batchStatus.hidden = true;
      }
      runBtn.addEventListener("click", async () => {
        const prompt = promptEl.value.trim();
        const iterations = clamp(parseInt(iterationsEl.value || "1", 10), 1, 50);
        const img = imageLoader.getCurrent();
        const enabledModels = modelTabs.getEnabledModels();
        if (!prompt || !img || enabledModels.length === 0) {
          alert("Please load an image, enter a prompt, and enable at least one model.");
          return;
        }
        storage.setLastPrompt(prompt);
        const batchRunner = new BatchRunner(historyStore, overlay, resultsTable, modelTabs);
        cancelBtn.hidden = false;
        const onProgress = ({ done, total, runLabel, batchId, runId, runMeta }) => {
          showBatchStatus(done, total);
          const seq = runMeta.batchSeq;
          setBadge(`Viewing: Run #${runLabel} \u2022 Batch #${runMeta.batchId.slice(-6)} (${seq}/${total})`);
          historyTable.refresh();
          historyTable.setSelected(runId);
        };
        const onRunStart = ({ runMeta }) => {
          historyTable.refresh();
          historyTable.setSelected(runMeta.id);
          const seq = runMeta.batchSeq;
          const runLabel = historyStore.labelForRun(runMeta.id);
          setBadge(`Viewing: Run #${runLabel} \u2022 Batch #${runMeta.batchId.slice(-6)} (${seq}/${iterations})`);
        };
        const onFinish = () => {
          cancelBtn.hidden = true;
          hideBatchStatus();
        };
        activeBatch = batchRunner;
        batchRunner.runBatch({
          iterations,
          imageBlob: img.blob,
          imageName: img.name,
          prompt,
          enabledModels
        }, onProgress, onRunStart).finally(onFinish);
      });
      cancelBtn.addEventListener("click", () => {
        if (activeBatch) {
          activeBatch.cancel();
        }
      });
      viewAllHistoryBtn.addEventListener("click", () => historyDialog.open());
      historyTable.onSelect(async (entry) => {
        if (!entry) return;
        const { runMeta, runData } = entry;
        const img = await historyStore.getImage(runMeta.imageRef);
        const { bitmap } = await imageLoader.loadBlob(img, runMeta.imageName);
        overlay.setImage(bitmap, runMeta.imageW, runMeta.imageH, runMeta.imageName);
        overlay.drawDetections(runData.results.map((r) => ({ color: r.color, model: r.modelDisplayName, det: r.parsed?.primary || null })));
        resultsTable.showRun(runMeta, runData);
        promptEl.value = runMeta.prompt || "";
        storage.setLastPrompt(promptEl.value);
        historyTable.setSelected(runMeta.id);
        setBadge(`Viewing: Run #${historyTable.labelForRun(runMeta.id)} \u2022 Batch #${runMeta.batchId.slice(-6)} (${runMeta.batchSeq}/${historyStore.batchIterations(runMeta.batchId)})`);
      });
      function renderStorageTab() {
        const root = storageRoot;
        root.innerHTML = "";
        const h = document.createElement("div");
        h.className = "section-block";
        h.innerHTML = `
    <h3>Storage</h3>
    <div class="row">
      <button class="btn danger" id="wipeHistoryBtn" aria-label="Wipe all history">Wipe History</button>
    </div>
  `;
        root.appendChild(h);
        document.getElementById("wipeHistoryBtn").onclick = async () => {
          if (!confirm("Wipe all history? This cannot be undone.")) return;
          await historyStore.wipeAll();
          overlay.clear();
          resultsTable.clear();
          historyTable.refresh();
          setBadge("Working: Unsaved");
          alert("History wiped.");
        };
      }
      renderStorageTab();
    }
  });
  return require_main();
})();
