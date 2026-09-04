# AGENTS.md — PdfZero

Browser-only PDF editor: every operation (render, edit, OCR, export, encrypt) runs client-side; no uploads, no backend. React 19 + Vite, plain JavaScript (JSX), no TypeScript.

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
    ocrscanner/       MarkdownEditor (mdxeditor wrapper: plugin set, custom
                      search addon, data-URL image uploads, dark theming) and
                      OcrScannerWorkspace (run → editor → archive panel)
    layout/           Navbar
    ui/               DropZone (editor file-input), FileDropper + ActionBtn
                      (shared Tools drop-area/action-button; Tools.module.css
                      composes their styles)
  lib/                pure logic, no React (see two-engine rule)
    pdfRenderer.js    pdfjs: loadPdf, renderPage, renderThumbnail, classifyFont
    pdfExporter.js    pdf-lib: exportPdf, merge/split/rotate/watermark, page ops,
                      downloadBytes, compress (iterative raster to target size),
                      encryptPDF via @pdfsmaller/pdf-encrypt
    pdfDecrypt.js     the inverse of protect: decryptPdf removes the Standard
                      security handler for real (AES-256/AESV3 via U/UE + O/OE,
                      AESV2, RC4 40/128); throws PasswordRequiredError when an
                      open password is needed
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
    ocrDocument.js    OCR document assembly: assembleOcrDocument (page
                      headings + thematic breaks + fallback notes),
                      formatWithRetry ×3, deriveFallbackTitle
    ocrDocumentStore.js  archive persistence: IndexedDB store + in-memory
                      twin (list/get/save/remove, save = upsert, newest-first)
    ocrTitles.js      generateSpanishTitle over glmChat (injectable client):
                      short Spanish title, derived-title fallback, never empty
    markdownText.js   markdownToPlainText for the scanner's .txt export
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

Tool pages (`src/pages/Tools.jsx`) all follow the same shape: `FileDropper` → tool-specific `handleX` calling `lib` → `ActionBtn`/`downloadBytes`. Reuse `DropZone`/`FileDropper`/`ActionBtn` (all in `components/ui/`) and `react-hot-toast` for feedback instead of new UI per tool.

## OCR Scanner workspace (Tools screen, spec #6)

The scanner is a two-zone document workspace, NOT the simple tool shape above:

