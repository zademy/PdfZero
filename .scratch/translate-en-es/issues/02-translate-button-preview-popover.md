# 02: Translate button + preview popover, Apply on user-added text blocks

**What to build:** The visible feature, first tracer bullet through the UI: a Translate button (languages icon) in the text-selection mini-toolbar next to the AI font match placeholder. Clicking it shows a pleasant loading state ("Translating…" spinner) in the toolbar, calls the translation module from ticket 01, and on success opens a small popover with the translated text in an editable field plus Apply / Discard. Apply commits the translation through the existing user-added text update path — the block keeps its position and style, the change is undoable. Discard (or Escape) closes without touching anything. Friendly errors: empty selection guard, actionable toast when the API key is missing, error toast on request failure.

## Acceptance criteria

- [ ] Toolbar shows the Translate button for selected text blocks; the AI font match placeholder is untouched
- [ ] Click → spinner + "Translating…" indication while the request runs; button disabled during flight
- [ ] Success → popover with editable translated text prefilled; edits to the preview are honored on Apply
- [ ] Apply on a user-added block replaces its string in place via the existing overlay update; visible immediately; one undo reverts it
- [ ] Discard button and Escape close the popover with zero document change; Enter applies
- [ ] Whitespace-only block: friendly "nothing to translate" message, no request sent
- [ ] Missing API key → toast naming the env var to configure; request failure → distinct error toast
- [ ] Popover usable on mobile widths (<768px) and doesn't fight the mobile drawers
- [ ] `npm run lint` passes; manual verification in dev server documented in the ticket close

## Blocked by

- 01: Translation module (lib seam) + Vitest foundation
