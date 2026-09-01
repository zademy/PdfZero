// Keeps translated text inside its box.
//
// Two jobs, both extracted from the editor toolbar where they lived as
// untested component-locals (the box-fit logic behind the accent-overflow
// fix):
//   buildPageEntries  — assemble every translatable block on a page
//                       (extracted originals + their committed edits +
//                       user-added boxes) with per-block char budgets
//   fitTranslations   — validate each translation's REAL rendered width
//                       against its box and condense the overruns through
//                       the condense service, back-solving tighter budgets
//                       from actual measurements
//
// The only DOM dependency (measureText) is injected, so everything here is
// testable headless. Budgets are guidance for the request payload; measured
// width is the truth.

import { condenseTranslations as defaultCondense } from "./translation.js";

// Measure a translation's REAL rendered width (px, same coordinate space as
// block geometry) using an offscreen canvas with the block's font. Accented
// Spanish glyphs routinely run wider than char-count estimates and overrun
// the box / the page's right margin.
export function createMeasureWidth() {
  let ctx = null;
  return (text, block) => {
    if (!ctx) ctx = document.createElement("canvas").getContext("2d");
    const fontSize = Math.max(block.fontSize || 12, 4);
    ctx.font = `${block.fontItalic ? "italic " : ""}${block.fontBold ? "bold " : ""}${fontSize}px ${block.fontFamily || "Arial, Helvetica, sans-serif"}`;
    return ctx.measureText(text).width;
  };
}

// Guidance budget for the request payload: chars that fit the box width at
// the original font's average advance.
export function charBudget(block, fallbackText) {
  const w = block.originalWidth ?? block.width;
  const str = block.originalStr ?? fallbackText ?? "";
  const adv =
    block.averageAdvance ||
    (str.length ? w / str.length : null) ||
    (block.fontSize || 12) * 0.5;
  return Math.max(3, Math.floor(w / adv));
}

// The operator-list color heuristic can misassign colors on some pages
// (near-white text on a light page = invisible translation). Snap near-white
// text to black when the page background is also light.
export function isLightColor(c) {
  if (!c) return true;
  let r;
  let g;
  let b;
  if (c[0] === "#") {
    const n = parseInt(c.slice(1, 7), 16);
    r = n >> 16;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (m) {
      r = +m[1];
      g = +m[2];
      b = +m[3];
    } else {
      return /^(white|whitesmoke|snow|ghostwhite)$/i.test(c);
    }
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.85;
}

export function sanitizeColor(block, pageBg) {
  return isLightColor(block.color) && isLightColor(pageBg)
    ? { ...block, color: "#000000" }
    : block;
}

// Back-solve a char budget from a real measurement (97% safety factor).
export function backSolvedBudget(translatedLength, boxWidth, measured) {
  return Math.max(
    3,
    Math.floor((translatedLength * boxWidth * 0.97) / measured),
  );
}

// Assemble the page's translatable entries. Originals already carrying a
// committed edit translate their CURRENT (edited) text under the original's
// id so the edit updates in place — using the original's geometry for the
// budget. User-added boxes get a generous 1.25x budget (min 8).
export function buildPageEntries({ extractedItems, layerTexts, pageBg }) {
  const editedByOriginalId = new Map(
    (layerTexts || [])
      .filter((t) => t.isEdited && t.originalId)
      .map((t) => [t.originalId, t]),
  );
  const userAdded = (layerTexts || []).filter((t) => !t.originalId);

  const extractedEntries = (extractedItems || [])
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      const edited = editedByOriginalId.get(it.id);
      const text = edited ? edited.str : it.str;
      const budgetBlock = edited
        ? {
            ...it,
            originalStr: edited.originalStr,
            originalWidth: edited.originalWidth,
            averageAdvance: edited.averageAdvance,
          }
        : it;
      return {
        kind: "extracted",
        block: sanitizeColor(it, pageBg),
        id: it.id,
        text,
        budget: charBudget(budgetBlock, text),
        x: it.x,
        y: it.y,
      };
    });

  const userEntries = userAdded
    .filter((t) => t.str && t.str.trim())
    .map((t) => ({
      kind: "user",
      block: t,
      id: t.id,
      text: t.str,
      budget: Math.max(Math.ceil(t.str.length * 1.25), 8),
      x: t.x,
      y: t.y,
    }));

  return [...extractedEntries, ...userEntries];
}

