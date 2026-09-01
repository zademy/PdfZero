// Deterministic OCR block cleanup — the classify-then-act pass that runs
// before any LLM formatting (ADR 0001). Pure text-in/text-out: no React,
// no network, unit-testable in isolation.
//
// Vocabulary (CONTEXT.md): an OCR *block* is a chunk of OCR text separated
// by blank lines — the unit this module labels and acts on. *Echo* is a
// block that redundantly repeats content already kept. "Segment" is a
// different concept (translation boxes) and never appears here.

// Echo thresholds (exposed on the dictionary entry below so tests and
// tweaks read them from one place).
const ECHO_PREFIX_MIN_CHARS = 10;

/** The label dictionary: each entry names a label, how to detect it, and
 *  what cleanup does with a block carrying it. Thresholds live here so the
 *  classification rules stay discoverable and tweakable in one place. */
export const BLOCK_LABELS = {
  // Echo: a block that redundantly repeats content already kept (CONTEXT.md).
  // Two block-level shapes, both dropped:
  // - exact repeat of the previously kept block (the glm-ocr repetition loop)
  // - the FINAL block repeating a prefix of the previously kept block — the
  //   loop cut mid-repeat by the generation cap (num_predict); only worth
  //   trusting at prefixMinChars+ chars, shorter overlaps are coincidence
  echo: {
    action: "drop",
    prefixMinChars: ECHO_PREFIX_MIN_CHARS,
    matches: (block, previousKept) =>
      Boolean(previousKept) && block === previousKept,
    matchesTruncated: (block, previousKept) =>
      Boolean(previousKept) &&
      block.length >= ECHO_PREFIX_MIN_CHARS &&
      previousKept.startsWith(block),
    // Line-level echo shape: a run of ≥ 2 identical consecutive lines inside
    // one block collapses to a single line (mid-block generation loop).
    collapseLineRuns: (lines) =>
      lines.filter((line, i) => i === 0 || line !== lines[i - 1]),
  },
  // Everything else: genuine page content. Kept as-is.
  content: {
    action: "keep",
  },
};

/** A label survives cleanup when its dictionary action is not "drop". */
const isKept = (label) => BLOCK_LABELS[label].action !== "drop";

/** Split raw OCR text into normalized blocks: CRLF collapsed, blank-line
 *  separated, stray fence lines dropped, internal echo line-runs collapsed,
 *  trimmed, empties removed. */
function toBlocks(raw) {
  if (!raw) return [];
  const { collapseLineRuns } = BLOCK_LABELS.echo;
  return String(raw)
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      collapseLineRuns(
        block.split("\n").filter((line) => !/^\s*```/.test(line)),
      )
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
  const labeled = toBlocks(rawText).map((block) => {
    const label = labelFor(block, previousKept);
    if (isKept(label)) previousKept = block;
    return { text: block, label };
  });

  // Truncated-prefix echo is final-position by definition (the generation
  // cap cuts the last repeat), so it can only be judged once the walk is
  // done: relabel the last block when it repeats a prefix of the nearest
  // kept block before it — never the last block's own text.
  if (labeled.length >= 2) {
    const last = labeled[labeled.length - 1];
    let previousKeptBeforeLast = null;
    for (let i = labeled.length - 2; i >= 0 && !previousKeptBeforeLast; i--) {
      if (isKept(labeled[i].label)) {
        previousKeptBeforeLast = labeled[i].text;
      }
    }
    if (
      last.label !== "echo" &&
      BLOCK_LABELS.echo.matchesTruncated(last.text, previousKeptBeforeLast)
    ) {
      last.label = "echo";
    }
  }
  return labeled;
}

/** Full cleanup: label blocks, drop the ones the dictionary says to drop,
 *  rejoin. Complements of the former sanitizeOcrText, now pipeline-owned.
 * @param {string} rawText
 * @returns {string}
 */
export function cleanOcrText(rawText) {
  return labelBlocks(rawText)
    .filter((block) => isKept(block.label))
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}
