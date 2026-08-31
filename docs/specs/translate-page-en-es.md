# Translate page (EN↔ES) in one contextual batch via GLM

## Problem Statement

When I translate a PDF page box by box, each box is translated in isolation. A sentence that spans several text boxes comes back half Spanish and half English, terminology drifts between boxes, and long translations overflow the page edge (Spanish runs ~15–25% longer than English). I want the whole page translated as one coherent piece, with every box keeping its position, style, and size constraints.

## Solution

A **Translate page** button in the top toolbar (next to OCR / AI fix). One click collects every text block on the current page in reading order, sends **a single GLM request** containing all blocks as a JSON array keyed by block id — each with a character budget derived from its original length — and receives an id→translation map. Because the model sees the whole page at once, context, terminology, and proper nouns stay consistent across boxes, and the per-block budget keeps translations within each box's footprint. Translations are applied directly (no per-box preview: unusable at page scale) with **one undo step** reverting the entire page. Blocks the model skips or returns malformed are translated individually via the existing single-block path (or left untouched with a notice). The request sets a generous max-token budget so long pages never truncate mid-translation.

## User Stories

1. As a PDF editor user, I want a Translate page button in the top toolbar, so that I can translate the entire current page in one action.
2. As a PDF editor user, I want all boxes translated in a single request, so that sentences spanning multiple boxes stay coherent.
3. As a PDF editor user, I want terminology and proper nouns consistent across the whole page, so that the translated page reads as one document.
4. As a PDF editor user, I want each translation sized to its box's character budget, so that text no longer runs off the page edge.
5. As a PDF editor user, I want one Ctrl+Z to revert the whole page translation, so that undo stays predictable.
6. As a PDF editor user, I want a loading state on the button while the page translates, so that I know it is working on a long page.
7. As a PDF editor user, I want boxes the model skipped handled gracefully (individual re-translate or left untouched with a count), so that one bad box never blocks the page.
8. As a PDF editor user, I want already-edited or previously translated boxes updated in place, so that re-running page translate never stacks duplicate blocks.
9. As a PDF editor user, I want my own added text boxes included in the page translation, so that annotations translate too.
10. As a PDF editor user, I want blocks that already exceed their budget flagged by the existing overflow indicator, so that residual overflow is visible.
11. As a PDF editor user, I want a summary toast ("N blocks translated — Ctrl+Z to undo"), so that I know what happened and how to revert.
12. As a PDF editor user, I want a friendly error when the key is missing or the service fails, so that I can tell configuration problems from service problems.
13. As a user with a mostly-empty page, I want a "nothing to translate" notice instead of a wasted request, so that the button behaves predictably.
14. As a privacy-conscious user, I want the page text sent only to the GLM endpoint with my local key, so that the browser-only architecture is preserved.

## Implementation Decisions

- **One batch request**: pure lib function `translatePage(blocks)` taking `{ id, text, budget }` entries in reading order (sort by y then x) and returning `{ ok, translations: {id: text} }` or a distinguishable error. System prompt demands a strict JSON object mapping id → translation, no commentary, line breaks preserved, proper nouns kept, each translation ≤ its budget (budget = ceil(originalLength × 1.25)).
- **Generous max-token ceiling** on the request so multi-box pages never truncate mid-output (a truncation observed once with defaults on long text).
- **Validation + fallback**: every id in the response must map to a non-empty string; missing/invalid ids fall back to the existing single-block translate (which includes the echo-retry); blocks that still fail are skipped and counted in the toast.
- **Single history entry**: a store batch action applies all translations (extracted → existing extracted-edit commit semantics; already-edited → update of the same edit; user-added → overlay update) inside one state update with one history push.
- **Extracted items lifted to the store**: the canvas writes the current page's extracted text items into the store so the toolbar handler can assemble the batch without component-tree gymnastics.
- **UI**: aiBtn-style button (Languages icon) next to OCR / AI fix; spinner + "Translating page…" while in flight; applies directly on success. The per-block popup translate UI is removed (superseded).
- **Scope**: current page only; whole-document iteration is a follow-up.
- **Params**: glm-5.2, thinking disabled, non-streaming, temperature 0.2, key from VITE_GLM_API_KEY — same contract as the existing seam, which is reused, not duplicated.

## Testing Decisions

- Lib batch function: Vitest with mocked fetch — request shape (JSON payload, budgets, max tokens), happy path across mixed blocks, partial-response fallback triggers per-block path, malformed JSON error, echo behavior.
- Store batch action: Vitest against the real Zustand store — one history entry for N blocks, dedup on re-translate, mixed block types, undo restores all.
- UI wiring: manual verification in the dev server plus eslint/build; no component-test infrastructure exists.

## Out of Scope

- Whole-document (all pages) translation and progress UI.
- Auto-shrink font for residual overflow (existing orange indicator only).
- Languages beyond EN↔ES; direction pickers.
- Per-block preview popovers at page scale.

## Further Notes

- Evidence motivating this spec: `captures/01-Evidencia.png` — a praise-page quote split across boxes translated half ES / half EN with text running past the page edge.
- Batch prompt asks for JSON, not Markdown: ids make the box→translation mapping exact and unambiguous.
- The single-block seam (translation.js) stays as the fallback path and keeps its 14 tests.
