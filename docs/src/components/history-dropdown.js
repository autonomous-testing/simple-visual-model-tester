export class HistoryDropdown {
  constructor(selectEl, historyStore) {
    this.selectEl = selectEl;
    this.historyStore = historyStore;
    this.handlers = [];
    this.selectEl.addEventListener('change', async () => {
      const runId = this.selectEl.value;
      if (!runId) return;
      const entry = await this.historyStore.loadRunById(runId);
      this.handlers.forEach(fn => fn(entry));
    });
  }

  onSelect(fn) { this.handlers.push(fn); }

  labelForRun(runId) {
    return this.historyStore.labelForRun(runId);
  }

  async refresh(limit=20) {
    const list = await this.historyStore.listAllRuns();
    const recent = list.slice(0, limit);
    this.selectEl.innerHTML = `<option value="">— Select a run —</option>` + recent.map(rm => {
      const label = `Run #${this.labelForRun(rm.id)} • ${rm.imageName} • ${rm.prompt.slice(0,40)} • ${new Date(rm.createdAtIso).toLocaleTimeString()}`;
      return `<option value="${rm.id}">${label}</option>`;
    }).join('');
  }
}

