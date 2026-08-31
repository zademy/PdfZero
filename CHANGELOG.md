# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Fork note: this is the changelog of the community fork
[zademy/PdfZero](https://github.com/zademy/PdfZero). It starts at the fork point
from [bevinkatti/PdfZero](https://github.com/bevinkatti/PdfZero) (`3ec1000`,
2026-06-25) — earlier history lives in the upstream repository.

## [Unreleased]

### Added — 2026-08-31

- **AI page translation (English ↔ Spanish)** — page-level contextual translation from the
  editor toolbar: whole-page context in one request, consistent terminology across segments,
  per-segment character budgets, and width-fitted re-layout so translated text stays inside
  the original boxes (`src/lib/translation.js`).
- Translation settings tuned to **GLM-5.3-Flash** documented defaults (thinking enabled,
  low reasoning effort, temperature 1 / top_p 0.95).
- `.env.example` documenting the opt-in `VITE_GLM_API_KEY` for translation.
- Regression tests for the translation client (`src/lib/translation.test.js`).

### Changed — 2026-08-31

- Prettier is now the canonical formatter; the codebase was normalized (`.prettierrc.json`).

### Fixed — 2026-08-31

- Translation QA findings: segment separator bug, "echo" responses retried correctly,
  and mobile clamp for translated text.

### Removed — 2026-08-31

- Per-block translate popup UI — superseded by the page-level translate toolbar action.

### Changed — 2026-08-08

- Improved clarity of PDF editing behavior.

### Fixed — 2026-07-10

- PDF editing accuracy and export behavior (edge-case pages).

### Changed — 2026-07-01 — "PDFZero V2"

- Improved text layout and line/run geometry.
- Improved export fidelity: edited text lands closer to the original glyphs.
- Per-block background color detection — watermarks and colored regions no longer
  break whiteouts on export.

[Unreleased]: https://github.com/zademy/PdfZero/compare/3ec1000...HEAD
