// Deterministic OCR block cleanup — the classify-then-act pass that runs
// before any LLM formatting (ADR 0001). Pure text-in/text-out: no React,
// no network, unit-testable in isolation.
//
// Vocabulary (CONTEXT.md): an OCR *block* is a chunk of OCR text separated
// by blank lines — the unit this module labels and acts on. *Echo* is a
// block that redundantly repeats content already kept. "Segment" is a
// different concept (translation boxes) and never appears here.

/** The label dictionary: each entry names a label, how to detect it, and
 *  what cleanup does with a block carrying it. Thresholds live here so the
 *  classification rules stay discoverable and tweakable in one place. */
export const BLOCK_LABELS = {
  // A block whose normalized text repeats the previously kept block — the
  // repetition loop glm-ocr emits when generation runs away. Dropped.
  echo: {
    action: "drop",
    matches: (block, previousKept) =>
      Boolean(previousKept) && block === previousKept,
  },
  // Everything else: genuine page content. Kept as-is.
  content: {
    action: "keep",
  },
};

/** Split raw OCR text into normalized blocks: CRLF collapsed, blank-line
 *  separated, stray fence lines dropped, trimmed, empties removed. */
function toBlocks(raw) {
  if (!raw) return [];
  return String(raw)
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => !/^\s*```/.test(line))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

/** Resolve a block's label by consulting the dictionary in definition
 *  order; entries without a predicate (content) never match here and act
 *  as the default. */
function labelFor(block, previousKept) {
  for (const [label, rule] of Object.entries(BLOCK_LABELS)) {
    if (rule.matches && rule.matches(block, previousKept)) return label;
  }
  return "content";
}

/** Label every block. Returns [{ text, label }] in reading order; the
 *  echo predicate sees the previously *kept* block so a run of duplicates
 *  labels every repeat after the first as echo.
 * @param {string} rawText
 * @returns {{ text: string, label: string }[]}
 */
export function labelBlocks(rawText) {
  let previousKept = null;
  return toBlocks(rawText).map((block) => {
    const label = labelFor(block, previousKept);
    if (BLOCK_LABELS[label].action !== "drop") previousKept = block;
    return { text: block, label };
  });
}

/** Full cleanup: label blocks, drop the ones the dictionary says to drop,
 *  rejoin. Complements of the former sanitizeOcrText, now pipeline-owned.
 * @param {string} rawText
 * @returns {string}
 */
export function cleanOcrText(rawText) {
  return labelBlocks(rawText)
    .filter((block) => BLOCK_LABELS[block.label].action !== "drop")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}
