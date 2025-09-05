# UI Element Locator — Multi‑Model LLM Visual Evaluator (SPA)

Browser‑only MVP to send one prompt + one image to multiple OpenAI‑compatible **vision** models in parallel, draw detections on a canvas, log per‑model traffic, persist **Runs** and **Batches**, and export CSV.

## Quick Start

1. Host the `docs/` folder as static files (no server logic required). Any simple HTTP server works, e.g.:

```bash
# Python
python3 -m http.server -d docs 8080
# or
npx http-server docs -p 8080
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

## Browser Support

- Designed for evergreen browsers (ES modules). Uses `createImageBitmap({ imageOrientation: 'from-image' })` to respect EXIF rotation when supported, with a safe fallback.

## GitHub Pages

- Source: `main` branch, folder `/docs`.
- URL (after enabling): https://autonomous-testing.github.io/simple-visual-model-tester/

Enable in GitHub: Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `main` → Folder: `/docs` → Save.

## Folder Layout

```
docs/
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