- **Run flow**: `ocrPage(p, { format: false })` per page (recognition only) → `formatWithRetry(raw, formatOcrMarkdown)` (3 attempts) → `assembleOcrDocument` (page headings + thematic breaks + Spanish fallback notes + `partialFormat` flag). Every run creates a NEW OCR document (glossary term, `CONTEXT.md`).
- **Editor**: `@mdxeditor/editor` v4 behind `components/ocrscanner/MarkdownEditor.jsx`. The `markdown` prop is INITIAL-ONLY — content swaps go through the imperative ref (`setMarkdown`); `onChange` feeds only the autosave (~1s debounce, flushed on document switch and unmount). v4 quirks (load-bearing): MDXEditor drops React `children` — mount custom UI via a plugin publishing to `addComposerChild$`; `searchPlugin` ships the engine (`useEditorSearch`) but NO UI — the search box is our `SearchAddon`. Images embed as data URLs (FileReader), never uploaded. Dark theming lives in `mdxEditorTheme.css` (radix portals require `:root` scale overrides).
- **Archive** (#9): `ocrDocumentStore` seam (IndexedDB; in-memory twin for tests). History panel: newest-first, click reopens via `store.get(id)` (never a stale list snapshot), trash deletes, title input is always editable. Race rules: any async write-back must carry `mdRef.current`, and a pending autosave is flushed before switching/unmounting.
- **Spanish titles** (#10): provisional `deriveFallbackTitle` instantly, then `generateSpanishTitle` upgrades it in place — guarded by `titleEditedRef` + current-id check so a manual rename is never overwritten.
- **Layout contract (user-mandated)**: run controls stay a centered ~560px column like every other tool; the shell expands to full width only for the editor + panel zone (compact until an open document or archive entries exist); the panel is a compact ~220px right column, stacking below 640px only.
- **GLM-key gate**: without `VITE_GLM_API_KEY` the scanner disables Run OCR with a configuration alert. This is a deliberate product divergence from the PDF editor's page-level OCR (which stays key-optional) and does not weaken ADR 0002, which governs the recognition engine.

## Build gotchas (do not "simplify" these)

- `vite.config.js`: `optimizeDeps.exclude: ['pdfjs-dist']`, `worker.format: 'es'`, `codeSplitting` groups for `pdf-lib`/`pdfjs`/`mdxeditor` (Vite 8/rolldown replaced `manualChunks` — do not revert), and COOP/COEP headers on the dev server. Removing any of these breaks pdfjs workers. The COOP/COEP headers were load-bearing for tesseract.js (now removed, ADR 0002); they are deliberately kept — removing them is a separate follow-up. The OCR workspace is `React.lazy`-loaded from Tools so the heavy mdxeditor chunk (~490 KB gz) stays off the initial Tools load.
- OCR requires a local Ollama server with the glm-ocr model (ADR 0002). There is no fallback engine: `ocrPage` throws `OcrUnavailableError` when detection fails, and the UI surfaces it as one actionable toast. The rest of the editor works without Ollama.
- Font fidelity: `index.html` loads Noto Sans/Serif, Lato, Merriweather as visual substitutes for embedded PDF fonts; `classifyFont` maps embedded fonts onto these families. A new substitute family must be added in both places.

## Conventions

- CSS Modules per component + `styles/globals.css` tokens. No Tailwind, no CSS-in-JS.
- Icons: `lucide-react`. Classes: `clsx`. Tostadas/feedback: `react-hot-toast`.
- Imports are relative (`../lib/...`), even though the `@` alias exists — follow the existing style.
- Components PascalCase `.jsx`; lib files camelCase `.js`; state flows from `usePdfStore` via direct hook subscription.

## Mandatory validation workflow (per module)

Validation rules are scoped per module. Each module below declares its own checks; apply them only when the change touches that module. Modules whose test rules are still pending rely only on the global Commands section (lint/tests). Add new modules as new `### <Module> module` sections — never apply one module's rules to another.

Module index:

| Module | Route(s) | Test profile |
| --- | --- | --- |
| Editor (PDF editing) | `/editor` | Playwright MCP gate + canonical PDF translation fixture (defined below) |
| Tools (individual PDF tools) | `/tools`, `/tools/:toolId` | Playwright MCP gate + per-tool byte-verification recipes (defined below) |
| OCR Scanner | `/tools` (scanner workspace) | Pending — to be defined |
| Landing & shell | `/` | Pending — to be defined |

### Editor module (PDF editing)

Scope: the editing functionality — the `/editor` route (`src/pages/Editor.jsx`), `src/components/editor/`, the editing model in `src/store/pdfStore.js`, and `src/lib/pdfRenderer.js` / `src/lib/pdfExporter.js` / `src/lib/pdfTextLayout.js` when the change affects editing behavior.

These rules apply before declaring any code, test, style, configuration, or documentation change in this module complete.

#### Playwright MCP gate

- Use the Playwright MCP for every completed change. Do not replace it with a manual browser check or silently skip it.
- Before navigating, prove that the MCP is available with a harmless Playwright operation. Navigation is allowed only after that operation succeeds.
- If the MCP cannot be started or stops responding, keep the validation process active and retry with backoff. Do not declare the change complete, weaken the requirement, or start duplicate browser servers. Continue when the user restarts the MCP or the process blocking it ends.
- Once available, navigate the relevant PdfZero route, exercise the changed behavior when possible, and capture the smallest useful evidence: accessibility snapshot, console result, and screenshot when visual output is involved.
- Report the validation result and any blocker. A blocked Playwright check is an incomplete change, not a passing check.

#### Canonical PDF translation fixture

- Always use the resource labeled `[PDF 1]`, whose filename is `pdfcomplete-translate-test.pdf`. Never substitute another PDF or a generated derivative as the source fixture.
- Verify that the source has exactly 31 pages before translating. Translate only pages 2 through 31, inclusive; page 1 must remain outside the translation scope.
- GLM/Z.AI image MCPs do not accept PDF input directly. Do not send the PDF file to an image model. Render pages 2–31 to readable page images first, then send those images to the GLM/Z.AI MCP, one page at a time or as a controlled batch.
- Translate into clear Latin American Spanish. Preserve reading order, headings, tables, lists, footnotes, citations, numbers, units, symbols, and page boundaries. Do not invent, omit, summarize, or reflow source content.
- Keep a page-to-page mapping for all 30 translated pages and retain per-page evidence. If the fixture is unavailable, unreadable, has the wrong page count, or a GLM/Z.AI page call fails, stop claiming success and continue the recovery/retry process instead of silently skipping that page.
- After translation, use Playwright to validate the rendered result for pages 2–31 and use GLM/Z.AI for a final language/content pass. The run passes only when every requested page has evidence and no unresolved page-level finding remains.

### Tools module (individual PDF tools)

Scope: the tool pages — `/tools` and `/tools/:toolId` (`src/pages/Tools.jsx`), the shared drop-area/action-button UI (`src/components/ui/` — `FileDropper`, `ActionBtn`, `DropZone`), and `src/lib/pdfExporter.js` / `src/lib/pdfDecrypt.js` / `src/lib/markdownText.js` when the change affects tool operations (merge, split, rotate, watermark, compress, encrypt, decrypt, downloads).

#### Playwright MCP gate

Same gate as the Editor module: prove the Playwright MCP is available before navigating, exercise the changed tool, capture snapshot/console/screenshot evidence, and never declare a change complete with a blocked Playwright check. `npm run dev` must be serving `localhost:5173`.

#### Fixtures

All fixtures live in `.playwright-mcp/`:

- `pdfcomplete-translate-test.pdf` — the canonical 31-page PDF (`[PDF 1]`, shared with the Editor module). Use for merge/split/extract/compress/watermark coverage over many pages.
- `pdfzero-translate-test.pdf` — 2-page scanned PDF (no extractable text). Use for rotate/reorder/protect (small, fast).
- `owner-locked.pdf` / open-password variants — generated on demand with `@pdfsmaller/pdf-encrypt` (see Unlock recipe). Never commit them.

#### Route reality

`/tools/:toolId` deep-links (fixed 2026-09-04): `Tools.jsx` reads `useParams().toolId` and activates the tool on mount/param change; clicking a tool syncs the URL via `navigate(`/tools/${id}`, { replace: true })`, and the "All tools" back button returns to `/tools`. An invalid id falls back to the card grid. Both entry paths (direct URL and sidebar/card click) are valid test routes.

#### Per-tool recipes

Every recipe: upload via the `FileDropper` (click triggers a file chooser → `browser_file_upload` with absolute fixture paths; downloads land in `.playwright-mcp/`), then verify the DOWNLOADED FILE CONTENT with Node — never trust the success toast alone:

| Tool | Actions | Pass criteria (verify output bytes) |
| --- | --- | --- |
| Merge | upload both fixtures → "Merge 2 PDFs" | `PDFDocument.load` → 33 pages (31+2) |
| Split (by range) | upload merged/31p → From 1 To 5 → Split | part has exactly 5 pages |
| Split (every N) | same file → every 16 → Split | 3 parts: 16+16+1 |
| Extract | upload 33p → "1, 3, 5-8" | 6 pages |
| Reorder | upload 2p fixture → drag page 1 onto page 2 → Save | content-stream hashes of output == reversed hashes of input |
| Rotate | upload 2p → choose 180° → Rotate | `page.getRotation().angle` == +180 on all pages |
| Compress (lossless) | upload 31p → "Lossless Compress" | pages == 31, size ≤ original |
| Compress (target) | upload 2p (55 KB) → target 30 → "Compress below 30 KB" | size ≤ 30 KB, pages == 2 |
| Watermark | upload 31p (text CONFIDENTIAL, defaults) → Apply | pdfjs `getTextContent` page 1/2/31 contains CONFIDENTIAL; live preview renders |
| Protect | upload 2p → open pw → Protect | `PDFDocument.load` without `ignoreEncryption` throws encrypted-error |
| Unlock | upload owner-locked fixture → Remove Restrictions | output loads WITHOUT `ignoreEncryption` (`/Encrypt` fully removed) |
| Unlock (pw) | upload open-pw PDF, no pw → expect error toast; with pw → success | toast "needs its open password" / output loads clean |
| Redact | (redirect tool) click "Open PDF Editor" | URL becomes `/editor`, 0 console errors |

Verification snippets live in the session record; the core pattern is:

```bash
node --input-type=module -e "
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
const doc = await PDFDocument.load(fs.readFileSync('.playwright-mcp/<output>.pdf'));
console.log(doc.getPageCount());
"
```

#### Unlock fixtures generation

```bash
node --input-type=module -e "
import fs from 'fs';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
const bytes = new Uint8Array(fs.readFileSync('.playwright-mcp/pdfzero-translate-test.pdf'));
const enc = await encryptPDF(bytes, '', { ownerPassword: 'owner999', algorithm: 'AES-256' });
fs.writeFileSync('.playwright-mcp/owner-locked.pdf', enc instanceof Uint8Array ? enc : new Uint8Array(enc));
"
```

Swap `''` for a real password (and keep it) to build open-password fixtures.

#### Baseline (2026-09-04 run)

All 12 tools passed E2E. One real bug found and fixed in that pass: Unlock used `PDFDocument.load(..., { ignoreEncryption: true })` + `save()` — that re-serializes the file keeping `/Encrypt` and ciphertext (false success; restrictions survived). Fixed by `src/lib/pdfDecrypt.js` (real Standard-handler decryption: AES-256/AESV3 via U/UE + O/OE, AESV2, RC4 40/128; primitives re-imported from `@pdfsmaller/pdf-encrypt`, no new dependency) + optional open-password input in `UnlockTool`. Unit tests: `src/lib/pdfDecrypt.test.js` (6). If you touch `pdfDecrypt.js` or the Unlock tool, re-run its unit tests AND the two Unlock recipes above.

### OCR Scanner module

Scope: the scanner workspace — `src/components/ocrscanner/` (`OcrScannerWorkspace`, `MarkdownEditor`) and the OCR lib chain (`ocrPipeline.js`, `ocrBlocks.js`, `ollamaOcr.js`, `ocrFormat.js`, `ocrDocument.js`, `ocrDocumentStore.js`, `ocrTitles.js`, `translation.js`).

Test rules: pending. Until defined, changes in this module validate with the global Commands section (lint/tests) only.

### Landing & shell module

Scope: the landing page and app shell — `/` (`src/pages/Landing.jsx`), `src/components/layout/Navbar`, routing in `src/App.jsx` / `src/main.jsx`, and global styling (`src/styles/globals.css`).

Test rules: pending. Until defined, changes in this module validate with the global Commands section (lint/tests) only.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `zademy/PdfZero` (always `-R zademy/PdfZero`; this clone also has an upstream remote). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), label = role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
