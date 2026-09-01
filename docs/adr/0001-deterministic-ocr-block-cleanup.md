# Deterministic OCR block cleanup runs before LLM formatting

OCR post-processing is a two-stage pipeline: a deterministic classify-then-act pass over OCR blocks — each block labelled via the `BLOCK_LABELS` dictionary (`echo` dropped, `heading-fragment` merged, `content` kept) in a pure lib module — followed by the best-effort GLM Markdown formatting. The deterministic stage owns the raw text handed to GLM and is what remains when no API key exists, so cleanup degrades gracefully instead of disappearing. The pipeline (not `ollamaOcr.js`) owns the cleanup, and `ollamaOcrCanvas` returns unsanitized text: cleanup is post-processing on OCR output, not an Ollama transport quirk, and must stay unit-testable without network.

## Considered Options

- Extend `sanitizeOcrText` inside `ollamaOcr.js` — rejected: couples cleanup to one engine's transport and buries merge logic with fetch code.
- Merge headings only inside the GLM prompt — rejected: LLM-only cleanup vanishes without an API key and is not regression-testable.
