Product Requirements & Technical Specification

Project: UI Element Locator — Multi-Model LLM Visual Evaluator (single-page web app)
Goal: From a browser, send one prompt + one image to multiple OpenAI-compatible vision models in parallel, receive coordinates of a UI element, overlay those coordinates on a preview canvas, log all traffic per model, persist runs and batches, and export structured CSV for analysis.
Constraints: Lightweight SPA; no heavy frameworks; front-end only (MVP) with local persistence; models reachable over CORS via OpenAI-compatible APIs.

⸻

1. User Stories & Scope

1.1 Primary
	1.	Upload & Prompt: As a user, I select an image and enter an English prompt (e.g., “Find the primary ‘Sign in’ button.”).
	2.	Parallel Models: I enable multiple models (OpenAI-compatible endpoints) and run them all in parallel with the same input.
	3.	Visual Overlay: I see all model outputs drawn together on the image preview, each in its own color and labeled with the model name.
	4.	Per-Model Logs: For each model, I can inspect the exact request payload (without API keys), the raw response, parsing status, HTTP status, and latency.
	5.	Results Table & Export: I see structured results in a table and export them as CSV for offline analysis.
	6.	History of Runs: Every execution becomes an immutable Run (image + prompt + model snapshots + results). I can switch to any past run, reload its image, overlay, and logs. Runs persist across reloads.
	7.	Iterative Runs (Batch): I can set Iterations (1–50). The app runs sequentially, creating a new run after each previous run completes, until the desired count is met (or canceled). All runs are linked by a Batch with sequential numbering.

1.2 Out of Scope (MVP)
	•	Authentication / multi-user accounts.
	•	Ground-truth scoring.
	•	Pan/zoom overlay; ghost overlays across runs.
	•	Model fine-tuning or training.

⸻

2. UX / UI Specification

2.1 Layout
	•	Top Left (Inputs panel):
	•	Choose Image (file input) + Load Selected Image (button).
	•	Prompt (multiline textarea).
	•	Iterations (numeric input; min 1, max 50; default 1).
	•	Run on Enabled Models (primary button).
	•	Cancel Batch (danger button; visible only during batch).
	•	History (dropdown: latest N runs + “View all…” to open History dialog).
	•	Status line: “Batch progress: X/Y” and a lightweight progress bar (only during batch).
	•	Top Right (Preview panel):
	•	Large Canvas showing the loaded image.
	•	Overlay: colored markers (points and/or bounding boxes) with text labels (model display names).
	•	Badge above canvas:
	•	“Working: Unsaved” (when editing inputs)
	•	“Viewing: Run #{{n}} • Batch #{{b}} ({{seq}}/{{iterations}})” (history view; read-only)
	•	Bottom Half (Tabs):
	•	Models: each enabled/disabled model on its own tab.
	•	Model header: color swatch + Model Display Name + Enabled toggle.
	•	Connection section: Base URL, API Key (password field), Endpoint Type (chat or responses), Model ID, Temperature, Max tokens, Extra headers, Timeout (ms).
	•	Save to Browser, Test Connection.
	•	Log section (request preview, response raw, parsed status, latency, timestamps).
	•	Results: table with scope selector: This run | This batch | All runs. Export CSV button respects selected scope.
	•	Storage: list/import/export of model configs; wipe history (optional, MVP+1).
	•	History (dialog via “View all…”): tabular list of all runs (and a toggle Group by Batch). Each row has Load and Export CSV (this run). Optional Delete (MVP+1).

2.2 Visual Details
	•	Point: 6 px radius circle + crosshair + text label; stroke width constant (devicePixelRatio-aware).
	•	BBox: 2 px stroked rectangle (no fill) + label at top edge.
	•	Legend (optional): small legend at bottom-right mapping model names to colors.

2.3 Accessibility
	•	English-only UI.
	•	Buttons and inputs with aria-label.
	•	Keyboard shortcuts: R = Run, C = Clear (if implemented), Esc = Cancel Batch (if active).
	•	Sufficient contrast for overlay labels.

⸻

3. Data & Types

3.1 Coordinates & Image
	•	Coordinate system: pixels, origin top-left.
	•	Types:

type DetectionPoint = { type: "point"; x: number; y: number; confidence?: number|null };
type DetectionBBox  = { type: "bbox";  x: number; y: number; width: number; height: number; confidence?: number|null };
type Detection = DetectionPoint | DetectionBBox;


	•	Image orientation: normalize via canvas on load (respect EXIF), store normalized width/height.
	•	Overlay performs scaling via scaleX, scaleY computed from original→display size; overlay logic is resolution-independent.

