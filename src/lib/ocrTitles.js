// Automatic Spanish titles for OCR documents (spec #6, ticket #10).
//
// generateSpanishTitle asks the existing generic GLM chat seam for a short
// Spanish title derived from the document content. The chat client is
// injectable so tests run without network. Any failure — chat error,
// throw, empty or unusable output — falls back to the #7 fallback-title
// derivation, and a document is never untitled ("Documento OCR" as the
// last resort). Spanish-only is a deliberate product decision for now.

import { glmChat } from "./translation.js";
import { deriveFallbackTitle } from "./ocrDocument.js";

const TITLE_SYSTEM_PROMPT = [
  "Genera un título corto en español para el documento que recibirás.",
  "Máximo 6 palabras, sin comillas, sin punto final, sin formato.",
  "Responde SOLO con el título.",
].join(" ");

const EXCERPT_MAX_CHARS = 1500;
const TITLE_MAX_WORDS = 6;

function cleanTitle(text) {
  const t = String(text ?? "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/["'“”«»]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.split(" ").slice(0, TITLE_MAX_WORDS).join(" ");
}

/**
 * @param {string} content the assembled OCR document markdown
 * @param {typeof glmChat} [chat] injectable GLM chat client (tests)
 * @returns {Promise<string>} a non-empty Spanish title
 */
export async function generateSpanishTitle(content, chat = glmChat) {
  const excerpt = String(content ?? "").slice(0, EXCERPT_MAX_CHARS);
  if (excerpt.trim()) {
    try {
      const res = await chat(excerpt, TITLE_SYSTEM_PROMPT);
      if (res?.ok) {
        const title = cleanTitle(res.text);
        if (title) return title;
      }
    } catch {
      /* fall through to the derived title */
    }
  }
  return deriveFallbackTitle(excerpt) || "Documento OCR";
}
