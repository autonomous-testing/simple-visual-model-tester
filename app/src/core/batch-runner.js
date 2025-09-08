import { ApiClient } from './api-client.js';
import { Parser } from './parser.js';

export class BatchRunner {
  constructor(historyStore, overlay, resultsTable, modelTabs, storage) {
    this.history = historyStore;
    this.overlay = overlay;
    this.resultsTable = resultsTable;
    this.modelTabs = modelTabs;
    this.storage = storage;
    this.cancelRequested = false;
  }

  cancel() { this.cancelRequested = true; }

  async runBatch({ iterations, imageBlob, imageName, prompt, enabledModels }, onProgress, onRunStart) {
    this.cancelRequested = false;
    const client = new ApiClient();
    const parser = new Parser();

    // Prepare batch meta
    const batchMeta = await this.history.createBatchMeta({ iterations, imageBlob, imageName, prompt, enabledModels });
    await this.history.addBatchMeta(batchMeta);

    let done = 0;
    for (let seq = 1; seq <= iterations; seq++) {
      if (this.cancelRequested) break;

      const imgBitmap = await createImageBitmap(imageBlob, { imageOrientation: 'from-image' });
      const imageW = imgBitmap.width;
      const imageH = imgBitmap.height;
      if (seq === 1) {
        batchMeta.imageW = imageW; batchMeta.imageH = imageH;
        await this.history.updateBatchMeta(batchMeta);
      }

      const runMeta = this.history.createRunMeta({ batchMeta, batchSeq: seq, imageW, imageH });
      await this.history.addRunMeta(runMeta);
      await this.history.putRunData(runMeta.id, { id: runMeta.id, results: [], logs: {} });
      // Notify UI that a new run started so it can show a partial row immediately
      onRunStart?.({ batchId: batchMeta.id, runId: runMeta.id, runMeta });

      // Kick off parallel calls
      const sysTpl = this.storage?.getSystemPromptTemplate?.() || '';
      const promises = enabledModels.map(async m => {
        let status = 'ok', latencyMs = null, rawText = '', rawFull = undefined, parsed = null, errorMessage = undefined;
        const onLog = (log) => this._appendLog(runMeta.id, m.id, log);
        try {
          const res = await client.callModel(m, imageBlob, prompt, onLog, imageW, imageH, sysTpl);
          latencyMs = res.latencyMs;
          rawText = res.rawText;
          rawFull = res.rawFull;
          const p = parser.parse(rawText, imageW, imageH);
          if (!p.ok) { status = p.status; errorMessage = p.error; }
          parsed = p.value;
        } catch (e) {
          status = (String(e).includes('timeout')) ? 'timeout' : 'error';
          errorMessage = String(e?.message || e);
        }
        const result = {
          modelId: m.id,
          modelDisplayName: m.model,
          color: m.color,
          status,
          latencyMs,
          rawText,
          rawFull,
          parsed,
          errorMessage
        };
        await this._appendResult(runMeta.id, result);
        return result;
      });

      const settled = await Promise.all(promises);

      // Update overlay + results table
      const items = settled.filter(r => r.status === 'ok' && r.parsed?.primary).map(r => ({
        color: r.color, model: r.modelDisplayName, det: r.parsed.primary
      }));
      // Update canvas
      const ctxImage = await createImageBitmap(imageBlob, { imageOrientation: 'from-image' });
      this.overlay.setImage(ctxImage, imageW, imageH, imageName);
      this.overlay.drawDetections(items);

      // Update summaries
      const okCount = settled.filter(r => r.status === 'ok').length;
      const errCount = settled.length - okCount;
      const avgLatency = (() => {
        const arr = settled.map(s => s.latencyMs || 0).filter(Boolean);
        return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
      })();
      runMeta.summary = { okCount, errorCount: errCount, latencyAvgMs: avgLatency };
      await this.history.updateRunMeta(runMeta);

      batchMeta.summary.runsDone = seq;
      batchMeta.summary.okCount += okCount;
      batchMeta.summary.errorCount += errCount;
      const prevAvg = batchMeta.summary.avgLatencyMs;
      batchMeta.summary.avgLatencyMs = avgLatency != null ? (prevAvg == null ? avgLatency : Math.round((prevAvg + avgLatency)/2)) : prevAvg;
      await this.history.updateBatchMeta(batchMeta);

      // Results panel reflects the current run
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
}
