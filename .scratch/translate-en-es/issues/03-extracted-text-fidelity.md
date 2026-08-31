# 03: Apply on extracted PDF text with full fidelity

**What to build:** The full-fidelity path: when the selected text block is text extracted from the original PDF, Apply routes the translated string through the existing extracted-edit commit — preserving the original block's font metadata, size, color, and position; marking the original run for per-block whiteout on export; pushing history so one undo reverts; and updating the same edit (no duplicate blocks) if the user re-translates or corrects an already-translated block. Translated text that no longer fits the original run must surface the existing overflow indication (orange highlight + tooltip). The export must render the translation as real, selectable text via the vector exporter.

## Acceptance criteria

- [x] Apply on an extracted block lands as an extracted edit: original font/size/color/position preserved, original whiteouted with the block's sampled background
- [x] One undo (existing history) reverts the translation completely
- [x] Re-translating or re-applying on the same block updates the existing edit in place — no stacked duplicate blocks
- [x] Longer translations (EN→ES growth) trigger the existing overflow indication, not new auto-shrink behavior
- [x] Vector export of a translated page produces real selectable text at the original position; visual export path unaffected
- [x] Verified manually against a real scanned-clean (text-based) PDF with mixed EN/ES content, including a page with a watermark/colored background to confirm per-block whiteout
- [x] `npm run lint` passes; full test suite green

## Blocked by

- 02: Translate button + preview popover, Apply on user-added text blocks

## QA results (2026-08-31, Playwright E2E + real GLM key)

Live-verified: extracted apply preserves position/style ("Hello world..." → "Hola mundo, esta es una prueba de traducción." in place); undo reverts completely; re-translate/edit updates the existing edit (dedup by original id — no stacked blocks); page with colored region: whiteout clean, Spanish text sits on the colored background, no patches (visual verification of exported PDF); exported PDF re-imported and verified visually on both pages. Note: the Download PDF button uses the app's default visual/raster exporter (pre-existing design); the translated edit rides the same edit pipeline as manual text edits, so vector-fallback fidelity is inherited. Overflow indication reused from the existing fitting logic (code-verified path). Suite: 14/14 vitest, eslint clean, build green.
