import { csvRow } from '../core/utils.js';

export class ResultsTable {
  constructor(rootEl, historyStore) {
    this.root = rootEl;
    this.historyStore = historyStore;
    this.scope = 'run'; // 'run' | 'batch' | 'all'
    this.current = null; // { runMeta, runData }
    this.renderScopeBar();
  }

  renderScopeBar() {
    this.root.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'scope-bar';
    bar.innerHTML = `
      <label>Scope</label>
      <select id=\"scopeSel\">\n        <option value=\"run\">This run</option>\n        <option value=\"batch\">This batch</option>\n        <option value=\"all\">All runs</option>\n      </select>\n      <button class=\"btn\" id=\"exportCsvBtn\">Export CSV</button>\n    `;
    this.root.appendChild(bar);

    bar.querySelector('#scopeSel').value = this.scope;
    bar.querySelector('#scopeSel').onchange = (e) => {
      this.scope = e.target.value;
      this.renderTable();
    };
    bar.querySelector('#exportCsvBtn').onclick = () => this.exportCsv();

    // Table container
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.innerHTML = `<table id=\"resultsTable\"><thead></thead><tbody></tbody></table>`;
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
      'batchId','batchSeq','runId','runLabel','timestampIso',
      'imageName','imageW','imageH','prompt',
      'modelDisplayName','baseURL','model',
      'detectionType','x','y','width','height','confidence',
      'latencyMs','status','error','rawTextShort'
    ];
  }

  async _rowsForScope() {
    const cols = this._columns();
    const rows = [];

    if (this.scope === 'run') {
      if (!this.current) return [];
      const { runMeta, runData } = this.current;
      for (const r of runData.results) {
        rows.push(this._row(runMeta, r));
      }
      return rows;
    }

    if (this.scope === 'batch') {
      if (!this.current) return [];
      const batchId = this.current.runMeta.batchId;
      const runs = await this.historyStore.listRunsInBatch(batchId);
      for (const rm of runs) {
        const data = await this.historyStore.getRunData(rm.id);
        for (const r of data.results) rows.push(this._row(rm, r));
      }
      return rows;
    }

    if (this.scope === 'all') {
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

      detectionType: det?.type || '',
      x: det?.x ?? '',
      y: det?.y ?? '',
      width: det?.width ?? '',
      height: det?.height ?? '',
      confidence: det?.confidence ?? '',

      latencyMs: r.latencyMs ?? '',
      status: r.status,
      error: r.errorMessage || '',
      rawTextShort: (r.rawText || '').slice(0, 200),
      rawTextFull: (r.rawFull || r.rawText || '')
    };
  }

  async renderTable() {
    const thead = this.root.querySelector('#resultsTable thead');
    const tbody = this.root.querySelector('#resultsTable tbody');
    if (!thead || !tbody) return;

    const cols = this._columns();
    thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;
    tbody.innerHTML = `<tr><td colspan="${cols.length}">Loading…</td></tr>`;

    const rows = await this._rowsForScope();
    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}">No data.</td></tr>`;
      return;
    }

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
    tbody.innerHTML = rows.map(r => {
      return `<tr>${cols.map(c => {
        if (c === 'rawTextShort') {
          const short = String(r[c] ?? '');
          const full = String(r.rawTextFull ?? '');
          if (full && full.length > short.length) {
            return `<td><details><summary>${esc(short)}… (${full.length} chars)</summary><pre style="white-space:pre-wrap;max-width:60vw;">${esc(full)}</pre></details></td>`;
          }
          return `<td>${esc(short)}</td>`;
        }
        return `<td>${esc(r[c])}</td>`;
      }).join('')}</tr>`;
    }).join('');
  }

  async exportCsv() {
    const cols = this._columns();
    const rows = await this._rowsForScope();
    const header = cols.join(',');
    const lines = [header, ...rows.map(r => cols.map(c => csvRow(r[c])).join(','))];
    const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `results-${this.scope}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
