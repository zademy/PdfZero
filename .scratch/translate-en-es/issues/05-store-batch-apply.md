# 05: Store batch apply with single history entry + extracted items in store

**What to build:** Two store pieces: (1) the canvas publishes the current page's extracted text items into the store so any component can assemble a page batch; (2) a batch apply action that writes N translations (extracted, already-edited, user-added) in ONE state update with ONE history push — so a single Ctrl+Z reverts the whole page translation, and re-running page translate updates existing edits in place instead of stacking duplicates.

## Acceptance criteria

- [x] Extracted items for the current page available in the store, refreshed on page render
- [x] Batch apply of mixed block types in one update; `historyPast` grows by exactly 1
- [x] One undo restores every block to pre-translation state (extracted originals visible again, user-added strings back)
- [x] Re-running batch apply on already-translated blocks updates the same edited blocks (no duplicates)
- [x] Vitest coverage against the real store: history count, dedup, undo round-trip, mixed types

## Blocked by

- None (store-only; independent of 04).
