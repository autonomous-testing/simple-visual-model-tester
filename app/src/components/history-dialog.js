export class HistoryDialog {
  constructor(dialogEl, historyStore, overlay, resultsTable, imageLoader) {
    this.dialog = dialogEl;
    this.historyStore = historyStore;
    this.overlay = overlay;
    this.resultsTable = resultsTable;
    this.imageLoader = imageLoader;
    this.groupByBatch = false;
    document.getElementById('groupByBatchToggle').addEventListener('change', (e) => {
      this.groupByBatch = e.target.checked;
      this.renderBody();
    });
  }

  async open() {
    await this.renderBody();
    this.dialog.showModal();
  }

  async renderBody() {
    const body = document.getElementById('historyDialogBody');
    const runs = await this.historyStore.listAllRuns();
    if (!this.groupByBatch) {
      body.innerHTML = this._tableHtml(runs);
    } else {
      // group by batchId
      const groups = new Map();
      for (const r of runs) {
        const g = groups.get(r.batchId) || [];
        g.push(r); groups.set(r.batchId, g);
      }
      body.innerHTML = Array.from(groups.entries()).map(([batchId, arr]) => {
        const header = `<h3>Batch ${batchId}</h3>`;
        return header + this._tableHtml(arr);
      }).join('');
    }

    // Wire load/export buttons
    body.querySelectorAll('[data-load]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const runId = btn.getAttribute('data-load');
        const { runMeta, runData } = await this.historyStore.loadRunById(runId);
        const img = await this.historyStore.getImage(runMeta.imageRef);
        const { bitmap } = await this.imageLoader.loadBlob(img, runMeta.imageName);
        this.overlay.setImage(bitmap, runMeta.imageW, runMeta.imageH, runMeta.imageName);
        this.overlay.drawDetections(runData.results.map(r => ({ color: r.color, model: r.modelDisplayName, det: r.parsed?.primary || null })));
        this.resultsTable.showRun(runMeta, runData);
        this.dialog.close();
      });
    });
    body.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const runId = btn.getAttribute('data-export');
        const { runMeta, runData } = await this.historyStore.loadRunById(runId);
        // Simple per-run CSV: reuse ResultsTable mechanism by temporarily setting current
        const rt = this.resultsTable;
        const prev = rt.current;
        rt.current = { runMeta, runData };
        const prevScope = rt.scope;
        rt.scope = 'run';
        await rt.exportCsv();
        // restore
        rt.current = prev; rt.scope = prevScope;
      });
    });
  }

  _tableHtml(rows) {
    return `<div class="table-wrap"><table><thead><tr>
      <th>#</th><th>Run ID</th><th>Batch</th><th>Seq</th><th>Time</th><th>Image</th><th>Prompt</th><th>OK</th><th>Errors</th><th>Actions</th>
    </tr></thead><tbody>
      ${rows.map(r => `
        <tr>
          <td>${this.historyStore.labelForRun(r.id)}</td>
          <td>${r.id}</td>
          <td>${r.batchId}</td>
          <td>${r.batchSeq}</td>
          <td>${new Date(r.createdAtIso).toLocaleString()}</td>
          <td>${r.imageName}</td>
          <td>${r.prompt.slice(0,80)}</td>
          <td>${r.summary.okCount}</td>
          <td>${r.summary.errorCount}</td>
          <td>
            <button class="btn" data-load="${r.id}">Load</button>
            <button class="btn" data-export="${r.id}">Export CSV</button>
          </td>
        </tr>
      `).join('')}
    </tbody></table></div>`;
  }
}
