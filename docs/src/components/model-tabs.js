import { Storage } from '../core/storage.js';
import { ApiClient } from '../core/api-client.js';
import { Parser } from '../core/parser.js';
import { uuid, short } from '../core/utils.js';

export class ModelTabs {
  constructor(tabsHeaderEl, tabsBodyEl, storage) {
    this.header = tabsHeaderEl;
    this.body = tabsBodyEl;
    this.storage = storage;
    this.parser = new Parser();
    this.activeId = null;
    this.render();
  }

  getEnabledModels() {
    return this.storage.getModelConfigs().filter(m => m.enabled);
  }

  render() {
    const configs = this.storage.getModelConfigs();

    // Ensure active tab exists
    if (!this.activeId || !configs.find(m => m.id === this.activeId)) {
      this.activeId = configs[0]?.id || null;
    }

    // Clear header and body
    this.header.innerHTML = '';
    this.body.innerHTML = '';

    // Build a tab + pane per model
    configs.forEach(cfg => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (cfg.id === this.activeId ? ' active' : '');
      btn.dataset.modelId = cfg.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', cfg.id === this.activeId ? 'true' : 'false');
      btn.setAttribute('aria-controls', `model-pane-${cfg.id}`);
      btn.textContent = cfg.displayName || '(untitled model)';
      btn.addEventListener('click', () => this.setActive(cfg.id));
      this.header.appendChild(btn);

      const pane = document.createElement('div');
      pane.id = `model-pane-${cfg.id}`;
      pane.className = 'tab-pane' + (cfg.id === this.activeId ? ' active' : '');
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-label', `${cfg.displayName || 'Model'} settings`);
      pane.appendChild(this._renderCard(cfg));
      this.body.appendChild(pane);
    });

    // Add model button at the end of header
    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.id = 'addModelBtn';
    addBtn.textContent = '+ Add Model';
    addBtn.addEventListener('click', () => {
      const newCfg = this.storage.addDefaultModel();
      this.activeId = newCfg.id;
      this.render();
      setTimeout(() => {
        const el = this.body.querySelector(`#model-${newCfg.id}`) || this.body.querySelector(`#model-pane-${newCfg.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    });
    this.header.appendChild(addBtn);

    // Right-aligned actions: Export / Import
    const actionsWrap = document.createElement('div');
    actionsWrap.style.marginLeft = 'auto';
    actionsWrap.style.display = 'flex';
    actionsWrap.style.gap = '8px';
    actionsWrap.style.alignItems = 'center';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn';
    exportBtn.id = 'exportModelsBtn';
    exportBtn.textContent = 'Export Models';
    actionsWrap.appendChild(exportBtn);

    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.id = 'importModelsInput';
    importInput.accept = 'application/json';
    importInput.setAttribute('aria-label', 'Import model configurations');
    actionsWrap.appendChild(importInput);

    exportBtn.onclick = () => {
      const data = this.storage.getModelConfigs();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'model-configs.json'; a.click();
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
        alert('Imported model configurations.');
      } catch (err) {
        alert('Invalid JSON.');
      }
    };

    this.header.appendChild(actionsWrap);
  }

  setActive(id) {
    this.activeId = id;
    // Update header buttons
    Array.from(this.header.querySelectorAll('.tab-btn')).forEach(b => {
      const isActive = b.dataset.modelId === id;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    // Update panes
    Array.from(this.body.querySelectorAll('.tab-pane')).forEach(p => {
      p.classList.toggle('active', p.id === `model-pane-${id}`);
    });
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