3.2 Model Configuration

type ModelConfig = {
  id: string;                 // UUID
  displayName: string;        // e.g., "Server A • gpt-4o-mini"
  color: string;              // hex
  enabled: boolean;

  baseURL: string;            // e.g., "https://api.example.com/v1"
  apiKey: string;             // stored only in browser; never logged
  endpointType: "chat" | "responses";
  model: string;              // e.g., "gpt-4o-mini"
  temperature?: number;       // default 0
  maxTokens?: number;         // default 300
  extraHeaders?: Record<string,string>;
  timeoutMs?: number;         // default 60000
};

LocalStorage keys:
	•	ui-detective:model-configs → ModelConfig[]
	•	ui-detective:last-prompt → string

3.3 Results & Logs

type ModelRunResult = {
  modelId: string;
  modelDisplayName: string;
  color: string;
  status: "ok" | "error" | "timeout" | "invalid_json";
  latencyMs: number | null;
  rawText: string; // raw response text
  parsed: {
    imageSize: { width:number; height:number } | null;
    primary: Detection | null;
    others?: Detection[];
    notes?: string;
  } | null;
  errorMessage?: string;
};

type ModelLog = {
  request: {
    url: string;
    headers: Record<string,string>; // sanitized (no Authorization)
    bodyPreview: string;            // truncated
  };
  response: {
    status: number;
    rawText: string;
    parsedStatus: "ok" | "invalid_json" | "error";
  };
  timing: {
    startedAtIso: string;
    finishedAtIso: string;
    latencyMs: number;
  };
};

3.4 Runs & Batches (History)

type BatchId = string; // UUID/ULID
type RunId = string;

type BatchMeta = {
  id: BatchId;
  createdAtIso: string;
  iterations: number; // 1..50
  imageName: string;
  imageW: number;
  imageH: number;
  prompt: string;
  imageRef: { kind:"idb-blob"|"data-url"; key:string; bytes?:number };
  modelSnapshots: Array<{
    modelConfigId: string;
    displayName: string;
    color: string;
    baseURL: string;
    model: string;
    endpointType: "chat"|"responses";
    temperature?: number;
    maxTokens?: number;
  }>;
  summary: {
    runsDone: number;
    okCount: number;     // sum across runs/models
    errorCount: number;
    avgLatencyMs?: number|null;
  };
};

type RunMeta = {
  id: RunId;
  createdAtIso: string;
  batchId: BatchId;
  batchSeq: number;      // 1..iterations
  imageName: string;
  imageW: number;
  imageH: number;
  prompt: string;
  enabledModelIds: string[];
  modelSnapshots: BatchMeta["modelSnapshots"];
  imageRef: BatchMeta["imageRef"];
  summary: { okCount: number; errorCount: number; latencyAvgMs?: number|null };
};

type RunData = {
  id: RunId;
  results: ModelRunResult[];
  logs: Record<string /* modelConfigId */, ModelLog>;
};

3.5 Results Table Row / CSV Schema

Scope: “This run”, “This batch”, “All runs” (aggregates).
Columns:

batchId,batchSeq,runId,runLabel,timestampIso,
imageName,imageW,imageH,prompt,
modelDisplayName,baseURL,model,
detectionType,x,y,width,height,confidence,
latencyMs,status,error,rawTextShort

	•	runLabel: e.g., “Run #27” (UI index label).
	•	CSV encoding: UTF-8, comma ,, quote values containing commas.

⸻

4. API Contracts (OpenAI-compatible)

4.1 /v1/chat/completions (common)

Request (example):

{
  "model": "<MODEL_ID>",
  "temperature": 0,
  "max_tokens": 300,
  "messages": [
    {
      "role": "system",
      "content": [
        { "type": "text", "text": "You are a vision model that returns JSON only. Follow the schema exactly." }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "<PROMPT_IN_ENGLISH>" },
        { "type": "input_image", "image_url": "data:image/png;base64,AAAA..." }
      ]
    }
  ],
  "response_format": { "type": "json_object" }
}

4.2 /v1/responses (unified)

Request (example):

{
  "model": "<MODEL_ID>",
  "input": [
    {
      "role": "system",
      "content": [{ "type":"text", "text":"You are a vision model that returns JSON only. Follow the schema exactly." }]
    },
    {
      "role": "user",
      "content": [
        { "type":"input_text", "text":"<PROMPT_IN_ENGLISH>" },
        { "type":"input_image", "image_url":"data:image/png;base64,AAAA..." }
      ]
    }
  ],
  "temperature": 0,
  "max_output_tokens": 300,
  "response_format": { "type":"json_object" }
}

