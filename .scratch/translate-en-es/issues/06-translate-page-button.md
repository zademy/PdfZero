# 06: Translate page toolbar button + end-to-end wiring

**What to build:** The visible feature: a Translate page button (Languages icon, aiBtn style) next to OCR / AI fix in the top toolbar. Click → gathers the current page's blocks (store extracted items + user-added/committed overlay texts) in reading order with budgets → calls the batch seam → applies via the store batch action → toast "N blocks translated — Ctrl+Z to undo" (or partial-failure wording with the skipped count). Loading state on the button; friendly missing-key/empty-page/service errors; popup per-block UI already removed.

## Acceptance criteria

- [x] Button visible with file loaded, disabled while translating, spinner + "Translating page…"
- [x] Whole page translated in one click; positions/styles preserved; one Ctrl+Z reverts everything
- [x] Multi-box sentences come back coherent (context evidence: praise-page capture translates as one piece)
- [x] Translations respect char budgets; residual overflow shows the existing orange indicator
- [x] Already-edited/user-added blocks included and updated in place
- [x] Missing key / empty page / service failure → distinct friendly messages
- [x] Partial fallback path exercised (a skipped id translated individually or reported)
- [x] eslint clean, full vitest suite green, build green; manual verification in dev server documented here

## Blocked by

- 04: translatePage batch function (lib) + tests
- 05: Store batch apply with single history entry + extracted items in store

## QA results (2026-08-31, Playwright E2E + real GLM key, AI Engineering book p.2)

Live-verified: 18-block praise page translated in ONE click as a coherent whole — the multi-box quote from the evidence capture ("This book offers... —Vittorio Cretella") now translates across its 3 boxes with no EN/ES mixing; single Ctrl+Z reverts the page; re-run updates in place. Three defects found & fixed during QA: (1) operator-list color heuristic misassigned white to the praise text → invisible translation; fixed with a near-white-text-on-light-page → black sanitize. (2) Split headings collided: Spanish wider than the box overran the same-line neighbor; fixed with geometry-based char budgets (box width ÷ average advance) replacing length ×1.25. (3) The model can still exceed short budgets → added a programmatic condense pass (condenseTranslations, unit-tested) that shortens over-budget segments; final heading renders "Elogios a Ing. de IA" as two clean non-overlapping boxes (vision-verified). Suite: 31/31 vitest, eslint clean, build green.

## QA addendum — right-margin fitting (captures/02-Evidencia.png)

User evidence: one long translated line escaped the page's right margin (~2cm into the border). Root cause: char-count budgets estimate, but real accented-Spanish glyph runs measure wider. Fix: measureText validation on an offscreen canvas with each block's actual font — every translation whose REAL rendered width exceeds its box gets one condense pass with a back-solved char budget (boxWidth/measured × len × 0.97). E2E re-verified on the same page: 0 overflows past the canvas edge (max overlay right 1076 vs page right 1233), vision-confirmed no text in the gray border, no overlapping layers.