// Validate REAL rendered width against the box and condense the overruns.
// Char budgets are only guidance; a measured overrun visibly escapes the box
// and the page's right margin. Returns a NEW translations map — shorter
// condensations replace their originals, everything else passes through.
//
// Condensation is ITERATIVE and measurement-driven: a candidate that is
// shorter but still MEASURES over its box is re-condensed in the next round
// from its own re-back-solved budget, up to maxRounds. Length-based
// acceptance alone lets a "shorter" string still render wider than its box
// (wider glyphs) — only the re-measure loop catches that.
// ─── Box truth ─────────────────────────────────────────────────────────────
// The ORIGINAL string's measured width is the line's true footprint (canvas
// and DOM agree within ~1.2%). A block's originalWidth/width can be inflated
// (merged runs, stale geometry) — an inflated box lets an expansion run past
// the visual margin even when every check "passes". Clamp the box to what the
// original glyphs actually occupy, with a small skew allowance.
export function boxOf(entry, measureWidth) {
  const box = entry.block.originalWidth ?? entry.block.width ?? 0;
  if (!box || typeof measureWidth !== "function") return box;
  const orig = entry.text ?? entry.block.str;
  if (!orig) return box;
  const m = measureWidth(orig, entry.block);
  return m > 0 ? Math.min(box, m * 1.02) : box;
}

export async function fitTranslations(
  ordered,
  translations,
  { measureWidth, condense = defaultCondense, maxRounds = 3 },
) {
  const out = { ...translations };
  for (let round = 0; round < maxRounds; round++) {
    const overWidth = ordered.filter((e) => {
      const translated = out[e.id];
      if (!translated) return false;
      const boxWidth = boxOf(e, measureWidth);
      if (!boxWidth) return false;
      return measureWidth(translated, e.block) > boxWidth * 1.005;
    });
    if (!overWidth.length) break;

    const condensed = await condense(
      overWidth.map((e) => {
        const translated = out[e.id];
        const boxWidth = boxOf(e, measureWidth);
        const measured = measureWidth(translated, e.block);
        return {
          id: e.id,
          text: translated,
          budget: backSolvedBudget(translated.length, boxWidth, measured),
        };
      }),
    );
    if (!condensed.ok) break;

    let improved = false;
    for (const e of overWidth) {
      const shorter = condensed.translations[e.id];
      if (shorter && shorter.length < out[e.id].length) {
        out[e.id] = shorter;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return out;
}

// ─── Right-margin fill via NATURAL TEXT (no typography tricks) ─────────────
// A translated line that lands well short of its original box is rephrased
// (by GLM, in translate-land) to approximately the character count that
// fills ~95% of the box. Same font, same size, letterSpacing untouched —
// the text itself does the filling.
export function expansionItems(
  ordered,
  translations,
  { measureWidth, targetFactor = 0.95, minFill = 0.9, maxGrow = 1.6 } = {},
) {
  if (typeof measureWidth !== "function") return [];
  const items = [];
  for (const e of ordered) {
    const translated = translations[e.id];
    if (!translated || !translated.trim()) continue;
    const boxWidth = boxOf(e, measureWidth);
    if (!boxWidth || translated.length < 2) continue;
    const measured = measureWidth(translated, e.block);
    const fill = measured / boxWidth;
    if (fill >= minFill) continue; // close enough already
    if (measured > boxWidth) continue; // over-width is condense's job
    const pxPerChar = measured / translated.length;
    const budget = Math.min(
      Math.floor((boxWidth * targetFactor) / pxPerChar),
      Math.ceil(translated.length * maxGrow),
    );
    if (budget <= translated.length + 1) continue; // nothing meaningful to add
    items.push({ id: e.id, text: translated, budget });
  }
  return items;
}

// Merge expanded candidates back: keep one ONLY if it measurably improves
// the fill AND still fits inside the box. Anything else keeps the original
// translation — a ragged right beats overflow or a worse line.
export function mergeExpansions(
  ordered,
  translations,
  expanded,
  { measureWidth, minGain = 0.03 } = {},
) {
  if (
    typeof measureWidth !== "function" ||
    !expanded ||
    typeof expanded !== "object"
  )
    return translations;
  const out = { ...translations };
  for (const e of ordered) {
    const candidate = expanded[e.id];
    const original = translations[e.id];
    if (!candidate || !original) continue;
    const boxWidth = boxOf(e, measureWidth);
    if (!boxWidth) continue;
    const before = measureWidth(original, e.block) / boxWidth;
    const after = measureWidth(candidate, e.block) / boxWidth;
    if (measureWidth(candidate, e.block) > boxWidth * 0.995) continue; // would overflow
    if (after - before < minGain) continue; // not meaningfully better
    out[e.id] = candidate;
  }
  return out;
}
