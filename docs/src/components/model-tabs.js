import { Storage } from '../core/storage.js';
import { ApiClient } from '../core/api-client.js';
import { Parser } from '../core/parser.js';
import { uuid, short } from '../core/utils.js';

export class ModelTabs {
  constructor(rootEl, storage) {
    this.root = rootEl;
    this.storage = storage;
    this.parser = new Parser();
    this.render();
  }

  getEnabledModels() {
    return this.storage.getModelConfigs().filter(m => m.enabled);
  }

  render() {
    const configs = this.storage.getModelConfigs();
    this.root.innerHTML = '';
    configs.forEach(cfg => this.root.appendChild(this._renderCard(cfg)));
    // Add "New model" button
    const addRow = document.createElement('div');
    addRow.innerHTML = `<button class="btn" id="addModelBtn">+ Add Model</button>`;
    this.root.appendChild(addRow);
    addRow.querySelector('#addModelBtn').onclick = () => {
      const newCfg = this.storage.addDefaultModel();
      this.render();
      setTimeout(() => {
        const el = this.root.querySelector(`#model-${newCfg.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
    };
  }

  _renderCard(cfg) {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.id = `model-${cfg.id}`;
    card.innerHTML = `
      <div class="header">
        <span class="swatch" style="background:${cfg.color}"></span>
        <span class="title">${cfg.displayName || '(untitled model)'}</span>
        <label style="margin-left:auto;"><input type="checkbox" ${cfg.enabled ? 'checked':''}/> Enabled</label>
      </div>
      <div class="model-grid">
        <div>
          <label>Display Name</label>
          <input type="text" value="${cfg.displayName}"/>
        </div>
        <div>
          <label>Color (hex)</label>
          <input type="text" value="${cfg.color}"/>
        </div>
        <div>
          <label>Endpoint Type</label>
          <select>
            <option value="chat" ${cfg.endpointType==='chat'?'selected':''}>chat</option>
            <option value="responses" ${cfg.endpointType==='responses'?'selected':''}>responses</option>
          </select>
        </div>
        <div>
          <label>Base URL</label>
          <input type="text" value="${cfg.baseURL}" placeholder="https://api.example.com/v1"/>
        </div>
        <div>
          <label>Model ID</label>
          <input type="text" value="${cfg.model}" placeholder="gpt-4o-mini"/>
        </div>
        <div>
          <label>API Key</label>
          <input type="password" value="${cfg.apiKey || ''}" placeholder="sk-..."/>
        </div>
        <div>
          <label>Temperature</label>
          <input type="number" value="${cfg.temperature ?? 0}" step="0.1"/>
        </div>
        <div>
          <label>Max tokens</label>
          <input type="number" value="${cfg.maxTokens ?? 300}"/>
        </div>
        <div>
          <label>Timeout (ms)</label>
          <input type="number" value="${cfg.timeoutMs ?? 60000}"/>
        </div>
      </div>
      <div class="row">
        <div style="flex:1">
          <label>Extra headers (JSON)</label>
          <textarea rows="3" placeholder='{"X-Org":"..."}'>${cfg.extraHeaders ? JSON.stringify(cfg.extraHeaders) : ''}</textarea>
        </div>
      </div>
      <div class="row">
        <button class="btn" data-act="save">Save to Browser</button>
        <button class="btn" data-act="test">Test Connection</button>
        <button class="btn danger" data-act="delete" title="Remove model">Delete</button>
      </div>
      <div class="row">
        <div style="flex:1">
          <label>Log</label>
          <pre class="log-area" data-log>—</pre>
        </div>
      </div>
    `;

    const [enabled, displayName, color, endpointSelect, baseURL, model, key, temp, maxTok, timeout] =
      Array.from(card.querySelectorAll('input, select')).slice(0,10);

    const headersTa = card.querySelector('textarea');
    const logEl = card.querySelector('[data-log]');

    const persist = () => {
      let extra = undefined;
      try {
        extra = headersTa.value.trim() ? JSON.parse(headersTa.value) : undefined;
      } catch (e) {
        alert('Extra headers must be valid JSON.');
        return;
      }
      const updated = {
        ...cfg,
        enabled: enabled.checked,
        displayName: displayName.value,
        color: color.value,
        endpointType: endpointSelect.value,
        baseURL: baseURL.value,
        model: model.value,
        apiKey: key.value,
        temperature: Number(temp.value),
        maxTokens: Number(maxTok.value),
        timeoutMs: Number(timeout.value),
        extraHeaders: extra,
      };
      this.storage.updateModel(updated);
    };

    // Button actions
    card.querySelector('[data-act="save"]').onclick = persist;
    card.querySelector('[data-act="delete"]').onclick = () => {
      if (!confirm('Delete this model?')) return;
      this.storage.deleteModel(cfg.id);
      this.render();
    };

    card.querySelector('[data-act="test"]').onclick = async () => {
      persist();
      const s = this.storage.getModelConfigs().find(m => m.id === cfg.id);
      const client = new ApiClient();
      logEl.textContent = 'Testing…';
      try {
        const { ok, status, timeMs } = await client.testConnection(s);
        logEl.textContent = ok ? `OK • HTTP ${status} • ${timeMs} ms` : `HTTP ${status}`;
      } catch (e) {
        logEl.textContent = `Error: ${e?.message || e}`;
      }
    };

    return card;
  }
}

