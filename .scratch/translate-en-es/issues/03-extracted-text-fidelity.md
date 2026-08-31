# 03: Apply on extracted PDF text with full fidelity

**What to build:** The full-fidelity path: when the selected text block is text extracted from the original PDF, Apply routes the translated string through the existing extracted-edit commit — preserving the original block's font metadata, size, color, and position; marking the original run for per-block whiteout on export; pushing history so one undo reverts; and updating the same edit (no duplicate blocks) if the user re-translates or corrects an already-translated block. Translated text that no longer fits the original run must surface the existing overflow indication (orange highlight + tooltip). The export must render the translation as real, selectable text via the vector exporter.

## Acceptance criteria

- [ ] Apply on an extracted block lands as an extracted edit: original font/size/color/position preserved, original whiteouted with the block's sampled background
- [ ] One undo (existing history) reverts the translation completely
- [ ] Re-translating or re-applying on the same block updates the existing edit in place — no stacked duplicate blocks
- [ ] Longer translations (EN→ES growth) trigger the existing overflow indication, not new auto-shrink behavior
- [ ] Vector export of a translated page produces real selectable text at the original position; visual export path unaffected
- [ ] Verified manually against a real scanned-clean (text-based) PDF with mixed EN/ES content, including a page with a watermark/colored background to confirm per-block whiteout
- [ ] `npm run lint` passes; full test suite green

## Blocked by

- 02: Translate button + preview popover, Apply on user-added text blocks
