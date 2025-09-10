# AGENTS Playbook — simple-visual-model-tester

This document guides AI coding agents (and humans) to work efficiently and safely on this project. It captures architecture, extension points, guardrails, commands, and common workflows.

## What This App Does

- Single‑page web app to send one prompt + one image to multiple OpenAI‑compatible vision endpoints in parallel, draw detections on a canvas, log per‑model traffic, persist Runs and Batches, and export CSV.
- 100% browser‑only. No server code in this repo.

## Fast Facts

- Build: `npm ci && npm run build` → outputs `app/bundle.iife.js`.
- Open locally: `app/index.html` directly in a browser, or host the `app/` folder statically (e.g., GitHub Pages) and open the published URL.
- Entry HTML: `app/index.html`.
- Source: ES modules under `app/src/**`. Bundle is IIFE for simple hosting.
- Deploy: GitHub Pages action builds and publishes `app/` on push to `main`.

## Architecture Map

- UI shell: `app/index.html` (static DOM structure and tabs).
- Orchestrator: `app/src/main.js` — wires inputs, tabs, overlay, batch runner, and history.
- Models UI: `app/src/components/model-tabs.js` — configure models, test connection, per‑model logs.
- Overlay: `app/src/components/overlay-renderer.js` — draws points/bboxes + labels.
- Results/CSV: `app/src/components/results-table.js` — table views and CSV export.
- History: `app/src/components/history-*.js`, `app/src/core/history-store.js` — Run/Batch metadata in localStorage; payloads in IndexedDB.
- Batch engine: `app/src/core/batch-runner.js` — runs parallel model calls per run; sequences iterations.
- API client: `app/src/core/api-client.js` — builds request, calls fetch with timeout, sanitizes logs, adapts GroundingDINO.
- Provider payloads: `app/src/core/providers/builder.js` — constructs endpoint‑specific request bodies.
- Parsing: `app/src/core/parser.js` — strict JSON extraction/validation/clamping into canonical format.
- Settings: `app/src/core/storage.js` — model configs, prompt, system prompt template.

Data flow (happy path): UI → BatchRunner → ApiClient (→ Provider builder) → fetch → Parser → ResultsTable + Overlay → HistoryStore.

## Contracts You Must Preserve

- Model response JSON (canonical): coordinate_system=pixel, origin=top-left, image_size{w,h}, primary(point|bbox), others[], optional notes. Parser clamps/validates.
- CSV columns and semantics are stable for downstream analysis.
- Logs must be sanitized (no Authorization/api-key) and stored per model per run.
- Local persistence: indices in localStorage; blobs/run payloads in IndexedDB.

## Provider/Endpoint Notes

- Endpoint types: `chat`, `responses`, `groundingdino`.
- `builder.js` centralizes payload shapes and quirks:
  - OpenRouter + Qwen VL: image_url string and plain system text.
  - Azure: `api-key` header and optional `api-version` query param.
  - Responses API: `input[]` with `input_text`/`input_image`, `max_output_tokens` at top level.
- `api-client.js` extracts text from varied response shapes and adapts GroundingDINO responses into canonical JSON for overlay/CSV.
- GroundingDINO: Prefer multipart form-data to avoid CORS preflight; retries JSON as fallback; accepts multiple prompt key synonyms.

## Common Tasks (Step‑by‑Step)

1) Add a new model property to UI and storage
- Update defaults: `app/src/core/storage.js` (defaultModels, addDefaultModel) to include the field.
- Render + persist in UI: `app/src/components/model-tabs.js` (card form, `persist()` mapping, labels/ARIA, endpoint applicability toggles).
- Use the field where needed (e.g., pass to ApiClient).

2) Support a new endpoint/provider variant
- Extend `app/src/core/providers/builder.js` to emit the correct request body for the new type.
- If response shape differs, extend `_extractTextFromResponse` in `app/src/core/api-client.js`.
- Surface controls in `model-tabs.js` (buttons/inputs visible only when applicable).
- If truly new endpointType, plumb it through Storage defaults, Tabs, Builder, ApiClient.

3) Change CSV schema or add a column
- Results are assembled in `app/src/components/results-table.js`. Update header list, row builder, export logic, and any scope filters.
- Keep column order stable or document the change in README.

4) Tune the system prompt template UX
- Default template: `app/src/core/storage.js` (function `defaultSystemPromptTemplate`).
- UI for editing/resetting lives in `app/src/main.js` under “Prompt Template” tab.

5) Improve error handling / timeouts
- Api timeout is per model: `timeoutMs` in model config; enforced via `AbortController` in `api-client.js`.
- Batch cancel toggles `BatchRunner.cancel()` and stops future runs.

## Guardrails for Agents

- Keep changes minimal and scoped. Do not refactor across modules unless necessary.
- Do not add heavy dependencies or frameworks. Build remains a single esbuild bundle.
- Do not log secrets. Always sanitize headers (Authorization/api-key) in logs.
- Maintain accessibility (ARIA roles/labels) when altering UI.
- Follow existing style: idiomatic vanilla JS, ES modules in `src`, no license headers, no one‑letter variables.
- Update docs if you change public contracts (README + this file).

## Local Dev & Commands

- Install deps: `npm ci`
- Build bundle: `npm run build`
- Open locally: `app/index.html` or host via GitHub Pages.

Notes
- Some providers block `file://` origins. Hosting via GitHub Pages avoids CORS issues.
- GitHub Pages deploys `app/` after pushes to `main` (see `.github/workflows/deploy-pages.yml`).

## Troubleshooting

- CORS: Target API must allow your origin (e.g., your GitHub Pages domain). If blocked, test from a permitted origin.
- Azure errors: Ensure `baseURL` ends with the instance `/openai` prefix and `api-version` is present.
- Invalid JSON from models: Parser marks `invalid_json`; enforce JSON‑only with response_format and strong system prompt.
- Timeouts: Increase per‑model `timeoutMs` or reduce concurrency by disabling models.
- IDB/storage full or blocked: History may fail; wipe via Storage section UI if needed.
- GroundingDINO: Some servers only accept multipart or only JSON; client auto‑retries JSON when needed.

## Extension Points (Where to Edit)

- Request building quirks: `app/src/core/providers/builder.js`
- Response text extraction and GroundingDINO adaptation: `app/src/core/api-client.js`
- Parser and validation/clamping: `app/src/core/parser.js`
- Model config defaults and storage keys: `app/src/core/storage.js`
- Model UI and persistence: `app/src/components/model-tabs.js`
- Results + CSV export: `app/src/components/results-table.js`
- Overlay drawing: `app/src/components/overlay-renderer.js`
- History persistence: `app/src/core/history-store.js` and `app/src/core/idb.js`
- Batch orchestration: `app/src/core/batch-runner.js`

## Definition of Done (for changes)

- Builds with `npm run build` without warnings.
- Manual check: load an image, run at least one enabled model, see overlay and logs.
- CSV exports succeed for “This run”, ideally also “This batch” and “All runs”.
- No secrets in logs; headers sanitized.
- README and AGENTS updated if public contracts changed.

## Future Enhancements (Backlog hints)

- Inter‑run delay to respect rate limits.
- Pan/zoom overlay and ghost overlay across runs.
- Batch summary dashboards and metrics.
- Ground‑truth import and scoring.

---

Authorship: This file is maintained alongside the code. Keep it crisp and actionable for agents.
