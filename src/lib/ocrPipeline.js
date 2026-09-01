// The whole OCR flow behind one function.
//
// ocrPage(pageNum, { onStage, format = true }) → { raw, markdown, engine }
// Callers that discard `markdown` (e.g. whole-document text export) pass
// format: false to skip the GLM call entirely.
//
// Hides everything the caller shouldn't need to know:
//   - page rendering (pdfjs canvas at the OCR-friendly scale)
//   - the single engine: a local Ollama server running glm-ocr
//     (ADR 0002). When detection fails, ocrPage rejects with
//     OcrUnavailableError — an actionable message the UI surfaces
//     as one toast. No silent degradation, no fallback engine.
//   - deterministic block cleanup (ocrBlocks.js, ADR 0001): one pass over
//     the raw text right after the engine, before GLM formatting — echo
//     blocks drop there, so both the formatter and the no-key fallback
//     see clean text
//   - best-effort GLM formatting into page-structure Markdown (gated on the
//     key; any failure leaves markdown null, never throws)
//
// Callers own only UI feedback (onStage → toasts) and the store.

import { renderPage } from "./pdfRenderer.js";
import { detectOllama, ollamaOcrCanvas } from "./ollamaOcr.js";
import { cleanOcrText } from "./ocrBlocks.js";
import { formatOcrMarkdown } from "./ocrFormat.js";
import { getGlmApiKey } from "./translation.js";

const OCR_RENDER_SCALE = 2;

/** Ollama (or the glm-ocr model) is not reachable — OCR cannot run. */
export class OcrUnavailableError extends Error {
  constructor() {
    super(
      "OCR needs a local Ollama server with the glm-ocr model. " +
        "Install Ollama from https://ollama.com and run `ollama pull glm-ocr`.",
    );
    this.name = "OcrUnavailableError";
  }
}

export async function ocrPage(pageNum, { onStage, format = true } = {}) {
  const stage = (name, detail) => {
    if (onStage) onStage(name, detail);
  };

  stage("render");
  const { canvas } = await renderPage(pageNum, OCR_RENDER_SCALE);

  stage("detect");
  const ollama = await detectOllama();
  if (!ollama) throw new OcrUnavailableError();

  stage("ollama", ollama.model);
  let raw = await ollamaOcrCanvas(canvas, ollama.model);

  // Deterministic cleanup, one pass, engine output → blocks (ADR 0001).
  raw = cleanOcrText(raw);

  // Best-effort formatting: gated on the key, never throws.
  let markdown = null;
  if (format && raw.trim() && getGlmApiKey()) {
    stage("format");
    try {
      const fmt = await formatOcrMarkdown(raw);
      if (fmt.ok) markdown = fmt.markdown;
    } catch {
      /* keep markdown null */
    }
  }

  return { raw, markdown, engine: ollama.model };
}
