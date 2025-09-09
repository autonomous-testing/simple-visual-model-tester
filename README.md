# UI Element Locator — Multi‑Model LLM Visual Evaluator (SPA)

Browser‑only MVP to send one prompt + one image to multiple OpenAI‑compatible **vision** models in parallel, draw detections on a canvas, log per‑model traffic, persist **Runs** and **Batches**, and export CSV.

## Quick Start

1. Host the `app/` folder as static files (no server logic required). Any simple HTTP server works, e.g.:

```bash
# Python
python3 -m http.server -d app 8080
# or
npx http-server app -p 8080
```

2. Open `http://localhost:8080` in a modern desktop browser (Chrome/Edge/Safari/Firefox).

3. In **Models** tab, set **Base URL**, **API Key**, **Endpoint Type** (`chat` or `responses`) and **Model** (e.g., `gpt-4o-mini`). Click **Save to Browser**.

4. **Choose Image** → **Load Selected Image**, enter **Prompt**, set **Iterations** if needed, click **Run on Enabled Models**.

5. Inspect overlay + logs. Use **Results** tab to **Export CSV** for *This run / This batch / All runs*.

## Notes

- **CORS**: The target API must allow browser requests from your SPA origin. For production, place a tiny token‑signing proxy and lock CORS to your domain.
- **Security**: API keys live in the browser (localStorage). Do not ship this as‑is to untrusted users.
- **Persistence**: Metadata in `localStorage`, payloads (runs + image blobs) in IndexedDB. History survives reload.
- **Response contract**: The app instructs models to return **JSON only** with:
  ```json
  {
    "coordinate_system": "pixel",
    "origin": "top-left",
    "image_size": { "width": 123, "height": 456 },
    "primary": { "type": "point", "x": 10, "y": 20, "confidence": 0.9 },
    "others": [],
    "notes": "optional"
  }
  ```

### GroundingDINO Support (Optional)

Besides LLM providers, the app can call a local GroundingDINO server for phrase‑grounded object detection.

- Add a model and choose Endpoint Type: `GroundingDINO`.
- Set Base URL to your detection endpoint (example server below serves `/groundingdino/detect`).
- Adjust `Box thr` and `Text thr` as desired.

Example server is included in `server/`:

1) Create venv and install requirements, then install GroundingDINO from source.
2) Set `GROUNDING_DINO_CONFIG_PATH` and `GROUNDING_DINO_WEIGHTS_PATH` env vars.
3) Run: `uvicorn server.groundingdino_api:app --port 8001`
4) In the app, set Base URL to `http://localhost:8001/groundingdino/detect` and test.

The SPA adapts common GroundingDINO server responses into its canonical JSON for overlay rendering and CSV exports. It supports:
- Pixel-space detections: `{ width, height, detections: [{ x,y,width,height,confidence }] }`
- Label Studio–style results like your remote service returns: `{ results: [{ result: [{ type: 'rectanglelabels', value: { x,y,width,height,score } }], score }] }` with normalized [0..1] coordinates (scaled to pixels using the input image size).

Remote example (already running):
- Endpoint: `https://dino.d2.wopee.io/predict`
- Configure a model with:
  - Endpoint Type: `GroundingDINO`
  - Base URL: `https://dino.d2.wopee.io/predict`
  - Model (label): e.g. `GroundingDINO`
  - Box thr: `0.35` • Text thr: `0.25`

The client uploads the image as multipart/form-data with fields `file`, `prompt`, `box_threshold`, `text_threshold`, matching this curl you used:

```
curl -i -X POST "https://dino.d2.wopee.io/predict" \
  -F "file=@Downloads/screenshot.png" \
  -F "prompt=button" \
  -F "box_threshold=0.35" \
  -F "text_threshold=0.25"
```

## Browser Support

- Designed for evergreen browsers (ES modules). Uses `createImageBitmap({ imageOrientation: 'from-image' })` to respect EXIF rotation when supported, with a safe fallback.

## GitHub Pages

- Source: `main` branch, folder `/app`.
- URL (after enabling): https://autonomous-testing.github.io/simple-visual-model-tester/

Enable in GitHub: Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `main` → Folder: `/app` → Save.

## Folder Layout

```
app/
  index.html
  styles.css
  .nojekyll
  src/
    main.js
    components/
      image-loader.js
      model-tabs.js
      overlay-renderer.js
      results-table.js
      history-dropdown.js
      history-dialog.js
    core/
      api-client.js
      parser.js
      metrics.js
      storage.js
      idb.js
      history-store.js
      batch-runner.js
      logger.js
      utils.js
```

## Acceptance Criteria Coverage

- **Image Load & Normalize**: canvas upright via `createImageBitmap(..., { imageOrientation: 'from-image' })`.
- **Parallel Call & Overlay**: `BatchRunner` fires all enabled models in parallel per run; overlay draws points/bboxes with labels.
- **Per‑Model Logs**: stored per model in `RunData.logs[modelId]` with sanitized headers and timings.
- **CSV Export**: `Results` tab exports CSV for *run/batch/all* with exact columns.
- **History**: dropdown + dialog load past runs; images come from IDB.
- **Batch**: sequential iterations, cancel via **Cancel Batch** (aborts next runs).
- **Persistence**: runs/batches in localStorage + IDB, reloaded after refresh.

## Known Limits (MVP)

- No pan/zoom. No ground truth scoring.
- Some OpenAI‑compatible servers use different response shapes; client extracts `.choices[0].message.content` or `.output_text` when possible, else stringifies JSON.
- If IndexedDB is blocked, images fall back to stored data URLs only when you modify code (out of scope here).

---

© You. MIT‑style licensing recommended.
