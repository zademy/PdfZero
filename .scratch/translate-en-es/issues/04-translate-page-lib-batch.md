# 04: translatePage batch function (lib) + tests

**What to build:** The contextual batch seam: a pure lib function that takes the page's text blocks (`{ id, text, budget }` in reading order) and returns an id→translation map from ONE GLM request, with strict-JSON prompting, a generous max-token ceiling, per-block validation, and per-block fallback (via the existing single-block function) for ids the model skips or mangles. Budgets derive from original length (×1.25, rounded up).

## Acceptance criteria

- [x] One request for the whole page: JSON array of `{id, text, budget}` in, system prompt demanding a strict `{id: translation}` JSON object, no commentary
- [x] Reading-order helper (y then x) exported and tested
- [x] Response validation: every id non-empty string; missing/invalid ids retried via the single-block path; still-failing ids excluded and reported in the result
- [x] max-token ceiling present and asserted in request shape
- [x] Malformed JSON / HTTP / network errors → distinguishable error codes (same vocabulary as the single-block seam)
- [x] Empty block list → EMPTY_TEXT-style early return
- [x] Vitest coverage with mocked fetch: happy path, partial response, malformed JSON, request shape

## Blocked by

- None (single-block seam already exists).
