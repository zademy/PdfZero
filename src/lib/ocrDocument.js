// OCR document assembly — the pure seam between per-page OCR runs and the
// Tools OCR Scanner workspace (spec #6, ticket #7).
//
// ocrPage yields one page: { raw, markdown?, engine }. This module turns a
// whole run into ONE OCR document (glossary term, CONTEXT.md): a single
// markdown string with a `## Page N` heading per page joined by thematic
// breaks, a visible note under pages whose GLM formatting failed, and a
// fallback title derived from the content. formatWithRetry wraps the existing
// formatter seam ({ ok, markdown } result objects, never throws) with three
// attempts before falling back.
//
// Pure: no React, no DOM, no network. The scanner UI owns progress toasts.

export const FORMAT_FAILED_NOTE =
  "> No se pudo generar el formato de esta página.";

const PAGE_HEADING_RE = /^#{1,6}\s+Page\s+\d+\s*$/i;
const FALLBACK_TITLE_WORDS = 6;

function pageSection({ page, raw, markdown }) {
  const md =
    typeof markdown === "string" && markdown.trim() ? markdown.trim() : null;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!md && !text) return null;
  return {
    heading: `## Page ${page}`,
    content: md ?? `${text}\n\n${FORMAT_FAILED_NOTE}`,
    failed: !md,
  };
}

export function assembleOcrDocument(pageResults) {
  const sections = (Array.isArray(pageResults) ? pageResults : [])
    .map(pageSection)
    .filter(Boolean);

  const parts = [];
  for (const section of sections) {
    if (parts.length) parts.push("---");
    parts.push(section.heading, section.content);
  }

  return {
    markdown: parts.join("\n\n"),
    partialFormat: sections.some((s) => s.failed),
  };
}

export function deriveFallbackTitle(markdown) {
  for (const line of String(markdown ?? "").split("\n")) {
    const t = line.trim();
    if (!t || t === "---" || t === FORMAT_FAILED_NOTE) continue;
    if (PAGE_HEADING_RE.test(t)) continue;
    const heading = t.match(/^#{1,6}\s+(.+)$/);
    const text = (heading ? heading[1] : t)
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    return text.split(" ").slice(0, FALLBACK_TITLE_WORDS).join(" ");
  }
  return "";
}

async function tryFormat(formatter, rawText) {
  try {
    return await formatter(rawText);
  } catch {
    return null;
  }
}

export async function formatWithRetry(
  rawText,
  formatter,
  { attempts = 3 } = {},
) {
  const max = Math.max(1, attempts);
  for (let attempt = 0; attempt < max; attempt += 1) {
    const res = await tryFormat(formatter, rawText);
    if (
      res &&
      res.ok &&
      typeof res.markdown === "string" &&
      res.markdown.trim()
    ) {
      return res.markdown.trim();
    }
  }
  return null;
}
