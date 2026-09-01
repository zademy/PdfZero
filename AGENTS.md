# AGENTS.md — PdfZero

Browser-only PDF editor: every operation (render, edit, OCR, export, encrypt) runs client-side; no uploads, no backend. React 18 + Vite, plain JavaScript (JSX), no TypeScript.

## Commands

- `npm run dev` — Vite dev server (needs the COOP/COEP headers from `vite.config.js`; kept deliberately — see build gotchas).
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
    ocrPipeline.js    one-function OCR flow: ocrPage renders the page, runs
                      the single engine, cleans blocks (ocrBlocks, ADR 0001),
                      GLM-formats; throws OcrUnavailableError when Ollama or
                      the glm-ocr model is missing (ADR 0002)
    ocrBlocks.js      deterministic OCR block cleanup (ADR 0001): cleanOcrText
    ollamaOcr.js      the only OCR engine (ADR 0002): local Ollama glm-ocr —
                      detectOllama, ollamaOcrCanvas, sanitizeOcrText (thin
                      delegate to cleanOcrText)
    ocrFormat.js      GLM post-processing: formatOcrMarkdown (page-structure
                      Markdown), stripMarkdownFences; glmChat lives in
                      translation.js
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

Two exporters in `pdfExporter.js`, chosen by an explicit strategy on
`exportPdf(..., { mode })`:

- **Visual/raster** (`exportVisualPdf`): snapshots rendered canvases; preferred
  when fidelity to appearance matters most. This is the **"auto" default**:
  visual-first, falling back to vector on error. Compression
  (`compressPdfToTarget`) iterates raster quality until the size target is met.
- **Vector** (`exportVectorPdf`): keeps real text by whiteouting original runs
  with sampled colors and re-drawing editable text with pdf-lib + fontkit.
  Request with `mode: "vector"` when selectable text matters more than raster
  fidelity. Font resolution is the hoisted 3-tier `resolveFont` (embedded →
  custom TTF → std-14).

Tool pages (`src/pages/Tools.jsx`) all follow the same shape: `FileDropper` → tool-specific `handleX` calling `lib` → `downloadBytes`. Reuse `DropZone`/`FileDropper` and `react-hot-toast` for feedback instead of new UI per tool.

## Build gotchas (do not "simplify" these)

- `vite.config.js`: `optimizeDeps.exclude: ['pdfjs-dist']`, `worker.format: 'es'`, `codeSplitting` groups for `pdf-lib`/`pdfjs` (Vite 8/rolldown replaced `manualChunks` — do not revert), and COOP/COEP headers on the dev server. Removing any of these breaks pdfjs workers. The COOP/COEP headers were load-bearing for tesseract.js (now removed, ADR 0002); they are deliberately kept — removing them is a separate follow-up.
- OCR requires a local Ollama server with the glm-ocr model (ADR 0002). There is no fallback engine: `ocrPage` throws `OcrUnavailableError` when detection fails, and the UI surfaces it as one actionable toast. The rest of the editor works without Ollama.
- Font fidelity: `index.html` loads Noto Sans/Serif, Lato, Merriweather as visual substitutes for embedded PDF fonts; `classifyFont` maps embedded fonts onto these families. A new substitute family must be added in both places.

## Conventions

- CSS Modules per component + `styles/globals.css` tokens. No Tailwind, no CSS-in-JS.
- Icons: `lucide-react`. Classes: `clsx`. Tostadas/feedback: `react-hot-toast`.
- Imports are relative (`../lib/...`), even though the `@` alias exists — follow the existing style.
- Components PascalCase `.jsx`; lib files camelCase `.js`; state flows from `usePdfStore` via direct hook subscription.

## Mandatory validation workflow

These rules apply before declaring any code, test, style, configuration, or documentation change complete.

### Playwright MCP gate

- Use the Playwright MCP for every completed change. Do not replace it with a manual browser check or silently skip it.
- Before navigating, prove that the MCP is available with a harmless Playwright operation. Navigation is allowed only after that operation succeeds.
- If the MCP cannot be started or stops responding, keep the validation process active and retry with backoff. Do not declare the change complete, weaken the requirement, or start duplicate browser servers. Continue when the user restarts the MCP or the process blocking it ends.
- Once available, navigate the relevant PdfZero route, exercise the changed behavior when possible, and capture the smallest useful evidence: accessibility snapshot, console result, and screenshot when visual output is involved.
- Report the validation result and any blocker. A blocked Playwright check is an incomplete change, not a passing check.

### Canonical PDF translation fixture

- Always use the resource labeled `[PDF 1]`, whose filename is `pdfcomplete-translate-test.pdf`. Never substitute another PDF or a generated derivative as the source fixture.
- Verify that the source has exactly 31 pages before translating. Translate only pages 2 through 31, inclusive; page 1 must remain outside the translation scope.
- GLM/Z.AI image MCPs do not accept PDF input directly. Do not send the PDF file to an image model. Render pages 2–31 to readable page images first, then send those images to the GLM/Z.AI MCP, one page at a time or as a controlled batch.
- Translate into clear Latin American Spanish. Preserve reading order, headings, tables, lists, footnotes, citations, numbers, units, symbols, and page boundaries. Do not invent, omit, summarize, or reflow source content.
- Keep a page-to-page mapping for all 30 translated pages and retain per-page evidence. If the fixture is unavailable, unreadable, has the wrong page count, or a GLM/Z.AI page call fails, stop claiming success and continue the recovery/retry process instead of silently skipping that page.
- After translation, use Playwright to validate the rendered result for pages 2–31 and use GLM/Z.AI for a final language/content pass. The run passes only when every requested page has evidence and no unresolved page-level finding remains.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `zademy/PdfZero` (always `-R zademy/PdfZero`; this clone also has an upstream remote). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), label = role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
