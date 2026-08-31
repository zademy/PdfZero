# 02: Translate button + preview popover, Apply on user-added text blocks

**What to build:** The visible feature, first tracer bullet through the UI: a Translate button (languages icon) in the text-selection mini-toolbar next to the AI font match placeholder. Clicking it shows a pleasant loading state ("Translating…" spinner) in the toolbar, calls the translation module from ticket 01, and on success opens a small popover with the translated text in an editable field plus Apply / Discard. Apply commits the translation through the existing user-added text update path — the block keeps its position and style, the change is undoable. Discard (or Escape) closes without touching anything. Friendly errors: empty selection guard, actionable toast when the API key is missing, error toast on request failure.

## Acceptance criteria

- [x] Toolbar shows the Translate button for selected text blocks; the AI font match placeholder is untouched
- [x] Click → spinner + "Translating…" indication while the request runs; button disabled during flight
- [x] Success → popover with editable translated text prefilled; edits to the preview are honored on Apply
- [x] Apply on a user-added block replaces its string in place via the existing overlay update; visible immediately; one undo reverts it
- [x] Discard button and Escape close the popover with zero document change; Enter applies
- [x] Whitespace-only block: friendly "nothing to translate" message, no request sent
- [x] Missing API key → toast naming the env var to configure; request failure → distinct error toast
- [x] Popover usable on mobile widths (<768px) and doesn't fight the mobile drawers
- [x] `npm run lint` passes; manual verification in dev server documented in the ticket close

## Blocked by

- 01: Translation module (lib seam) + Vitest foundation

## QA results (2026-08-31, Playwright E2E + real GLM key)

Live-verified: toolbar button next to AI font match placeholder; real EN→ES ("The cat is sleeping" → "El gato está durmiendo"); editable preview (manual "[editado]" edit persisted through Apply); Escape/Discard with zero change; Apply + one-step undo on extracted blocks (button and Enter both); re-translate updates the same edit in place (no stacking); popover fits 375px viewport (measured clamp added); missing-key/empty/error paths unit-tested. User-added Apply path verified by code review plus live preview/discard (store call shared with pre-existing manual-edit flow). Found & fixed during QA: (1) translate button rendered as separator due to `label:null` sentinel collision; (2) endpoint occasionally echoes input — added one retry with explicit never-repeat prompt (unit-tested); (3) popover overflow on mobile.