Some servers expect type: "image_url" objects (legacy). The client must adapt payloads based on endpointType.

4.3 Required Response JSON (Model Contract)

The app will instruct models to return only valid JSON matching:

{
  "coordinate_system": "pixel",
  "origin": "top-left",
  "image_size": { "width": <int>, "height": <int> },
  "primary": { "type": "point" | "bbox", "...": <numbers> },
  "others": [ /* zero or more Detection objects */ ],
  "notes": "<optional string>"
}

	•	primary may be point or bbox.
	•	Coordinates must be within bounds.
	•	Include confidence in [0.0, 1.0] when available.

System prompt template:

You are a strictly JSON-only assistant. Output ONLY valid JSON with no extra text.
Task: Given one image and an instruction, locate the UI element and return coordinates.

Schema (must match exactly):
{
  "coordinate_system": "pixel",
  "origin": "top-left",
  "image_size": { "width": int, "height": int },
  "primary": { "type": "point" | "bbox", "...numbers as defined..." },
  "others": [ Detection objects ... ],
  "notes": string (optional)
}

Rules:
- If unsure, still return your best guess with a confidence in [0.0, 1.0].
- Coordinates must be within image bounds.
- If both point and bbox are reasonable, prefer "point" as primary.
- Do not include any commentary or code fences; return JSON only.


⸻

5. Application Architecture

5.1 Stack
	•	Language: Vanilla JavaScript (ES modules), HTML, CSS.
	•	Libraries (lightweight, optional):
	•	lit-html for templating (or none),
	•	mitt for event bus,
	•	zod for response validation (or minimal custom validator).
	•	No React/Vue/Angular.

5.2 Modules

/public
  index.html
  styles.css
/src
  main.js
  components/
    image-loader.js         // load file, EXIF normalize, compute scales
    prompt-form.js          // prompt + iterations + run/cancel
    model-tabs.js           // CRUD configs, logs per model
    overlay-renderer.js     // draw points/bboxes + labels
    results-table.js        // table, scope switch, CSV export
    history-dropdown.js     // recent runs + "View all..."
    history-dialog.js       // full history list/filter/group by batch
  core/
    api-client.js           // OpenAI-compatible requests; abort/timeout
    parser.js               // JSON parse + validation + clamping
    metrics.js              // distances, IoU, center distance
    storage.js              // localStorage utilities
    idb.js                  // IndexedDB helpers (or idb-keyval)
    history-store.js        // index & payload persistence
    batch-runner.js         // orchestrates iterations (batches)
    logger.js               // per-model log buffers
    utils.js                // uuid/ulid, base64, truncation helpers

5.3 Persistence Strategy
	•	localStorage: small indices & settings
	•	ui-detective:model-configs (configs)
	•	ui-detective:history-index (all RunMeta)
	•	ui-detective:batch-index (all BatchMeta)
	•	IndexedDB: large payloads
	•	run:<RunId>:data → RunData
	•	img:<hash> → original image Blob (deduplicated)
	•	Fallback: if IDB unavailable, store image as data-url in RunMeta.imageRef (capacity-limited).

⸻

6. Control Flow

6.1 Single Run
	1.	User loads image & prompt.
	2.	Click Run on Enabled Models.
	3.	App creates BatchMeta (iterations=1) and RunMeta with snapshots and imageRef.
	4.	App calls each enabled model in parallel.
	5.	On completion (or timeout), app writes RunData & updates summaries.
	6.	UI renders overlay and table; History dropdown updates.

6.2 Batch (Iterations)
	•	Iterations run sequentially. Each iteration creates a new Run with batchId and batchSeq incremented.
	•	After the last model in a run settles (or global run timeout hits), the next run starts automatically until iterations reached or Cancel batch invoked.

Pseudocode (batch-runner)

