# AGENTS.md — PdfZero

Browser-only PDF editor: every operation (render, edit, OCR, export, encrypt) runs client-side; no uploads, no backend. React 18 + Vite, plain JavaScript (JSX), no TypeScript.

## Commands

- `npm run dev` — Vite dev server (needs the COOP/COEP headers from `vite.config.js`; they are load-bearing for OCR workers).
- `npm run build` / `npm run preview`
- `npm run lint` — ESLint over `src/**/*.js` (JSX is excluded until `eslint-plugin-react` is adopted; see `eslint.config.js`). Run it after every change.
- `npm test` — Vitest suite (`src/lib/*.test.js`, `src/store/*.test.js`). Run it after touching `src/lib/` or the store.
- `npm run format` — Prettier over the repo (config in `.prettierrc.json`). Formatting is canonical; never hand-align style.

## The two-engine rule

Two PDF libraries, split by direction. Never cross the roles:

- **pdfjs-dist** (`src/lib/pdfRenderer.js`) — READ side: load documents, render pages/thumbnails to canvas, extract text items, classify embedded fonts (`classifyFont`), expose `BASE_SCALE`.
- **pdf-lib** (`src/lib/pdfExporter.js`) — WRITE side: create/modify/save PDFs (merge, split, rotate, watermark, page ops, export), with `@pdf-lib/fontkit` registered for custom-font embedding.

`pdfTextLayout.js` bridges them: it takes pdfjs text items and computes geometry (lines, runs, glyph fitting) so overlays and exports land where the original glyphs sit. Coordinate mapping between the two engines (pdfjs top-left origin vs PDF bottom-left origin) is centralized in the exporter/layout code around `BASE_SCALE` — do all conversions there, never ad hoc in components.

## Directory map

```
src/
  main.jsx            entry: BrowserRouter + App
  App.jsx             routes: / (Landing), /editor, /tools, /tools/:toolId
  pages/              route-level screens (Landing, Editor, Tools)
  components/
    editor/           PdfCanvas, PageThumbnails, EditorToolbar, PropertiesPanel,
                      TextBlock, AnnotationLayer — the editing workspace
    layout/           Navbar
    ui/               DropZone (shared file-input, wraps react-dropzone)
  lib/                pure logic, no React (see two-engine rule)
    pdfRenderer.js    pdfjs: loadPdf, renderPage, renderThumbnail, classifyFont
    pdfExporter.js    pdf-lib: exportPdf, merge/split/rotate/watermark, page ops,
                      downloadBytes, compress (iterative raster to target size),
                      encryptPDF via @pdfsmaller/pdf-encrypt
    pdfTextLayout.js  text geometry: textChars, layoutTextForBlock, splitTextLines
    ocrEngine.js      tesseract.js lazy worker: initOcr, ocrCanvas, terminateOcr
  store/pdfStore.js   single Zustand store (usePdfStore) — see editing model
  styles/globals.css  design tokens; components use co-located *.module.css
```

Dependency direction is one-way: `pages → components → lib/store`, and `lib`/`store` import nothing from UI. Keep new logic in `lib/` as plain functions.

## Editing model (non-destructive)

Original file bytes are never mutated. Edits live in the store as overlays; export re-draws them onto a copy:

- `editLayers[pageNum] = { texts: [], annotations: [] }` — uncommitted overlay state rendered on top of the page canvas.
- `extractedEdits[pageNum][originalId] = newStr` — committed text edits (from text extraction flow).
- History: `pushHistory` deep-clones both maps (JSON) into `historyPast` (cap `MAX_HISTORY = 100`), clearing `historyFuture`. Consequence: nothing non-serializable (DOM nodes, refs) may enter edit state.
- `blockBgs[pageNum][blockId]` — per-block sampled background color used to whiteout edited blocks on export. Per-block, not per-page: watermarks/seals/colored regions make one flat color wrong. Preserve this when touching export or sampling code.
- `pageBgs[pageNum]` — page-level sampled background.
- Selection/tool state: `selectedElement`, `activeTool`; changing page or tool clears selection.
- Mobile (<768px): Pages/Properties panels become drawers (`mobilePagesOpen` / `mobilePropertiesOpen`, only one open at a time).

## Export paths

Two exporters in `pdfExporter.js`, chosen by fidelity needs:

- **Vector** (`exportVectorPdf`): keeps real text by whiteouting original runs with sampled colors and re-drawing editable text with pdf-lib + fontkit. Default for text edits.
- **Visual/raster** (`exportVisualPdf`): snapshots rendered canvases; fallback when fidelity to appearance matters more than selectable text. Compression (`compressPdfToTarget`) iterates raster quality until the size target is met.

Tool pages (`src/pages/Tools.jsx`) all follow the same shape: `FileDropper` → tool-specific `handleX` calling `lib` → `downloadBytes`. Reuse `DropZone`/`FileDropper` and `react-hot-toast` for feedback instead of new UI per tool.

## Build gotchas (do not "simplify" these)

- `vite.config.js`: `optimizeDeps.exclude: ['pdfjs-dist']`, `worker.format: 'es'`, manual chunks for `pdf-lib`/`pdfjs`, and COOP/COEP headers on the dev server. Removing any of these breaks pdfjs workers or tesseract.js.
- OCR worker lifecycle: `initOcr` lazily creates one tesseract worker; call `terminateOcr` when done (see `ocrEngine.js`) — leaking workers degrades the page.
- Font fidelity: `index.html` loads Noto Sans/Serif, Lato, Merriweather as visual substitutes for embedded PDF fonts; `classifyFont` maps embedded fonts onto these families. A new substitute family must be added in both places.

## Conventions

- CSS Modules per component + `styles/globals.css` tokens. No Tailwind, no CSS-in-JS.
- Icons: `lucide-react`. Classes: `clsx`. Tostadas/feedback: `react-hot-toast`.
- Imports are relative (`../lib/...`), even though the `@` alias exists — follow the existing style.
- Components PascalCase `.jsx`; lib files camelCase `.js`; state flows from `usePdfStore` via direct hook subscription.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `zademy/PdfZero` (always `-R zademy/PdfZero`; this clone also has an upstream remote). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), label = role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
