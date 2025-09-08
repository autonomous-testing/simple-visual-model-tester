import { ImageLoader } from './components/image-loader.js';
import { OverlayRenderer } from './components/overlay-renderer.js';
import { ModelTabs } from './components/model-tabs.js';
import { ResultsTable } from './components/results-table.js';
import { HistoryTable } from './components/history-table.js';
import { HistoryDialog } from './components/history-dialog.js';
import { BatchRunner } from './core/batch-runner.js';
import { Storage } from './core/storage.js';
import { HistoryStore } from './core/history-store.js';
import { uuid, clamp, short, onKey } from './core/utils.js';

// Elements
const fileInput = document.getElementById('fileInput');
const promptEl = document.getElementById('prompt');
const runBtn = document.getElementById('runBtn');
const cancelBtn = document.getElementById('cancelBtn');
const iterationsEl = document.getElementById('iterations');
const badge = document.getElementById('badge');
const canvas = document.getElementById('previewCanvas');
const legendEl = document.getElementById('legend');
const historyTableEl = document.getElementById('historyTable');
const viewAllHistoryBtn = document.getElementById('viewAllHistoryBtn');
const batchStatus = document.getElementById('batchStatus');
const batchText = document.getElementById('batchText');
const batchProgressBar = document.getElementById('batchProgressBar');

// Models tabs (dynamic per model)
const modelsTabsHeader = document.getElementById('models-tabs-header');
const modelsTabsBody = document.getElementById('models-tabs-body');

// Preview panel tabs (Preview / Results / Prompt Template)
const previewTabButtons = Array.from(document.querySelectorAll('.panel.preview .tab-btn'));
const previewPanes = {
  preview: document.getElementById('preview-pane'),
  results: document.getElementById('results-pane'),
  prompt: document.getElementById('prompt-pane'),
};
previewTabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    previewTabButtons.forEach(b => b.classList.remove('active'));
    Object.values(previewPanes).forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    previewPanes[btn.dataset.tab].classList.add('active');
    // When switching back to the Preview tab, ensure canvas is redrawn
    // after it becomes visible so dimensions are correct.
    if (btn.dataset.tab === 'preview') {
      requestAnimationFrame(() => {
        // Trigger a resize so OverlayRenderer redraws reliably
        window.dispatchEvent(new Event('resize'));
      });
    }
  });
});

// Core services
const storage = new Storage();
const historyStore = new HistoryStore();
const imageLoader = new ImageLoader(canvas);
const overlay = new OverlayRenderer(canvas, legendEl);
const resultsTable = new ResultsTable(previewPanes.results, historyStore);
const modelTabs = new ModelTabs(modelsTabsHeader, modelsTabsBody, storage);
const historyTable = new HistoryTable(historyTableEl, historyStore);
const historyDialog = new HistoryDialog(document.getElementById('historyDialog'), historyStore, overlay, resultsTable, imageLoader);
const storageRoot = document.getElementById('sidebar-storage');

let activeBatch = null;

// Initialize UI from storage
promptEl.value = storage.getLastPrompt() || '';
modelTabs.render();
resultsTable.renderScopeBar();
historyTable.refresh();
renderPromptTemplateTab();

function setBadge(text) {
  badge.textContent = text;
}

// Prompt Template editor
function renderPromptTemplateTab() {
  const root = previewPanes.prompt;
  if (!root) return;
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'section-block';
  wrap.innerHTML = `
    <h3 style="margin-top:0;">System Prompt Template</h3>
    <p style="color:var(--muted); margin:6px 0 8px 0;">Use placeholders like <code>${'${image_width}'}</code>, <code>${'${image_height}'}</code>, <code>${'${user_prompt}'}</code>, <code>${'${coordinate_system}'}</code>, <code>${'${origin}'}</code>. Changes auto‑save.</p>
    <textarea id="sysPromptTemplate" rows="14" style="width:100%; resize:vertical;" aria-label="System prompt template"></textarea>
    <div class="row" style="margin-top:8px; display:flex; gap:8px;">
      <button class="btn" id="resetSysPromptBtn">Reset to Default</button>
    </div>
  `;
  root.appendChild(wrap);
  const ta = wrap.querySelector('#sysPromptTemplate');
  const resetBtn = wrap.querySelector('#resetSysPromptBtn');
  ta.value = storage.getSystemPromptTemplate();
  ta.addEventListener('input', () => {
    storage.setSystemPromptTemplate(ta.value);
    setBadge('Working: Unsaved');
  });
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset system prompt template to default?')) return;
    storage.resetSystemPromptTemplate();
    ta.value = storage.getSystemPromptTemplate();
    setBadge('Working: Unsaved');
  });
}

// Inputs wiring
fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const { bitmap, width, height, name } = await imageLoader.loadFile(file);
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
  const batchRunner = new BatchRunner(historyStore, overlay, resultsTable, modelTabs, storage);
  cancelBtn.hidden = false;

  const onProgress = ({ done, total, runLabel, batchId, runId, runMeta }) => {
    showBatchStatus(done, total);
    const seq = runMeta.batchSeq;
    setBadge(`Viewing: Run #${runLabel} • Batch #${runMeta.batchId.slice(-6)} (${seq}/${total})`);
    historyTable.refresh();
    historyTable.setSelected(runId);
  };
  const onRunStart = ({ runMeta }) => {
    // Show partial row right away and select it
    historyTable.refresh();
    historyTable.setSelected(runMeta.id);
    const seq = runMeta.batchSeq;
    const runLabel = historyStore.labelForRun(runMeta.id);
    setBadge(`Viewing: Run #${runLabel} • Batch #${runMeta.batchId.slice(-6)} (${seq}/${iterations})`);
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
  }, onProgress, onRunStart).finally(onFinish);
});

cancelBtn.addEventListener('click', () => {
  if (activeBatch) {
    activeBatch.cancel();
  }
});

// History dropdown / dialog
viewAllHistoryBtn.addEventListener('click', () => historyDialog.open());

historyTable.onSelect(async (entry) => {
  if (!entry) return;
  const { runMeta, runData } = entry;
  const img = await historyStore.getImage(runMeta.imageRef);
  const { bitmap } = await imageLoader.loadBlob(img, runMeta.imageName);
  overlay.setImage(bitmap, runMeta.imageW, runMeta.imageH, runMeta.imageName);
  overlay.drawDetections(runData.results.map(r => ({ color: r.color, model: r.modelDisplayName, det: r.parsed?.primary || null })));
  resultsTable.showRun(runMeta, runData);
  // Also restore the prompt to make re-running easy
  promptEl.value = runMeta.prompt || '';
  storage.setLastPrompt(promptEl.value);
  historyTable.setSelected(runMeta.id);
  setBadge(`Viewing: Run #${historyTable.labelForRun(runMeta.id)} • Batch #${runMeta.batchId.slice(-6)} (${runMeta.batchSeq}/${historyStore.batchIterations(runMeta.batchId)})`);
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
      <button class="btn danger" id="wipeHistoryBtn" aria-label="Wipe all history">Wipe History</button>
    </div>
  `;
  root.appendChild(h);
  document.getElementById('wipeHistoryBtn').onclick = async () => {
    if (!confirm('Wipe all history? This cannot be undone.')) return;
    await historyStore.wipeAll();
    overlay.clear();
    resultsTable.clear();
    historyTable.refresh();
    setBadge('Working: Unsaved');
    alert('History wiped.');
  };
}
renderStorageTab();
