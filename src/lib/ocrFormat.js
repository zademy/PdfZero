// Post-OCR structuring: turn a page's raw OCR text into Markdown that
// mirrors the page's visual layout (headings, paragraphs, lists), using the
// same GLM client as the translation feature. Purely additive: when the
// formatting call fails (no key, network, bad output) callers fall back to
// the raw text and the modal still works.

import { glmChat } from "./translation.js";

const FORMAT_SYSTEM_PROMPT = [
  "You re-structure raw OCR text from a single PDF page.",
  "Return clean Markdown that mirrors the page's visual structure:",
  "headings (#, ##, ###) by apparent importance and size,",
  "separate paragraphs where the layout implies breaks,",
  "bullet or numbered lists where items are enumerated,",
  "bold for short emphasized lines, `- ` rules for divider lines.",
  "Preserve the original language and content EXACTLY —",
  "do not translate, summarize, correct, or invent anything.",
  "Join words that OCR split across lines into flowing paragraphs.",
  "Return ONLY the Markdown — no explanations, no code fences.",
].join(" ");

/** Models love wrapping output in ```markdown fences — strip the OUTER
 *  wrapper only; fenced code blocks inside the content stay intact. */
export function stripMarkdownFences(text) {
  if (!text) return "";
  let out = String(text).trim();
  const leading = out.match(/^```(?:markdown|md)?\s*\n?/i);
  if (!leading) return out;
  out = out.slice(leading[0].length);
  const trailing = out.match(/\n?```\s*$/i);
  if (trailing) out = out.slice(0, out.length - trailing[0].length);
  return out.trim();
}

/**
 * @param {string} rawText OCR output for one page.
 * @returns {Promise<{ok: true, markdown: string} | {ok: false, code: string, message: string}>}
 */
export async function formatOcrMarkdown(rawText) {
  const res = await glmChat(rawText, FORMAT_SYSTEM_PROMPT);
  if (!res.ok) return res;
  const markdown = stripMarkdownFences(res.text);
  if (!markdown) {
    return {
      ok: false,
      code: "BAD_RESPONSE",
      message: "Formatter returned no markdown.",
    };
  }
  return { ok: true, markdown };
}
