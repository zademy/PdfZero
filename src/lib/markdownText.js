// Markdown → plain text for the OCR Scanner's .txt export (spec #6, ticket #8).
//
// Deterministic, line-oriented strip of the markdown syntax the OCR workspace
// produces (formatter output + page assembly from ocrDocument.js): headings,
// emphasis, links, images, lists, quotes, code fences, admonition fences,
// frontmatter and thematic breaks. Code block CONTENT survives verbatim —
// it is text the user will want to paste.

const FRONTMATTER_RE = /^---\s*\n[\s\S]*?\n---\s*\n?/;
const CODE_FENCE_RE = /^\s*(```|~~~)/;
const ADMONITION_FENCE_RE = /^\s*:::.*$/;
const THEMATIC_BREAK_RE = /^\s*-{3,}\s*$/;

export function markdownToPlainText(markdown) {
  const withoutFrontmatter = String(markdown ?? "").replace(FRONTMATTER_RE, "");

  // Block pass: drop fences/redirects, keep everything else (code verbatim).
  const lines = [];
  let inCodeFence = false;
  for (const line of withoutFrontmatter.split("\n")) {
    if (CODE_FENCE_RE.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      lines.push(line);
      continue;
    }
    if (ADMONITION_FENCE_RE.test(line)) continue;
    if (THEMATIC_BREAK_RE.test(line)) continue;
    lines.push(line);
  }

  // Inline pass: unwrap the markers, keep the content.
  return lines
    .join("\n")
    .replace(/^(\s*)>\s?/gm, "$1")
    .replace(/^(\s*)(?:[-*+]|\d+\.)\s+/gm, "$1")
    .replace(/^(\s*)#{1,6}\s+/gm, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/==(.+?)==/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\^([^^]+)\^/g, "$1")
    .replace(/~([^~]+)~/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
