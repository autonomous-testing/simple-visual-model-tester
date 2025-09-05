import { ImageLoader } from './components/image-loader.js';
import { OverlayRenderer } from './components/overlay-renderer.js';
import { ModelTabs } from './components/model-tabs.js';
import { ResultsTable } from './components/results-table.js';
import { HistoryDropdown } from './components/history-dropdown.js';
import { HistoryDialog } from './components/history-dialog.js';
import { BatchRunner } from './core/batch-runner.js';
import { Storage } from './core/storage.js';
import { HistoryStore } from './core/history-store.js';
import { uuid, clamp, short, onKey } from './core/utils.js';

// Elements
const fileInput = document.getElementById('fileInput');
const loadImageBtn = document.getElementById('loadImageBtn');
const promptEl = document.getElementById('prompt');
const runBtn = document.getElementById('runBtn');
const cancelBtn = document.getElementById('cancelBtn');
const iterationsEl = document.getElementById('iterations');
const badge = document.getElementById('badge');
const canvas = document.getElementById('previewCanvas');
const legendEl = document.getElementById('legend');
const historyDropdownEl = document.getElementById('historyDropdown');
const viewAllHistoryBtn = document.getElementById('viewAllHistoryBtn');
const batchStatus = document.getElementById('batchStatus');
const batchText = document.getElementById('batchText');
const batchProgressBar = document.getElementById('batchProgressBar');

// Tabs
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const tabPanes = {
  models: document.getElementById('tab-models'),
  results: document.getElementById('tab-results'),
};
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    Object.values(tabPanes).forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    tabPanes[btn.dataset.tab].classList.add('active');
  });
});

// Core services
const storage = new Storage();
const historyStore = new HistoryStore();
const imageLoader = new ImageLoader(canvas);
const overlay = new OverlayRenderer(canvas, legendEl);
const resultsTable = new ResultsTable(tabPanes.results, historyStore);
const modelTabs = new ModelTabs(tabPanes.models, storage);
const historyDropdown = new HistoryDropdown(historyDropdownEl, historyStore);
const historyDialog = new HistoryDialog(document.getElementById('historyDialog'), historyStore, overlay, resultsTable, imageLoader);
const storageRoot = document.getElementById('sidebar-storage');

let activeBatch = null;

// Initialize UI from storage
promptEl.value = storage.getLastPrompt() || '';
modelTabs.render();
resultsTable.renderScopeBar();
historyDropdown.refresh();

function setBadge(text) {
  badge.textContent = text;
}

// Inputs wiring
loadImageBtn.addEventListener('click', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const { bitmap, width, height, blob, name } = await imageLoader.loadFile(file);
  overlay.setImage(bitmap, width, height, name);
  setBadge('Working: Unsaved');
});

promptEl.addEventListener('input', () => {
  storage.setLastPrompt(promptEl.value);
  setBadge('Working: Unsaved');
});

// Keyboard shortcuts
onKey('KeyR', () => runBtn.click());
onKey('Escape', () => { if (!cancelBtn.hidden) cancelBtn.click(); });

// Batch progress helpers
function showBatchStatus(x, y) {
  batchStatus.hidden = false;
  batchText.textContent = `Batch progress: ${x}/${y}`;
  batchProgressBar.style.width = `${(x / y) * 100}%`;
}
function hideBatchStatus() {
  batchStatus.hidden = true;
}

// Run / Cancel
runBtn.addEventListener('click', async () => {
  const prompt = promptEl.value.trim();
  const iterations = clamp(parseInt(iterationsEl.value || '1', 10), 1, 50);
  const img = imageLoader.getCurrent();
  const enabledModels = modelTabs.getEnabledModels();
  if (!prompt || !img || enabledModels.length === 0) {
    alert('Please load an image, enter a prompt, and enable at least one model.');
    return;
  }

  storage.setLastPrompt(prompt);
  const batchRunner = new BatchRunner(historyStore, overlay, resultsTable, modelTabs);
  cancelBtn.hidden = false;

  const onProgress = ({ done, total, runLabel, batchId, runId, runMeta }) => {
    showBatchStatus(done, total);
    const seq = runMeta.batchSeq;
    setBadge(`Viewing: Run #${runLabel} • Batch #${runMeta.batchId.slice(-6)} (${seq}/${total})`);
    historyDropdown.refresh();
  };
  const onFinish = () => {
    cancelBtn.hidden = true;
    hideBatchStatus();
  };

  activeBatch = batchRunner;
  batchRunner.runBatch({
    iterations,
    imageBlob: img.blob,
    imageName: img.name,
    prompt,
    enabledModels,
  }, onProgress).finally(onFinish);
});

cancelBtn.addEventListener('click', () => {
  if (activeBatch) {
    activeBatch.cancel();
  }
});

// History dropdown / dialog
viewAllHistoryBtn.addEventListener('click', () => historyDialog.open());

historyDropdown.onSelect(async (entry) => {
  if (!entry) return;
  const { runMeta, runData } = entry;
  const img = await historyStore.getImage(runMeta.imageRef);
  const { bitmap } = await imageLoader.loadBlob(img, runMeta.imageName);
  overlay.setImage(bitmap, runMeta.imageW, runMeta.imageH, runMeta.imageName);
  overlay.drawDetections(runData.results.map(r => ({ color: r.color, model: r.modelDisplayName, det: r.parsed?.primary || null })));
  resultsTable.showRun(runMeta, runData);
  setBadge(`Viewing: Run #${historyDropdown.labelForRun(runMeta.id)} • Batch #${runMeta.batchId.slice(-6)} (${runMeta.batchSeq}/${historyStore.batchIterations(runMeta.batchId)})`);
});

// Storage tab (import/export configs and wipe history controls)
function renderStorageTab() {
  const root = storageRoot;
  root.innerHTML = '';
  const h = document.createElement('div');
  h.className = 'section-block';
  h.innerHTML = `
    <h3>Storage</h3>
    <div class="row">
      <button class="btn" id="exportModelsBtn" aria-label="Export model configurations">Export Models</button>
      <input type="file" id="importModelsInput" accept="application/json" aria-label="Import model configurations"/>
      <button class="btn danger" id="wipeHistoryBtn" aria-label="Wipe all history">Wipe History</button>
    </div>
  `;
  root.appendChild(h);

  document.getElementById('exportModelsBtn').onclick = () => {
    const data = storage.getModelConfigs();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'model-configs.json'; a.click();
    URL.revokeObjectURL(url);
  };
  document.getElementById('importModelsInput').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      storage.setModelConfigs(json);
      modelTabs.render();
      alert('Imported model configurations.');
    } catch (err) {
      alert('Invalid JSON.');
    }
  };
  document.getElementById('wipeHistoryBtn').onclick = async () => {
    if (!confirm('Wipe all history? This cannot be undone.')) return;
    await historyStore.wipeAll();
    overlay.clear();
    resultsTable.clear();
    historyDropdown.refresh();
    setBadge('Working: Unsaved');
    alert('History wiped.');
  };
}
renderStorageTab();
