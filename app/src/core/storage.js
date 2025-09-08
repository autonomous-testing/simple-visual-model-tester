import { uuid } from './utils.js';

const COLOR_PALETTE = ['#ff7a7a','#7ad1ff','#c38bff','#3ecf8e','#ff5f6a','#6aa6ff','#f5c542','#9b59b6','#f0932b','#e056fd','#badc58'];
function randomColor(exclude) {
  const pick = () => COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
  let c = pick();
  if (exclude && typeof exclude === 'string') {
    const ex = exclude.toLowerCase();
    if (c.toLowerCase() === ex) {
      const i = COLOR_PALETTE.indexOf(c);
      c = COLOR_PALETTE[(i + 1) % COLOR_PALETTE.length];
    }
  }
  return c;
}

const LS_MODELS = 'ui-detective:model-configs';
const LS_LAST_PROMPT = 'ui-detective:last-prompt';
const LS_SYS_PROMPT_TPL = 'ui-detective:sys-prompt-template';

function defaultSystemPromptTemplate() {
  return (
`You are a strictly JSON-only assistant. Output ONLY a single valid JSON object — no prose, no code fences, no keys missing, no trailing commas.
Task: Given one image and an instruction, locate the UI element and return coordinates.

Return exactly this schema (keys and types must match):
{
  "coordinate_system": "pixel",
  "origin": "top-left",
  "image_size": { "width": ${'${image_width}'}, "height": ${'${image_height}'} },
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
- Coordinates must be within the image bounds: width=${'${image_width}'}, height=${'${image_height}'}.
- Always include all required top-level keys: coordinate_system, origin, image_size, primary, others.
- If uncertain, still return your best guess with a reasonable confidence.
- Prefer a "point" primary when both point and bbox are reasonable.
- If you cannot find anything, set primary to a point guess near the most likely area with low confidence (e.g., 0.1) and others to [].

Good example (point):
{"coordinate_system":"pixel","origin":"top-left","image_size":{"width":${'${image_width}'},"height":${'${image_height}'}},"primary":{"type":"point","x":214,"y":358,"confidence":0.83},"others":[]}

Good example (bbox):
{"coordinate_system":"pixel","origin":"top-left","image_size":{"width":${'${image_width}'},"height":${'${image_height}'}},"primary":{"type":"bbox","x":180,"y":300,"width":120,"height":80,"confidence":0.78},"others":[]}`
  );
}

function defaultModels() {
  return [
    {
      id: uuid(),
      color: '#ff7a7a',
      enabled: true,
      baseURL: 'https://api.openai.com/v1',
      apiVersion: '',
      apiKey: '',
      endpointType: 'chat',
      reasoningEffort: '',
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 300,
      extraHeaders: undefined,
      timeoutMs: 60000
    },
    {
      id: uuid(),
      color: '#7ad1ff',
      enabled: false,
      baseURL: 'https://api.example.com/v1',
      apiVersion: '',
      apiKey: '',
      endpointType: 'responses',
      reasoningEffort: '',
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 300,
      extraHeaders: undefined,
      timeoutMs: 60000
    }
  ];
}

export class Storage {
  getModelConfigs() {
    const s = localStorage.getItem(LS_MODELS);
    if (!s) {
      const d = defaultModels();
      localStorage.setItem(LS_MODELS, JSON.stringify(d));
      return d;
    }
    try { return JSON.parse(s); } catch { return defaultModels(); }
  }
  setModelConfigs(arr) {
    localStorage.setItem(LS_MODELS, JSON.stringify(arr));
  }
  addDefaultModel() {
    const all = this.getModelConfigs();
    const last = all[all.length - 1];
    // Copy all props from the last model except color; enable the new one
    const model = {
      id: uuid(),
      color: randomColor(last?.color),
      enabled: true,
      baseURL: last?.baseURL ?? 'https://api.example.com/v1',
      apiVersion: last?.apiVersion ?? '',
      apiKey: last?.apiKey ?? '',
      endpointType: last?.endpointType ?? 'chat',
      reasoningEffort: last?.reasoningEffort ?? '',
      model: last?.model ?? 'gpt-4o-mini',
      temperature: last?.temperature ?? 0,
      maxTokens: last?.maxTokens ?? 300,
      extraHeaders: last?.extraHeaders ? { ...last.extraHeaders } : undefined,
      timeoutMs: last?.timeoutMs ?? 60000
    };
    all.push(model);
    this.setModelConfigs(all);
    return model;
  }
  updateModel(updated) {
    const all = this.getModelConfigs();
    const idx = all.findIndex(m => m.id === updated.id);
    if (idx >= 0) all[idx] = updated;
    this.setModelConfigs(all);
  }
  deleteModel(id) {
    const all = this.getModelConfigs().filter(x => x.id !== id);
    this.setModelConfigs(all);
  }

  getLastPrompt() { return localStorage.getItem(LS_LAST_PROMPT) || ''; }
  setLastPrompt(s) { localStorage.setItem(LS_LAST_PROMPT, s); }

  // System prompt template
  getSystemPromptTemplate() {
    const s = localStorage.getItem(LS_SYS_PROMPT_TPL);
    if (!s) return defaultSystemPromptTemplate();
    return s;
  }
  setSystemPromptTemplate(t) {
    localStorage.setItem(LS_SYS_PROMPT_TPL, String(t ?? ''));
  }
  resetSystemPromptTemplate() {
    localStorage.removeItem(LS_SYS_PROMPT_TPL);
  }
}
