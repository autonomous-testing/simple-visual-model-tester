export class HistoryTable {
  constructor(rootEl, historyStore) {
    this.root = rootEl;
    this.historyStore = historyStore;
    this.handlers = [];
    this.selectedRunId = null;
    this._init();
  }

  _init() {
    // Static skeleton
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

    // Row click → select
    this.root.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr[data-run-id]');
      if (!tr) return;
      const runId = tr.getAttribute('data-run-id');
      if (!runId) return;
      const entry = await this.historyStore.loadRunById(runId);
      this.handlers.forEach(fn => fn(entry));
    });
  }

  onSelect(fn) { this.handlers.push(fn); }

  labelForRun(runId) { return this.historyStore.labelForRun(runId); }

  async refresh(limit = 50) {
    const tbody = this.root.querySelector('tbody');
    if (!tbody) return;
    const list = await this.historyStore.listAllRuns();
    const recent = list.slice(0, limit);
    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No runs yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = recent.map(r => {
      const time = new Date(r.createdAtIso).toLocaleTimeString();
      const prompt = (r.prompt || '').slice(0, 80);
      const sel = (r.id === this.selectedRunId) ? ' selected' : '';
      return `
        <tr data-run-id="${r.id}" class="clickable${sel}">
          <td>${this.labelForRun(r.id)}</td>
          <td>${time}</td>
          <td title="${r.imageName}">${r.imageName}</td>
          <td class="prompt-cell" title="${r.prompt?.replaceAll('"','&quot;') || ''}">${prompt}</td>
          <td>${r.summary?.okCount ?? ''}</td>
          <td>${r.summary?.errorCount ?? ''}</td>
        </tr>
      `;
    }).join('');
  }

  setSelected(runId) {
    this.selectedRunId = runId || null;
    // Update classes without full re-render if possible
    const rows = Array.from(this.root.querySelectorAll('tr[data-run-id]'));
    rows.forEach(tr => {
      if (tr.getAttribute('data-run-id') === this.selectedRunId) tr.classList.add('selected');
      else tr.classList.remove('selected');
    });
  }
}
