# Translate text blocks in the editor (EN↔ES) via GLM

> **Status: `ready-for-agent`** — published locally because GitHub Issues are disabled on `zademy/PdfZero`. If Issues get enabled (repo Settings → Features), migrate this spec to an issue and apply the `ready-for-agent` label.

## Problem Statement

When I open a PDF in the PdfZero editor, I can select a piece of text and edit it, but I cannot translate it. If a document mixes English and Spanish, I have to copy the text to an external translator and manually retype or paste the result back, losing the original position, font, and background blending. There is no in-place way to say "turn this selected text into the other language."

## Solution

Add a **Translate** button to the existing text-selection mini-toolbar (next to Edit / Duplicate / AI font match / Delete). One click sends the block's text to the GLM API (auto-detecting English↔Spanish), shows a pleasant loading state, then presents an **editable preview** of the translation. Applying the preview commits it through the exact same non-destructive editing path as a manual text edit: the original run is whiteouted with its sampled background, the translated text is re-drawn in place with the original font metadata, and the change is undoable. Discarding leaves the document untouched. Everything stays client-side; the only network call is the translation request itself.

## User Stories

1. As a PDF editor user, I want a Translate button in the text-selection toolbar, so that I can translate a selected text block without leaving the editor.
2. As a PDF editor user, I want the direction (English→Spanish or Spanish→English) to be auto-detected, so that I don't have to configure anything before translating.
3. As a PDF editor user, I want a spinner with a "Translating…" indicator while the request runs, so that I know the app is working and not frozen.
4. As a PDF editor user, I want to see a preview of the translated text before it touches my document, so that a bad translation never lands silently.
5. As a PDF editor user, I want to edit the translated text inside the preview, so that I can fix a wrong word before applying it.
6. As a PDF editor user, I want an Apply button that commits the translation in place, so that the translated text appears exactly where the original was, with the same font, size, color, and position.
7. As a PDF editor user, I want a Discard button, so that I can cancel the translation without any change to the document.
8. As a PDF editor user, I want the applied translation to be undoable with the existing undo, so that I can revert a translation with one step.
9. As a PDF editor user, I want translated text that no longer fits the original block to be flagged with the existing overflow indication, so that I notice when Spanish text grows past the original English run.
10. As a PDF editor user, I want to translate a block I already translated once, so that re-applying or correcting a translation updates the same edit instead of stacking duplicates.
11. As a PDF editor user, I want to translate text blocks I added myself, so that my own annotations can also be swapped between languages.
12. As a PDF editor user, I want a clear, friendly error when the API key is not configured, so that I know exactly what to set and where.
13. As a PDF editor user, I want a clear error when the request fails (network, rate limit, invalid response), so that I can distinguish "my key is missing" from "the service is down."
14. As a PDF editor user, I want the translation to preserve my line breaks, so that multi-line blocks keep their structure after translating.
15. As a PDF editor user, I want the original PDF file to remain untouched on disk, so that translation is always a reversible overlay like every other edit.
16. As a PDF editor user, I want the exported PDF to contain the translated text as real selectable text, so that the vector export path keeps working for translations.
17. As a privacy-conscious user, I want my API key stored only in my local environment file, so that it never enters the repository or any server.
18. As a privacy-conscious user, I want all PDF processing to stay in my browser, so that the only data leaving my machine is the short text snippet being translated.
19. As a mobile editor user, I want the preview popover to be reachable and usable on a small screen, so that translation works from my phone too.
20. As a keyboard user, I want to confirm the preview with Enter and cancel with Escape, so that the flow matches the existing edit interactions.
21. As a user translating an empty or whitespace-only selection, I want to be told there is nothing to translate, so that I don't wait on a pointless request.
22. As a returning user, I want repeated translations to reuse the same configured key and model, so that the feature is one click every time after initial setup.

## Implementation Decisions

- **One new seam**: a pure, React-free module in the lib layer exposing `translateText(text)` returning `{ translated }`, with typed/ distinguishable error outcomes (missing key, request failure, invalid response). All prompt construction, request shaping, and response parsing live there.
- **GLM API contract**: OpenAI-compatible chat-completions endpoint of the GLM coding plan; model `glm-5.2`; `thinking` disabled; `stream` off (single JSON response); `temperature` 0.2. System prompt instructs: detect whether the input is English or Spanish, translate to the other language, return only the translation, preserve line breaks, no commentary.
- **API key**: read from a Vite environment variable supplied via the local gitignored env file (`.env.local`). No key modal, no localStorage. A missing key surfaces as an actionable toast naming the variable. The key is never committed.
- **UI entry point**: a new sibling button (translate/languages icon) inside the existing text context toolbar, next to the AI font match placeholder. The placeholder itself is untouched.
- **Interaction flow**: click → toolbar enters a loading state (spinner + "Translating…", pleasant and unobtrusive) → on response, a small popover shows the editable translated text with Apply / Discard → Apply commits, Discard closes.
- **Commit path**: for extracted PDF text, Apply routes through the existing extracted-edit commit (full font-metadata preservation, per-block whiteout, history push, edit dedup by original block id). For user-added text blocks, Apply routes through the existing overlay text update. No new editing-model concepts.
- **Direction**: single button, auto-detected by the model; no language picker in this version.
- **Layout**: translated text reuses the existing fitting/overflow indication (orange highlight + tooltip). No new auto-shrink logic.
- **Architecture**: browser-only is preserved — the translation request is the sole network call; direct browser calls to the endpoint are confirmed viable (CORS verified). No backend or proxy is introduced.
- **Non-destructive guarantee**: a translation is just an edit overlay; original file bytes are never mutated, and the vector exporter renders it as real text.

## Testing Decisions

- **What makes a good test here**: only the external behavior of the lib seam — the shape of the outgoing request (endpoint, model, disabled thinking, non-streaming, prompt contents) and the mapping of responses and failures to results (`{ translated }` vs distinguishable errors). No tests of internal helpers or React rendering.
- **Module tested**: the new pure translation module, via **Vitest** introduced as a dev dependency with a single test file and `fetch` mocked. This is the repo's first automated test; it stays scoped to the one new seam.
- **Prior art**: none in the codebase (no test suite exists). The lib-purity convention (`lib/` = plain functions, no React) is what makes this seam testable.
- **Not automated**: toolbar UI, popover, spinner, and commit wiring — thin glue over long-existing seams; verified manually in the dev server plus `npm run lint` after every change.

## Out of Scope

- A standalone Translate tool page (whole-document / multi-page batch translation).
- Language pairs other than English↔Spanish, and explicit direction toggles.
- Streaming responses with progressive rendering (revisit if latency feels bad).
- Implementing the AI font match placeholder (remains a stub).
- Any key-management UI (modal, settings screen) or localStorage persistence.
- Any backend, proxy, or server-side component.
- Translating annotations/shapes other than text blocks.

## Further Notes

- The GLM coding-plan endpoint is officially documented as limited to supported coding tools; using it inside this personal, browser-only app is an accepted off-label trade-off decided with the user.
- Vite environment variables are baked into the production bundle at build time: fine for local/personal use, but the key would be visible to anyone if the built app were ever hosted publicly.
- CORS from the browser to the coding-plan chat-completions endpoint was verified live (preflight echoes the origin and allows the request with an Authorization header), which is what keeps the no-backend architecture intact.
- The domain glossary (`CONTEXT.md`) now defines **Translation** as an applied extracted edit produced from a previewed, auto-directional EN↔ES conversion of a text block.
