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

function defaultModels() {
  return [
    {
      id: uuid(),
      color: '#ff7a7a',
      enabled: true,
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      endpointType: 'chat',
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
      apiKey: '',
      endpointType: 'responses',
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
      apiKey: last?.apiKey ?? '',
      endpointType: last?.endpointType ?? 'chat',
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
}
