// The whole OCR flow behind one function.
//
// ocrPage(pageNum, { onStage, onProgress }) → { raw, markdown, engine }
//
// Hides everything the caller shouldn't need to know:
//   - page rendering (pdfjs canvas at the OCR-friendly scale)
//   - engine choice: local Ollama glm-ocr preferred, tesseract.js fallback
//   - the engines' incompatible contracts (tesseract returns words[] with
//     geometry, Ollama a sanitized string) normalized onto `raw`
//   - tesseract worker termination (always, even on failure — leaking
//     workers degrades the page)
//   - best-effort GLM formatting into page-structure Markdown (gated on the
//     key; any failure leaves markdown null, never throws)
//
// Callers own only UI feedback (onStage/onProgress → toasts) and the store.

import { renderPage } from "./pdfRenderer.js";
import { detectOllama, ollamaOcrCanvas } from "./ollamaOcr.js";
import { ocrCanvas, terminateOcr } from "./ocrEngine.js";
import { formatOcrMarkdown } from "./ocrFormat.js";
import { getGlmApiKey } from "./translation.js";

const OCR_RENDER_SCALE = 2;

export async function ocrPage(pageNum, { onStage, onProgress } = {}) {
  const stage = (name, detail) => {
    if (onStage) onStage(name, detail);
  };

  try {
    stage("render");
    const { canvas } = await renderPage(pageNum, OCR_RENDER_SCALE);

    let raw = "";
    let engine = "";

    stage("detect");
    const ollama = await detectOllama();
    if (ollama) {
      stage("ollama", ollama.model);
      try {
        raw = await ollamaOcrCanvas(canvas, ollama.model);
        engine = ollama.model;
      } catch {
        raw = ""; // fall through to tesseract
      }
    }

    if (!raw) {
      stage("tesseract");
      const words = await ocrCanvas(canvas, (pct) => {
        if (onProgress) onProgress(pct);
      });
      raw = words.map((w) => w.str).join(" ");
      engine = "tesseract.js";
    }

    // Best-effort formatting: gated on the key, never throws.
    let markdown = null;
    if (raw.trim() && getGlmApiKey()) {
      stage("format");
      try {
        const fmt = await formatOcrMarkdown(raw);
        if (fmt.ok) markdown = fmt.markdown;
      } catch {
        /* keep markdown null */
      }
    }

    return { raw, markdown, engine };
  } finally {
    // AGENTS rule: never leak the tesseract worker.
    terminateOcr().catch(() => {});
  }
}
