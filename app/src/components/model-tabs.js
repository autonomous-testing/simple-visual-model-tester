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
      // Swatch acts as an enable/disable switch
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.setAttribute('role', 'switch');
      swatch.setAttribute('aria-checked', String(cfg.enabled));
      swatch.title = cfg.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable';
      swatch.style.background = cfg.enabled ? cfg.color : 'transparent';
      swatch.style.borderColor = cfg.color;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = cfg.model || '(model id)';
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        const toggled = { ...cfg, enabled: !cfg.enabled };
        this.storage.updateModel(toggled);
        cfg.enabled = toggled.enabled;
        swatch.setAttribute('aria-checked', String(cfg.enabled));
        swatch.title = cfg.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable';
        swatch.style.background = cfg.enabled ? cfg.color : 'transparent';
        swatch.style.borderColor = cfg.color;
        const paneCard = this.body.querySelector(`#model-${cfg.id}`);
        if (paneCard) {
          const chk = paneCard.querySelector('input[type="checkbox"]');
          if (chk) chk.checked = cfg.enabled;
        }
      });
      btn.appendChild(swatch);
      btn.appendChild(label);
      btn.addEventListener('click', () => this.setActive(cfg.id));
      this.header.appendChild(btn);

      const pane = document.createElement('div');
      pane.id = `model-pane-${cfg.id}`;
      pane.className = 'tab-pane' + (cfg.id === this.activeId ? ' active' : '');
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-label', `${cfg.model || 'Model'} settings`);
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
        <span class="title">${cfg.model || '(model id)'}</span>
        <label style="margin-left:auto;"><input type="checkbox" ${cfg.enabled ? 'checked':''}/> Enabled</label>
      </div>
      <div class="model-grid">
        <div>
          <label>Color (hex)</label>
          <input data-field="color" type="text" value="${cfg.color}"/>
        </div>
        <div>
          <label>Endpoint Type</label>
          <select data-field="endpointType">
            <option value="chat" ${cfg.endpointType==='chat'?'selected':''}>chat</option>
            <option value="responses" ${cfg.endpointType==='responses'?'selected':''}>responses</option>
          </select>
        </div>
        <div>
          <label>Base URL</label>
          <input data-field="baseURL" type="text" value="${cfg.baseURL}" placeholder="https://api.example.com/v1"/>
        </div>
        <div>
          <label>API Version</label>
          <input data-field="apiVersion" type="text" value="${cfg.apiVersion || ''}" placeholder="2024-08-01-preview"/>
        </div>
        <div>
          <label>Reasoning Effort (Responses)</label>
          <select data-field="reasoningEffort">
            <option value="" ${!cfg.reasoningEffort ? 'selected' : ''}>(default)</option>
            <option value="low" ${cfg.reasoningEffort==='low'?'selected':''}>low</option>
            <option value="medium" ${cfg.reasoningEffort==='medium'?'selected':''}>medium</option>
            <option value="high" ${cfg.reasoningEffort==='high'?'selected':''}>high</option>
          </select>
        </div>
        <div>
          <label>Model ID</label>
          <input data-field="model" type="text" value="${cfg.model}" placeholder="gpt-4o-mini"/>
        </div>
        <div>
          <label>API Key</label>
          <input data-field="apiKey" type="password" value="${cfg.apiKey || ''}" placeholder="sk-..."/>
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
          <input data-field="timeoutMs" type="number" value="${cfg.timeoutMs ?? 60000}"/>
        </div>
      </div>
      <div class="row">
        <div style="flex:1">
          <label>Extra headers (JSON)</label>
          <textarea data-field="extraHeaders" rows="3" placeholder='{"X-Org":"..."}'>${cfg.extraHeaders ? JSON.stringify(cfg.extraHeaders) : ''}</textarea>
        </div>
      </div>
      <div class="row">
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

    const enabled = card.querySelector('.header input[type="checkbox"]');
    const color = card.querySelector('input[data-field="color"]');
    const endpointSelect = card.querySelector('select[data-field="endpointType"]');
    const baseURL = card.querySelector('input[data-field="baseURL"]');
    const model = card.querySelector('input[data-field="model"]');
    const apiVersion = card.querySelector('input[data-field="apiVersion"]');
    const reasoningEffort = card.querySelector('select[data-field="reasoningEffort"]');
    const key = card.querySelector('input[data-field="apiKey"]');
    const temp = card.querySelector('input[data-field="temperature"]');
    const maxTok = card.querySelector('input[data-field="maxTokens"]');
    const timeout = card.querySelector('input[data-field="timeoutMs"]');

    const headersTa = card.querySelector('textarea[data-field="extraHeaders"]');
    const logEl = card.querySelector('[data-log]');

    // Simple color picker popover anchored to the color input
    let colorPopover = null;
    const closeColorPopover = () => {
      if (colorPopover) {
        document.body.removeChild(colorPopover);
        document.removeEventListener('mousedown', onDocDown, true);
        document.removeEventListener('keydown', onDocKey, true);
        colorPopover = null;
      }
    };
    const onDocDown = (ev) => {
      if (!colorPopover) return;
      if (ev.target === color || colorPopover.contains(ev.target)) return;
      closeColorPopover();
    };
    const onDocKey = (ev) => { if (ev.key === 'Escape') closeColorPopover(); };
    const showColorPopover = () => {
      if (colorPopover) return;
      const rect = color.getBoundingClientRect();
      const pop = document.createElement('div');
      pop.className = 'color-popover';
      pop.innerHTML = `
        <div class="row" style="align-items:center; gap:8px;">
          <input type="color" value="${(color.value || '#ffffff').substring(0,7)}" aria-label="Pick color" />
          <div class="swatches"></div>
        </div>
      `;
      const presets = ['#ff7a7a','#7ad1ff','#c38bff','#3ecf8e','#ff5f6a','#6aa6ff','#f5c542','#9b59b6'];
      const swWrap = pop.querySelector('.swatches');
      presets.forEach(hex => {
        const s = document.createElement('span');
        s.className = 'mini-swatch';
        s.style.background = hex;
        s.title = hex;
        s.addEventListener('click', () => { color.value = hex; persist(); });
        swWrap.appendChild(s);
      });
      const nativePicker = pop.querySelector('input[type="color"]');
      nativePicker.addEventListener('input', () => { color.value = nativePicker.value; persist(); });
      pop.style.position = 'absolute';
      pop.style.left = `${window.scrollX + rect.left}px`;
      pop.style.top = `${window.scrollY + rect.bottom + 6}px`;
      pop.style.zIndex = '1000';
      document.body.appendChild(pop);
      colorPopover = pop;
      // Global listeners to close
      setTimeout(() => {
        document.addEventListener('mousedown', onDocDown, true);
        document.addEventListener('keydown', onDocKey, true);
      }, 0);
    };

    color.addEventListener('focus', showColorPopover);
    color.addEventListener('blur', () => { /* keep open for interactions; closed by outside click */ });

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
        color: color.value,
        endpointType: endpointSelect.value,
        baseURL: baseURL.value,
        apiVersion: apiVersion.value,
        reasoningEffort: reasoningEffort.value,
        model: model.value,
        apiKey: key.value,
        temperature: Number(temp.value),
        maxTokens: Number(maxTok.value),
        timeoutMs: Number(timeout.value),
        extraHeaders: extra,
      };
      this.storage.updateModel(updated);

      // Reflect updates in UI without full re-render
      // Update header tab swatch + label
      const tabBtn = this.header.querySelector(`.tab-btn[data-model-id="${cfg.id}"]`);
      if (tabBtn) {
        const sw = tabBtn.querySelector('.swatch');
        if (sw) {
          sw.setAttribute('aria-checked', String(updated.enabled));
          sw.title = updated.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable';
          sw.style.background = updated.enabled ? updated.color : 'transparent';
          sw.style.borderColor = updated.color;
        }
        const lab = tabBtn.querySelector('.label');
        if (lab) lab.textContent = updated.model || '(model id)';
      }
      // Update card title and pane aria label
      const titleEl = card.querySelector('.title');
      if (titleEl) titleEl.textContent = updated.model || '(model id)';
      const pane = this.body.querySelector(`#model-pane-${cfg.id}`);
      if (pane) pane.setAttribute('aria-label', `${updated.model || 'Model'} settings`);

      // Update local cfg reference
      Object.assign(cfg, updated);
    };

    // Button actions
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

    // Auto-save on any change
    enabled.addEventListener('change', persist);
    color.addEventListener('input', persist);
    endpointSelect.addEventListener('change', persist);
    baseURL.addEventListener('input', persist);
    model.addEventListener('input', persist);
    apiVersion.addEventListener('input', persist);
    key.addEventListener('input', persist);
    temp.addEventListener('input', persist);
    maxTok.addEventListener('input', persist);
    timeout.addEventListener('input', persist);
    headersTa.addEventListener('input', persist);
    reasoningEffort.addEventListener('change', persist);

    return card;
  }
}
