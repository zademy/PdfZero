# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Fork note: this is the changelog of the community fork
[zademy/PdfZero](https://github.com/zademy/PdfZero). It starts at the fork point
from [bevinkatti/PdfZero](https://github.com/bevinkatti/PdfZero) (`3ec1000`,
2026-06-25) — earlier history lives in the upstream repository.

## [1.1.0] - 2026-09-04

### Changed

- **README refresh** — new screenshots taken from the live app (`docs/images/`:
  landing, tools, editor with a real 31-page PDF), honest feature list, and a
  4-way comparison. Removed stale upstream claims (signature pad, image
  blocks, PDF/A check) and the obsolete roadmap section.
- Version badge in the navbar now renders the `package.json` version at build
  time (`v1.0.0`+) instead of a static "beta" tag.

### Removed

- Outdated demo assets (`public/demos/cover.png`, 5.4 MB `demo.gif`) — replaced
  by `docs/images/` screenshots.

## [1.0.0] - 2026-09-04

First stable release of the fork.

### Added

- **Real PDF decryption (Unlock tool)** — `src/lib/pdfDecrypt.js` removes the
  Standard security handler entirely (AES-256/AESV3 via U/UE + O/OE, AES-128,
  RC4 40/128), reusing `@pdfsmaller/pdf-encrypt` primitives. Optional
  open-password input; `PasswordRequiredError` surfaces an actionable toast.
  6 unit tests + full E2E verification (output loads with strict `pdf-lib`).
- **Full 12-tool E2E battery** — every Tools flow validated via Playwright MCP
  with byte-level output verification (page counts, rotations, watermark text,
  content-stream hashes). Procedures and per-tool recipes documented in
  `AGENTS.md` (Tools module).
- **Release automation** — `.github/workflows/ci.yml` (lint + tests + build on
  PRs) and `release.yml` (on every green push to `main`: tag `vX.Y.Z` from
  `package.json` if not yet released + GitHub Release listing every commit
  since the previous tag, with the built `dist/` zip attached).
- `/tools/:toolId` **deep links** — URL activates the tool directly and stays
  in sync while browsing; invalid ids fall back to the tool grid.
- **OCR Scanner workspace** — scanned PDFs become editable markdown documents:
  per-page GLM formatting with 3× retries, rich markdown editor (toolbar,
  rich↔source toggle, search & replace, inline data-URL images), automatic
  Spanish titles, persistent IndexedDB archive with ~1s autosave, .md/.txt
  export.
- **AI page translation (English ↔ Spanish)** — page-level contextual
  translation from the editor toolbar: whole-page context in one request,
  consistent terminology across segments, per-segment character budgets, and
  width-fitted re-layout so translated text stays inside the original boxes
  (`src/lib/translation.js` + regression tests).
- Translation settings tuned to **GLM-5.3-Flash** documented defaults (thinking
  enabled, low reasoning effort, temperature 1 / top_p 0.95).
- `.env.example` documenting the opt-in `VITE_GLM_API_KEY`.

### Changed

- **Landing page redesign** — the fork's own product identity: animated OCR
  pipeline hero, 12-tool feature grid, OCR Scanner showcase, honest 4-way
  comparison table (PDFZero vs Stirling PDF vs Smallpdf/iLovePDF), English-only
  content, fork-attributed footer (text-only mention, no upstream links).
- **Local-first OCR engine** — Tesseract.js replaced by a local Ollama
  `glm-ocr` model (ADR 0002): better recognition while staying 100% on-device,
  with deterministic block cleanup upstream of formatting (ADR 0001).
- Prettier is the canonical formatter; the codebase was normalized
  (`.prettierrc.json`).

### Fixed

- Unlock false success — `PDFDocument.load({ ignoreEncryption: true }) + save()`
  re-serialized the file keeping `/Encrypt` and ciphertext (restrictions
  survived, toast said success). Replaced by real decryption (see Added).
- Redact tool icon invisible on the dark theme (`#1a1a1a` → `#a0a0ac`), plus a
  sidebar contrast pass (filter pills, count badge, category labels, chevrons).
- Translation QA findings: segment separator bug, "echo" responses retried
  correctly, and mobile clamp for translated text.
- PDF editing accuracy and export behavior for edge-case pages (2026-07-10).
- V2 text layout & export fidelity (2026-07-01): line/run geometry, per-block
  background color detection — watermarks and colored regions no longer break
  whiteouts.

### Removed

- Per-block translate popup UI — superseded by the page-level translate
  toolbar action.
- Tesseract.js OCR engine and its COOP/COEP-dependent setup (headers kept
  deliberately for potential future use).

[1.1.0]: https://github.com/zademy/PdfZero/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/zademy/PdfZero/compare/3ec1000...v1.0.0
