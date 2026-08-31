# 01: Translation module (lib seam) + Vitest foundation

**What to build:** The project's first automated-test foundation plus the single new seam for translation: a pure, React-free function in the lib layer that takes a text block's string and returns its English↔Spanish translation (direction auto-detected by the model), or a distinguishable error. Backed by the GLM chat-completions API with the parameters settled in the spec (model glm-5.2, thinking disabled, non-streaming, temperature 0.2), reading the API key from a Vite environment variable. A user with the key configured in their local env file can verify the module end-to-end by running the test suite; a developer without a key still gets a green suite because tests mock the network.

Reference spec: `docs/specs/translate-text-blocks-en-es.md`.

## Acceptance criteria

- [ ] A dev dependency + npm script runs the new test suite (Vitest); `npm run lint` still passes
- [ ] The pure translation function returns `{ translated }` for English input (Spanish out) and Spanish input (English out) under mocked fetch
- [ ] Outgoing request shape is asserted: coding-plan chat-completions endpoint, model glm-5.2, `thinking.type: disabled`, `stream: false`, `temperature: 0.2`, system prompt instructing auto-direction EN↔ES, translation-only output, line-break preservation
- [ ] Missing API key (env var absent) produces a specific, distinguishable error outcome — not a thrown generic
- [ ] Network failure and invalid/unexpected response body each produce their own distinguishable error outcomes
- [ ] `.env.example` documents the new env var with a short comment; the real `.env.local` remains untracked
- [ ] Multi-line input preserves line breaks in the result under mocked fetch

## Blocked by

- None (can start immediately).
