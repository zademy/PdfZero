// Optional enhanced OCR engine: a local Ollama server (default
// http://localhost:11434) running a vision OCR model such as glm-ocr.
//
// This is progressive enhancement over the always-available tesseract.js
// engine (src/lib/ocrEngine.js): everything still runs on the user's
// machine — no cloud, no uploads — and the app works unchanged when Ollama
// is not installed.
//
// Quirks handled here (measured against glm-ocr 1.1B):
// - The model is a raw-completion single-purpose OCR: prompt is literally
//   "ocr", no chat template, temperature 0.
// - With generic prompts it can loop, repeating the same fenced block many
//   times. We cap generation (num_predict), add repeat_penalty, and the
//   deterministic block cleanup (ocrBlocks.js, ADR 0001) collapses the loop
//   in the OCR pipeline — this module returns raw, unsanitized text.

import { cleanOcrText } from "./ocrBlocks.js";

const OLLAMA_BASE = "http://localhost:11434";
const PREFERRED_MODEL_PREFIX = "glm-ocr";
const DETECT_TIMEOUT_MS = 1500;
const OCR_TIMEOUT_MS = 120000;

/**
 * Detect a usable local Ollama OCR model.
 * @returns {Promise<{model: string} | null} null when Ollama is absent,
 *   unreachable, or has no preferred OCR model installed.
 */
export async function detectOllama() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const names = (data.models || []).map((m) => m.name || "");
    const model =
      names.find((n) => n.startsWith(PREFERRED_MODEL_PREFIX)) ||
      names.find((n) => n.includes("ocr"));
    return model ? { model } : null;
  } catch {
    return null;
  }
}

/** Build the /api/generate request body for a raw OCR completion. */
export function buildOcrRequestBody(model, imageBase64) {
  return {
    model,
    prompt: "ocr",
    images: [imageBase64],
    stream: false,
    think: false,
    options: {
      temperature: 0,
      repeat_penalty: 1.1,
      num_predict: 4096,
    },
  };
}

/**
 * Thin delegate to the shared block cleanup (ocrBlocks.js, ADR 0001).
 * Kept for the public surface: existing callers/tests import this name.
 */
export function sanitizeOcrText(raw) {
  return cleanOcrText(raw);
}

/**
 * Vision encoders aggressively downscale oversized images, which loses
 * detail on dense pages (observed as partial extraction). Render the page
 * small enough that every part stays inside the encoder's native window:
 * resample so the longest side is ≤ MAX_SIDE px with smooth filtering.
 */
const MAX_SIDE = 1600;

function downscaleCanvas(canvas) {
  const max = Math.max(canvas.width, canvas.height);
  if (max <= MAX_SIDE) return canvas;
  const ratio = MAX_SIDE / max;
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * ratio);
  out.height = Math.round(canvas.height * ratio);
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/** Canvas → base64 PNG (no data: prefix, as Ollama expects). */
async function canvasToBase64(canvas) {
  const dataUrl = downscaleCanvas(canvas).toDataURL("image/png");
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/**
 * OCR a rendered page canvas through the local Ollama model.
 * @returns {Promise<string>} raw, unsanitized plain text — block cleanup
 *   is owned by the OCR pipeline (ADR 0001).
 */
export async function ollamaOcrCanvas(canvas, model) {
  const imageBase64 = await canvasToBase64(canvas);
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildOcrRequestBody(model, imageBase64)),
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama OCR failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.response || "";
}