async function runBatch({ iterations, imageBlob, prompt, enabledModels, interRunDelayMs=0 }) {
  const batchId = ulid();
  const imgHash = await hashBlob(imageBlob);
  await history.putImage(imgHash, imageBlob);

  const batchMeta = createBatchMeta({ batchId, iterations, imageBlob, prompt, imgHash, enabledModels });
  await history.addBatchMeta(batchMeta);

  for (let seq = 1; seq <= iterations; seq++) {
    if (cancelRequested) break;

    const runId = ulid();
    const runMeta = createRunMeta({ runId, batchMeta, batchSeq: seq, enabledModels });
    await history.addRunMeta(runMeta);
    await history.putRunData(runId, { id: runId, results: [], logs: {} });

    const settled = await allSettledWithGlobalTimeout(
      enabledModels.map(m => callModel(m, imageBlob, prompt)),
      computeGlobalRunTimeout(enabledModels) // e.g., max(model.timeoutMs) + 15s
    );

    const { results, logs, summary } = normalizeResultsAndLogs(settled);
    await history.putRunData(runId, { id: runId, results, logs });
    await history.updateRunMeta(applyRunSummary(runMeta, summary));
    await history.updateBatchMeta(applyBatchSummary(batchMeta, summary, seq));

    emit("run:done", { batchId, runId, seq, results });

    if (interRunDelayMs > 0) await sleep(interRunDelayMs);
  }

  emit("batch:finished", { batchId });
}


⸻

7. Parsing & Validation

7.1 Parser Rules
	•	Try JSON.parse. If fail → status = "invalid_json", store rawText.
	•	Required keys: image_size, primary.
	•	Numbers coerced to finite numbers; clamp coordinates to [0, width/height].
	•	Accept either point or bbox as primary.
	•	If both available, prefer point as primary (per system prompt).
	•	On any schema discrepancy, mark invalid_json but still keep rawText.

7.2 Metrics (for analytics tab & CSV enrichment if needed)
	•	Point vs Point: Euclidean distance d = sqrt((x1-x2)^2 + (y1-y2)^2).
	•	BBox vs BBox:
	•	IoU: (area(intersection) / area(union)).
	•	Center distance: distance between bbox centers.
	•	Provide small “Distance Matrix” view within Results (MVP: points only).

⸻

8. Error Handling & Edge Cases
	•	HTTP 401/403: “Auth error – check API key.”
	•	CORS preflight/denied: “CORS error – target API must allow browser requests.”
	•	Per-model timeout: mark model as timeout.
	•	Global run timeout: any remaining pending requests are treated as timeout; the run completes.
	•	Abort (Cancel batch): abort active fetches; write partial results for the current run; stop the loop.
	•	Invalid coordinates: highlight in log; ignore out-of-bounds in overlay.
	•	Image too large: optionally recompress for transport; always keep original blob in IDB.

⸻

9. Security Notes (Browser-Only MVP)
	•	API keys reside in the browser (localStorage). This is not secure for production.
	•	Never log or persist Authorization headers.

⸻

10. Non-Functional Requirements
	•	Performance:
	•	10 models in parallel max (configurable).
	•	Default per-model timeout 60s; global run timeout = max(timeouts) + 15s.
	•	Canvas uses devicePixelRatio for crisp labels.
	•	Resilience:
	•	One failing model must not block others or the run/batch.
	•	IDB failures fallback to data URLs (with warning).
	•	Persistence:
	•	History survives reload.
	•	Image blobs deduplicated by content hash.
	•	Code Quality:
	•	ESM modules; no build step required for MVP (plain ES2020).
	•	Functions documented with JSDoc; strict linting if a toolchain is used.
	•	Accessibility: basic ARIA, keyboard support for core actions.

⸻

11. Acceptance Criteria (Executable)
	1.	Image Load & Normalize
	•	Given a PNG/JPEG/WebP with EXIF rotation, when I click Load Selected Image, I see the image upright and scaled to fit the preview area.
	2.	Parallel Call & Overlay
	•	With 3 enabled models and one prompt, clicking Run on Enabled Models sends 3 requests in parallel. Within 60s each model’s status is shown as ok, timeout, error, or invalid_json. Overlay displays all successful detections with correct colors and labels.
	3.	Per-Model Logs
	•	For each model, I can see sanitized request info (no API key), raw response text, parsed status, HTTP code, and latency.
	4.	CSV Export (This run)
	•	Export yields one row per model with columns exactly as specified (including imageName, prompt, runId, etc.).
	5.	History (Runs)
	•	After a run completes, the History dropdown lists a new item “Run #X • {imageName} • {promptShort} • {time}”. Selecting it reloads the exact overlay and logs from that moment (read-only).
	6.	Batch (Iterations)
	•	Setting Iterations = 5 runs 5 sequential runs with the same inputs, creating runs with batchSeq=1..5. The progress shows 1/5 → 5/5.
	•	Canceling mid-batch stops future runs and preserves completed runs.
	7.	CSV Export (This batch / All runs)
	•	Scope “This batch” exports all rows for runs in that batch. “All runs” exports every run stored.
	8.	Persistence
	•	After page reload, I can select any past run from the dropdown, and the app shows the correct image, overlay, and logs without reuploading the image file manually.

⸻

