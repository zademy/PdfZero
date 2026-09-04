![cover](public/demos/cover.png)

# 📄 PDFZero - Free Open-Source PDF Editor

> [!WARNING]
> **This is a community fork.** PDFZero was originally created by **[@bevinkatti](https://github.com/bevinkatti)** —
> [bevinkatti/PdfZero](https://github.com/bevinkatti/PdfZero) (MIT License). All credit for the original idea,
> implementation, and design belongs to him.
>
> Since the upstream repository is no longer actively maintained, this fork carries the project forward with
> bug fixes, editing-fidelity improvements, and new features (including a full OCR Scanner workspace and
> AI-powered EN↔ES page translation — see [What's new in this fork](#whats-new-in-this-fork)). Please open
> issues and PRs **here**, not upstream.

> Edit PDFs without uploading anywhere. No task limits. No sign-up. Free.

[![Fork of bevinkatti/PdfZero](https://img.shields.io/badge/fork%20of-bevinkatti%2FPDFZero-yellow?logo=github)](https://github.com/bevinkatti/PdfZero)
[![Open Source](https://img.shields.io/badge/open%20source-yes-brightgreen)](<>)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Privacy First](https://img.shields.io/badge/privacy-100%25%20local-success)](<>)
[![Offline Ready](https://img.shields.io/badge/offline-ready-blueviolet)](<>)
[![Built with React](https://img.shields.io/badge/built%20with-React-61DAFB?logo=react&logoColor=white)](<>)
[![PDF.js](https://img.shields.io/badge/PDF.js-Mozilla-orange)](<>)
[![pdf-lib](https://img.shields.io/badge/pdf--lib-core-red)](<>)
[![Tests](https://img.shields.io/badge/tests-Vitest-green)](<>)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-pink.svg)](<>)

---

## Why PDFZero?

Many PDF tools charge monthly, cap file sizes, or limit what you can do on free plans. PDFZero keeps the core workflow simple: edit locally, keep your files on-device, and use the important tools without a paywall.

## Demo

![demo](public/demos/demo.gif)

## 🌐 Try PDFZero Live

🔗 **https://pdfzero-editor.vercel.app** — original project's deployment (base app).
Edit, organize, secure, and optimize PDFs directly in your browser - all FREE while keeping your files on your device.

---

---

| Feature                | Other PDF tools                       | **PDFZero**            |
| ---------------------- | ------------------------------------- | ---------------------- |
| Edit existing PDF text | Often paid or limited                 | **Free**               |
| File size limits       | Often capped                          | **No file size limit** |
| Daily task limits      | Free plans may stop after a few tasks | **No task limits**     |
| File privacy           | Files may be uploaded to a server     | **100% local**         |
| Offline use            | Usually browser or cloud-based        | **Works offline**      |
| Open source            | Rare                                  | **MIT**                |
| OCR for scanned PDFs   | Often paid                            | **Free**               |
| e-Sign PDFs            | Often paid                            | **Free**               |
| Translate PDFs         | Often paid                            | **Free (AI, opt-in)**  |
| Cost                   | Many plans charge monthly             | **Free**               |

---

## Features

### Edit

- **Edit existing PDF text** - click any text block, edit in-place, and auto-detect the original font
- Add new text boxes anywhere on the page
- Change font family, size, color, bold, and italic
- Add images and place them anywhere on the page
- Sign documents with a signature pad

### Translate

- **AI page translation (English ↔ Spanish)** - one click from the editor toolbar translates the whole page in context, keeping terminology consistent across text blocks
- Translated text is re-fitted to the original text-box geometry (measured widths, character budgets) so the page layout survives translation
- Powered by [GLM-5.3-Flash](https://docs.z.ai/) via the Z.AI API — **opt-in** and requires your own API key (see [Getting Started](#getting-started))

### Organize

- Merge multiple PDFs with drag-to-reorder
- Split PDF by page range
- Reorder pages via drag-and-drop
- Rotate individual pages
- Extract specific pages

### Optimize

- Compress PDF with browser-native object stream compression
- Target-size compression with iterative quality reduction
- PDF/A compliance check

### Secure

- Password protect with AES-256
- Remove existing passwords
- Redact sensitive content permanently
- Add text or image watermarks with live preview, tiling, and page targeting

### Smart

- **OCR Scanner workspace** — run OCR on scanned PDFs and the result opens in a rich markdown editor (tables, lists, code blocks preserved) instead of a text dump; automatic Spanish titles, a persistent document archive (IndexedDB) with reopen/delete, ~1s autosave, and .md/.txt export
- OCR for scanned and image PDFs with a local Ollama `glm-ocr` model, running 100% on your machine (page-level OCR also available inside the editor)
- AI font matching to keep text edits visually consistent
- Per-block background color sampling so edits and whiteouts blend into watermarked or colored pages

---

## Tech Stack

| Library                                     | Purpose                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| [pdf-lib](https://pdf-lib.js.org/)          | PDF creation, modification, export                         |
| [PDF.js](https://mozilla.github.io/pdf.js/) | PDF rendering and text extraction                          |
| [Ollama](https://ollama.com/) + `glm-ocr`   | OCR recognition, 100% local                                |
| [GLM-5.3-Flash (Z.AI)](https://docs.z.ai/)  | OCR formatting, Spanish titles, EN↔ES translation (opt-in) |
| [@mdxeditor/editor](https://mdxeditor.dev/) | Markdown editing in the OCR Scanner                        |
| [React](https://react.dev/)                 | UI framework                                               |
| [Zustand](https://zustand-demo.pmnd.rs/)    | State management                                           |
| [Vite](https://vitejs.dev/)                 | Build tool                                                 |

**All PDF processing is 100% browser-native — your files never leave your device.** OCR recognition runs on your own machine via a local Ollama server. The only network features are the opt-in GLM ones (OCR formatting/titles in the Scanner, page translation), which send text snippets to the Z.AI API using your own key. Everything else works offline.

---

## Getting Started

```bash
git clone https://github.com/zademy/PdfZero.git
cd PdfZero
npm install

# Optional — enable the GLM features (OCR formatting, Spanish titles, EN↔ES translation)
cp .env.example .env.local
# then set VITE_GLM_API_KEY in .env.local (https://z.ai/manage-apikey/apikey-list)

# Optional — enable OCR recognition (local Ollama + glm-ocr model)
# install Ollama from https://ollama.com, then:
ollama pull glm-ocr

npm run dev      # Vite dev server
npm run build    # production build
npm test         # Vitest unit tests (src/lib/*.test.js)
npm run lint     # ESLint
```

> The dev server serves COOP/COEP headers configured in `vite.config.js` — kept deliberately (they were load-bearing for the previous OCR engine); don't remove them.
>
> Without `VITE_GLM_API_KEY`, the OCR Scanner disables Run OCR with a configuration alert; without Ollama, OCR surfaces one actionable setup toast. Everything else in the app works without either.

---

## Architecture

```text
src/
  components/
    editor/          # PdfCanvas, PageThumbnails, TextBlock, AnnotationLayer, Toolbars
    ocrscanner/      # OCR Scanner workspace: markdown editor + archive panel
    layout/          # Navbar
    ui/              # DropZone, FileDropper, ActionBtn (shared components)
  lib/               # pure logic, no React
    pdfRenderer.js   # PDF.js wrapper — render pages, extract text, classify fonts
    pdfExporter.js   # pdf-lib wrapper — export, merge, split, compress, watermark, encrypt
    pdfTextLayout.js # text geometry: lines, runs, glyph fitting for overlays/exports
    ocrPipeline.js   # OCR flow: render → Ollama glm-ocr → block cleanup → GLM formatting
    ollamaOcr.js     # the only OCR engine: local Ollama glm-ocr (ADR 0002)
    ocrBlocks.js     # deterministic OCR block cleanup (ADR 0001)
    ocrFormat.js     # GLM page-structure Markdown formatting
    ocrDocument.js   # document assembly, formatting retries, fallback titles
    ocrDocumentStore.js # OCR document archive over IndexedDB
    ocrTitles.js     # automatic Spanish titles (GLM, with derived fallback)
    markdownText.js  # markdown → plain text for .txt export
    translation.js   # GLM chat/translation client (EN↔ES), pure functions + tests
  pages/
    Landing.jsx      # Marketing landing page
    Editor.jsx       # Main PDF editor
    Tools.jsx        # Individual tool UIs
  store/
    pdfStore.js      # Zustand global state
  styles/
    globals.css      # Design system tokens
```

### Text editing architecture

PDFZero uses a layered, non-destructive editing model:

```text
PDF bytes
  -> PDF.js render + text extraction
  -> canonical text run metadata
  -> browser overlay editor
  -> layout-fit/export planner
  -> pdf-lib browser export
  -> future PDFium/MuPDF advanced engine
```

Current browser path:

1. **Render** - PDF.js renders each page to a high-resolution canvas.
2. **Extract** - PDF.js extracts text runs, transforms, font ids, approximate font names, color, baseline, ascent/descent, and edit boxes.
3. **Model** - PDFZero stores original run metadata: text, bbox, baseline, font fallback, color, line height, estimated glyph advances, and max edit dimensions.
4. **Overlay** - Editable DOM text is positioned over the PDF raster and uses local background sampling to hide the original text while editing.
5. **Fit** - On export, edited text is laid out line-by-line and fit back to the original run width using conservative character spacing and small size adjustment.
6. **Export** - pdf-lib writes background patches, replacement text, annotations, page operations, and document tools.

This is not yet full Acrobat/Foxit-style object editing. The current path is an overlay-and-repair browser exporter. The production-grade target is an advanced engine that can inspect and rewrite PDF page objects directly:

```text
src/pdf/
  engines/
    pdfjsEngine.ts       # Browser render/extract fallback
    pdfiumEngine.ts      # Planned object-level editor
    mupdfEngine.ts       # Optional native/WASM alternative
  model/
    TextRun.ts           # glyphs, fonts, colors, matrices, resources
    FontResource.ts
    EditOperation.ts
  layout/
    glyphMetrics.ts
    fitText.ts
    paragraphReflow.ts
  background/
    renderWithoutText.ts
    inpaintPatch.ts
  export/
    exportPlanner.ts
    pdfLibOverlayExporter.ts
    objectRewriteExporter.ts
  repair/
    visualDiff.ts
    autoFitRepair.ts
```

The browser-only implementation can be excellent for simple and moderately complex PDFs. True high-level editing for embedded subset fonts, object removal, kerning-preserving replacement, complex scripts, and image/gradient background reconstruction requires PDFium, MuPDF, or another real PDF content engine.

---

## What's new in this fork

Changes on top of the original [bevinkatti/PdfZero](https://github.com/bevinkatti/PdfZero):

- **OCR Scanner workspace** — scanned PDFs become editable markdown documents: per-page GLM formatting with 3x retries, rich markdown editor (full toolbar, rich↔source toggle, search & replace, inline data-URL images), automatic Spanish titles, persistent IndexedDB archive with ~1s autosave, and .md/.txt export.
- **Local-first OCR engine swap** — Tesseract.js replaced by a local Ollama `glm-ocr` model (ADR 0002): better recognition on scanned documents while staying 100% on your machine, with deterministic block cleanup upstream of formatting (ADR 0001).
- **AI page translation (EN↔ES)** — page-level contextual translation from the editor toolbar, with GLM-5.3-Flash, segment budgets, echo-retry parsing, and width-fitted re-layout so translated text stays inside the original boxes.
- **V2 text layout & export fidelity** — improved line/run geometry, per-block background color detection (watermarks and colored regions no longer break whiteouts), and more accurate export placement.
- **Editing accuracy fixes** — corrected color detection heuristics and export behavior for edge-case pages.
- **Translation regression tests** — `src/lib/translation.test.js` (Vitest) covering separators, retries, and budget fitting.

See [CHANGELOG.md](CHANGELOG.md) for details, and the
[commit history](https://github.com/zademy/PdfZero/commits) for everything else.

---

## Roadmap

- [x] PDF rendering and text extraction overlay
- [x] Add new text boxes
- [x] Drag-and-drop text positioning
- [x] Annotations (highlight, redact, shapes)
- [x] Merge, split, compress tools
- [x] Watermark, rotate, page management
- [x] Preserve richer original text-run metadata for export fitting
- [x] Fit edited text back to the original run width during pdf-lib export
- [x] OCR text extraction via local Ollama glm-ocr
- [x] OCR Scanner workspace: markdown editor, archive, Spanish titles
- [x] e-Sign with canvas signature pad
- [x] Add images to pages
- [x] AI page translation (EN↔ES) with box-fitted layout
- [ ] **v1.2** - OCR searchable text layer embedded into the PDF (today OCR exports extracted text)
- [ ] **v1.2** - Visual export diff for edited regions
- [ ] **v1.2** - Packaged fallback font registry with width-vector matching
- [ ] **v1.2** - Image replace/remove in the editor
- [ ] **v1.2** - Paragraph grouping and multi-line reflow
- [ ] **v1.3** - PDF to Word/DOCX export
- [ ] **v1.3** - Form filling and flattening
- [ ] **v1.3** - Batch processing
- [ ] **Advanced** - PDFium/MuPDF object-level text replacement
- [ ] **Advanced** - Embedded font reuse and kerning-preserving export
- [ ] **Advanced** - Background reconstruction by rendering pages with target text objects removed

---

## Contributing

PRs are very welcome — against **this fork**. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) first, open an issue for major changes, and
follow our [Code of Conduct](CODE_OF_CONDUCT.md). See also
[SECURITY.md](SECURITY.md) and [SUPPORT.md](SUPPORT.md).

```bash
npm install
npm run dev
npm test
```

---

## Acknowledgments

- **[bevinkatti](https://github.com/bevinkatti)** — original author of PDFZero. This fork exists because of his work.
- The [PDF.js](https://mozilla.github.io/pdf.js/), [pdf-lib](https://pdf-lib.js.org/), and [Ollama](https://ollama.com/) teams.

---

## License

MIT — original project © **bevinkatti**; changes in this fork © [PdfZero contributors](https://github.com/zademy/PdfZero/graphs/contributors).
See [LICENSE](LICENSE).

---

If you find PDFZero useful, consider giving a ⭐ to both [the original](https://github.com/bevinkatti/PdfZero) and this fork.
