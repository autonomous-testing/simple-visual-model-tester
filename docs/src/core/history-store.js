import { IDB } from './idb.js';
import { sha256, blobToDataURL, ulid } from './utils.js';

const LS_RUNS = 'ui-detective:history-index';
const LS_BATCHES = 'ui-detective:batch-index';

export class HistoryStore {
  constructor() {
    this.runs = this._loadJson(LS_RUNS, []);
    this.batches = this._loadJson(LS_BATCHES, []);
  }

  _save() {
    localStorage.setItem(LS_RUNS, JSON.stringify(this.runs));
    localStorage.setItem(LS_BATCHES, JSON.stringify(this.batches));
  }
  _loadJson(k, d) {
    try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch { return d; }
  }

  async putImage(hash, blob) {
    await IDB.putImage(hash, blob);
  }
  async getImage(imageRef) {
    if (imageRef.kind === 'idb-blob') return await IDB.getImage(imageRef.key);
    if (imageRef.kind === 'data-url') {
      const res = await fetch(imageRef.key);
      return await res.blob();
    }
    return null;
  }

  async addBatchMeta(meta) {
    this.batches.unshift(meta);
    this._save();
  }
  async updateBatchMeta(meta) {
    const i = this.batches.findIndex(b => b.id === meta.id);
    if (i >= 0) this.batches[i] = meta;
    this._save();
  }
  async addRunMeta(meta) {
    this.runs.unshift(meta);
    this._save();
  }
  async updateRunMeta(meta) {
    const i = this.runs.findIndex(r => r.id === meta.id);
    if (i >= 0) this.runs[i] = meta;
    this._save();
  }

  async putRunData(runId, data) { await IDB.putRun(runId, data); }
  async getRunData(runId) { return await IDB.getRun(runId); }

  async wipeAll() {
    this.runs = []; this.batches = []; this._save();
    await IDB.clearAll();
  }

  async listAllRuns() { return this.runs; }
  async listRunsInBatch(batchId) { return this.runs.filter(r => r.batchId === batchId); }

  batchIterations(batchId) {
    const b = this.batches.find(x => x.id === batchId);
    return b?.iterations || 1;
  }

  labelForRun(runId) {
    const idx = this.runs.findIndex(r => r.id === runId);
    return idx >= 0 ? (this.runs.length - idx) : '?';
  }

  snapshotBaseURL(runMeta, modelDisplayName) {
    // modelDisplayName now carries the Model ID; support legacy displayName too
    const s = runMeta.modelSnapshots.find(m => m.model === modelDisplayName || m.displayName === modelDisplayName);
    return s?.baseURL || '';
    }
  snapshotModelId(runMeta, modelDisplayName) {
    const s = runMeta.modelSnapshots.find(m => m.model === modelDisplayName || m.displayName === modelDisplayName);
    return s?.model || '';
  }

  async loadRunById(runId) {
    const runMeta = this.runs.find(r => r.id === runId);
    const runData = await this.getRunData(runId);
    return { runMeta, runData };
  }

  // Factory helpers for Batch/Run meta
  async createBatchMeta({ iterations, imageBlob, imageName, prompt, enabledModels }) {
    const id = ulid();
    const createdAtIso = new Date().toISOString();
    const imgHash = await sha256(imageBlob);
    await this.putImage(imgHash, imageBlob);
    const meta = {
      id,
      createdAtIso,
      iterations,
      imageName,
      imageW: 0, imageH: 0, // filled on first run
      prompt,
      imageRef: { kind:'idb-blob', key: imgHash },
      modelSnapshots: enabledModels.map(m => ({
        modelConfigId: m.id,
        color: m.color,
        baseURL: m.baseURL,
        model: m.model,
        endpointType: m.endpointType,
        temperature: m.temperature,
        maxTokens: m.maxTokens
      })),
      summary: { runsDone: 0, okCount: 0, errorCount: 0, avgLatencyMs: null }
    };
    return meta;
  }

  createRunMeta({ batchMeta, batchSeq, imageW, imageH }) {
    const id = ulid();
    const createdAtIso = new Date().toISOString();
    return {
      id, createdAtIso,
      batchId: batchMeta.id,
      batchSeq,
      imageName: batchMeta.imageName,
      imageW, imageH,
      prompt: batchMeta.prompt,
      enabledModelIds: batchMeta.modelSnapshots.map(m => m.modelConfigId),
      modelSnapshots: batchMeta.modelSnapshots,
      imageRef: batchMeta.imageRef,
      summary: { okCount: 0, errorCount: 0, latencyAvgMs: null }
    };
  }
}