12. Implementation Notes

12.1 Image Loader
	•	Use FileReader → Blob/ArrayBuffer → canvas normalization (respect EXIF).
	•	Store original Blob in IDB. Compute SHA-256 hash for dedup.
	•	Provide getDisplayScale() returning {scaleX, scaleY} for overlay.

12.2 API Client
	•	For each model: build request body according to endpointType.
	•	fetch with AbortController and per-model timeout; JSON response or text fallback.
	•	Sanitize logs: drop Authorization and other sensitive headers.

12.3 Parser
	•	Strict JSON parsing.
	•	Validate required fields and numeric types (Number.isFinite).
	•	Clamp to [0..width] / [0..height].
	•	Return normalized ModelRunResult.

12.4 Overlay Renderer
	•	resizeObserver on preview container, recompute canvas size & redraw on resize.
	•	Use physical pixel size (canvas.width/height = cssSize * devicePixelRatio).
	•	Layer labels near shapes; avoid overlap with small offsets.

12.5 History Store
	•	Indices in localStorage: arrays of BatchMeta and RunMeta (latest first).
	•	Payloads in IDB: RunData by RunId, and Blob by img:<hash>.
	•	Provide methods:

addBatchMeta(meta); updateBatchMeta(meta); listBatchMeta();
addRunMeta(meta);   updateRunMeta(meta);   listRunMeta(); getRunData(runId);
putRunData(runId, data); putImage(hash, blob); getImage(hash);


	•	Optional delete with reference counting (MVP+1).

12.6 Results Table & Export
	•	Build rows from RunData.results + RunMeta/BatchMeta.
	•	rawTextShort = first 200 chars of rawText, with ellipsis if longer.
	•	CSV: generate via manual join (no dependency necessary).

12.7 Batch Runner
	•	Sequential loop; Promise.allSettled per run.
	•	Global run timeout cancels remaining pending model requests logically (treat as timeout) or via an additional AbortController if desired.
	•	Emit events to update UI states; show “Cancel batch” while active.

⸻

13. Test Plan (LLM-friendly)

13.1 Unit (Core)
	•	parser.spec: valid point; valid bbox; out-of-bounds clamped; invalid JSON; missing keys.
	•	metrics.spec: distances; IoU; center distance.
	•	history-store.spec: add/list/update meta; put/get run data; image dedup by hash.

13.2 Integration
	•	api-client.spec (mock fetch): 200 OK JSON; 200 non-JSON; 401; 429 retry once; timeout → timeout.
	•	batch-runner.spec: 3 iterations; cancel on 2nd; global run timeout.

13.3 E2E (Manual)
	•	Load diverse screenshots (light/dark UI, different DPIs, rotated).
	•	Try 3 real endpoints (or mocks) with different latencies; confirm overlay and logs.
	•	Export CSV for run/batch/all; open in spreadsheet; verify columns.

⸻

14. Future Enhancements (post-MVP)
	•	Inter-run delay (ms) setting to respect provider rate limits.
	•	Pan/zoom overlay; compare with previous run “ghost overlay”.
	•	Batch summary dashboards per model (mean, stddev, % invalid/timeout).
	•	Ground-truth import and automatic scoring.

⸻

15. Deliverables
	1.	Source tree as per module layout in §5.2.
	2.	index.html with basic layout and tab shells; all UI strings in English.
	3.	styles.css: responsive, simple, no heavy CSS frameworks (a minimal CSS like Pico.css acceptable).
	4.	JavaScript modules implementing: image load/normalize, API calls, parser, overlay, results table with CSV, history (IDB + localStorage), batch runner with cancel and progress, per-model logs.
	5.	README.md with: quick start, browser support, CORS requirements, security caveats, and a note on the OpenAI-compatible contract.

⸻

Appendix A — Example UI Strings
	•	Buttons: “Choose Image”, “Load Selected Image”, “Run on Enabled Models”, “Cancel Batch”, “Save to Browser”, “Test Connection”, “Export CSV”, “View all…”, “Re-run this setup”
	•	Labels: “Prompt”, “Iterations”, “History”, “Models”, “Connection”, “Log”, “Results”, “Storage”
	•	Status: “Working: Unsaved”, “Viewing: Run #{{n}} (read-only)”, “Batch progress: {{x}}/{{y}}”, “Auth error – check API key”, “CORS error – API must allow browser requests”

Appendix B — Prompts for Testing
	•	“Find the primary ‘Sign in’ button.”
	•	“Locate the search input field icon (magnifying glass).”
	•	“Return the center point of the ‘Settings’ gear icon.”
