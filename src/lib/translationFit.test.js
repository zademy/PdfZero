import { describe, it, expect, vi } from "vitest";
import {
  charBudget,
  backSolvedBudget,
  isLightColor,
  sanitizeColor,
  buildPageEntries,
  fitTranslations,
  expansionItems,
  mergeExpansions,
  boxOf,
} from "./translationFit.js";

// Deterministic fake measurer: every char is 10px wide.
const measure = (text) => text.length * 10;
const measureWidth = (_text, _block) => measure(_text);

describe("charBudget — guidance budget from box width and average advance", () => {
  it("uses the original width and string length when available", () => {
    // box 100px, original 10 chars -> average advance 10 -> budget 10
    expect(charBudget({ originalWidth: 100, originalStr: "0123456789" })).toBe(
      10,
    );
  });

  it("falls back to averageAdvance then fontSize*0.5, floored at 3", () => {
    expect(charBudget({ originalWidth: 100, averageAdvance: 4 })).toBe(25);
    expect(charBudget({ originalWidth: 30, originalStr: "" })).toBe(5); // 30 / (12*0.5)
    expect(charBudget({ originalWidth: 4, originalStr: "" })).toBe(3); // floor
  });
});

describe("backSolvedBudget — char budget from a real measurement", () => {
  it("scales length by the box ratio with a 97% safety factor", () => {
    // 20 chars measured at 200px, box 100px -> 20 * 100 * 0.97 / 200 = 9.7 -> 9
    expect(backSolvedBudget(20, 100, 200)).toBe(9);
    expect(backSolvedBudget(10, 100, 50)).toBe(19); // measured shorter than box
  });

  it("never returns below 3", () => {
    expect(backSolvedBudget(1, 10, 1000)).toBe(3);
  });
});

describe("isLightColor / sanitizeColor", () => {
  it("detects light colors in hex, rgb() and named forms", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#fefefe")).toBe(true);
    expect(isLightColor("#000000")).toBe(false);
    expect(isLightColor("rgb(255, 254, 250)")).toBe(true);
    expect(isLightColor("rgba(10, 10, 10, 1)")).toBe(false);
    expect(isLightColor("white")).toBe(true);
    expect(isLightColor("red")).toBe(false);
    expect(isLightColor(null)).toBe(true);
    expect(isLightColor("unknown-thing")).toBe(false);
  });

  it("snaps near-white text to black only when the page is also light", () => {
    const block = { id: "a", color: "#fdfdfd" };
    expect(sanitizeColor(block, "#ffffff").color).toBe("#000000");
    expect(sanitizeColor(block, "#333333").color).toBe("#fdfdfd");
    expect(sanitizeColor({ id: "b", color: "#111111" }, "#ffffff").color).toBe(
      "#111111",
    );
  });
});

describe("buildPageEntries — assemble the page's translatable blocks", () => {
  const extractedItems = [
    { id: "e1", str: "Hello", x: 10, y: 20, originalWidth: 50 },
    { id: "e2", str: "world", x: 10, y: 40, originalWidth: 50 },
    { id: "e3", str: "   ", x: 10, y: 60, originalWidth: 50 }, // whitespace-only: skipped
  ];
  const layerTexts = [
    // committed edit of e1: translate its CURRENT text under the original id
    {
      id: "edited-e1",
      originalId: "e1",
      isEdited: true,
      str: "Hello (edited)",
      originalStr: "Hello",
      originalWidth: 50,
      averageAdvance: 5,
      x: 10,
      y: 20,
    },
    // user-added box: its own id, generous budget
    { id: "u1", str: "My note", x: 30, y: 80, width: 120 },
    // committed edit with no matching original: not translatable via entries
    { id: "edited-ghost", originalId: "ghost", isEdited: true, str: "x" },
  ];

  it("merges extracted + edited + user blocks with per-kind budgets", () => {
    const entries = buildPageEntries({
      extractedItems,
      layerTexts,
      pageBg: "#ffffff",
    });
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

    // e1 carries the edited text but the ORIGINAL's geometry/budget block
    expect(byId.e1.text).toBe("Hello (edited)");
    expect(byId.e1.kind).toBe("extracted");
    // budget uses averageAdvance 5 over width 50 -> 10
    expect(byId.e1.budget).toBe(10);

    // e2 untouched original
    expect(byId.e2.text).toBe("world");

    // user block: len 7 * 1.25 -> 9 (min 8)
    expect(byId.u1.kind).toBe("user");
    expect(byId.u1.budget).toBe(9);

    // whitespace-only and orphaned edits skipped
    expect(byId.e3).toBeUndefined();
    expect(entries).toHaveLength(3);
  });

  it("sanitizes near-white text against a light page background", () => {
    const items = [
      { id: "w", str: "ghost text", color: "#fefefe", originalWidth: 40 },
    ];
    const entries = buildPageEntries({
      extractedItems: items,
      layerTexts: [],
      pageBg: "#fafafa",
    });
    expect(entries[0].block.color).toBe("#000000");
  });
});

describe("fitTranslations — condense everything that measures over its box", () => {
  const ordered = [
    { id: "a", block: { originalWidth: 100 }, text: "x".repeat(20) }, // over: 200px > 101px
    { id: "b", block: { originalWidth: 300 }, text: "y".repeat(20) }, // fits: 200px <= 303px
  ];

  it("condenses over-width entries through the condense service and keeps shorter results", async () => {
    const condense = vi.fn(async (items) => ({
      ok: true,
      translations: Object.fromEntries(items.map((i) => [i.id, "short"])),
    }));
    const translations = { a: "x".repeat(20), b: "y".repeat(20) };

    const out = await fitTranslations(ordered, translations, {
      measureWidth,
      condense,
    });

    expect(condense).toHaveBeenCalledTimes(1);
    // back-solved budget for 'a': 20 * 100 * 0.97 / 200 = 9
    expect(condense.mock.calls[0][0]).toEqual([
      { id: "a", text: "x".repeat(20), budget: 9 },
    ]);
    expect(out.a).toBe("short");
    expect(out.b).toBe("y".repeat(20));
  });

  it("returns the map unchanged when everything fits or condense fails", async () => {
    const translations = { a: "x".repeat(20), b: "y".repeat(20) };
    const failing = async () => ({ ok: false });
    const out = await fitTranslations(ordered, translations, {
      measureWidth,
      condense: failing,
    });
    expect(out).toEqual(translations);
  });

  it("ignores entries with no box or no translation", async () => {
    const condense = vi.fn(async () => ({ ok: true, translations: {} }));
    const ordered2 = [
      { id: "nobox", block: {}, text: "abc" },
      { id: "notranslated", block: { originalWidth: 10 }, text: "abc" },
    ];
    await fitTranslations(ordered2, {}, { measureWidth, condense });
    expect(condense).not.toHaveBeenCalled();
  });

  it("re-condenses entries that still measure over their box, with a re-back-solved budget", async () => {
    // Round 1 candidate is shorter but still over-width → a second round
    // must run from the NEW text and accept the fitting result.
    const translations = { a: "x".repeat(20) }; // 200px > 100.5px box
    const replies = [
      { ok: true, translations: { a: "elevenchars" } }, // 110px: still over
      { ok: true, translations: { a: "five!" } }, // 50px: fits
    ];
    const condense = vi.fn(async () => replies.shift());
    const out = await fitTranslations(ordered, translations, {
      measureWidth,
      condense,
    });
    expect(condense).toHaveBeenCalledTimes(2);
    // round 2 budget back-solved from the round-1 text: ⌊11*100*0.97/110⌋ = 9
    expect(condense.mock.calls[1][0]).toEqual([
      { id: "a", text: "elevenchars", budget: 9 },
    ]);
    expect(out.a).toBe("five!");
  });

  it("keeps the shorter candidate when a later condense round fails", async () => {
    const translations = { a: "x".repeat(20) };
    const replies = [
      { ok: true, translations: { a: "elevenchars" } }, // still over, but shorter
      { ok: false },
    ];
    const condense = vi.fn(async () => replies.shift());
    const out = await fitTranslations(ordered, translations, {
      measureWidth,
      condense,
    });
    expect(condense).toHaveBeenCalledTimes(2);
    expect(out.a).toBe("elevenchars");
  });

  it("stops early when a round improves nothing", async () => {
    const translations = { a: "x".repeat(20) };
    const condense = vi.fn(async (items) => ({
      ok: true,
      translations: Object.fromEntries(items.map((i) => [i.id, i.text])), // echoes input
    }));
    await fitTranslations(ordered, translations, { measureWidth, condense });
    expect(condense).toHaveBeenCalledTimes(1);
  });
});

describe("expansionItems — which lines are short, and their budgets", () => {
  const measureWidth = (text) => text.length * 10; // 10px/char

  const entry = (id, text, { boxWidth = 100 } = {}) => ({
    id,
    kind: "extracted",
    block: { id: `b-${id}`, str: text, width: boxWidth, fontSize: 20 },
  });

  it("flags under-filled lines with a linear-scale budget (capped by maxGrow)", () => {
    // original fills the box (10 chars = 100px); translated 5 chars = 50px
    // (fill 0.5) → raw 9 chars, cap ⌈5×1.6⌉ = 8
    const e = entry("a", "abcdefghij");
    const out = expansionItems([e], { a: "abcde" }, { measureWidth });
    expect(out).toEqual([{ id: "a", text: "abcde", budget: 8 }]);
  });

  it("leaves lines at ≥ minFill alone", () => {
    const e = entry("a", "abcdefghi"); // 0.9 fill
    expect(expansionItems([e], { a: "abcdefghi" }, { measureWidth })).toEqual(
      [],
    );
  });

  it("never flags over-width lines (condense owns those)", () => {
    const e = entry("a", "abcdefghijklmnop");
    expect(
      expansionItems([e], { a: "abcdefghijklmnop" }, { measureWidth }),
    ).toEqual([]);
  });

  it("caps growth at maxGrow × original length", () => {
    // original fills the 200px box (20 chars); translated "ab" = 20px →
    // raw budget floor(200·0.95/10)=19, cap 2*1.6 = 4 (ceil)
    const e = entry("a", "abcdefghijklmnopqrst", { boxWidth: 200 });
    const out = expansionItems([e], { a: "ab" }, { measureWidth });
    expect(out[0].budget).toBe(4);
  });

  it("skips negligible budgets, blanks, single chars, no measurer", () => {
    const e = entry("a", "abcd", { boxWidth: 50 }); // raw 4 ≤ len+1 → skipped
    expect(expansionItems([e], { a: "abcd" }, { measureWidth })).toEqual([]);
    expect(expansionItems([e], { a: " " }, { measureWidth })).toEqual([]);
    expect(expansionItems([e], { a: "x" }, { measureWidth })).toEqual([]);
    expect(expansionItems([e], { a: "abcd" }, {})).toEqual([]);
  });
});

describe("mergeExpansions — accept only real, non-overflowing gains", () => {
  const measureWidth = (text) => text.length * 10;

  const entry = (id, { boxWidth = 100 } = {}) => ({
    id,
    kind: "extracted",
    text: "z".repeat(boxWidth / 10), // original glyphs fill the box
    block: {
      id: `b-${id}`,
      str: "z".repeat(boxWidth / 10),
      width: boxWidth,
      fontSize: 20,
    },
  });

  it("accepts a candidate that fills more and still fits", () => {
    const e = entry("a");
    const out = mergeExpansions(
      [e],
      { a: "abcde" }, // fill 0.5
      { a: "abcdefgh" }, // fill 0.8
      { measureWidth },
    );
    expect(out.a).toBe("abcdefgh");
  });

  it("rejects a candidate that would overflow the box", () => {
    const e = entry("a");
    const out = mergeExpansions(
      [e],
      { a: "abcde" },
      { a: "abcdefghijkl" }, // 120px > 100px
      { measureWidth },
    );
    expect(out.a).toBe("abcde");
  });

  it("rejects negligible improvement", () => {
    const fine = (text) => text.length * 2; // 2px/char → +1 char = +0.02 fill
    // original text sized for the fine measurer so the box stays 100
    const e = {
      id: "a",
      kind: "extracted",
      text: "f".repeat(50),
      block: { id: "b-a", str: "f".repeat(50), width: 100, fontSize: 20 },
    };
    const out = mergeExpansions(
      [e],
      { a: "abcdefgh" }, // 0.16
      { a: "abcdefghi" }, // 0.18 → gain 0.02 < 0.03
      { measureWidth: fine },
    );
    expect(out.a).toBe("abcdefgh");
  });

  it("returns translations untouched on bad input", () => {
    const e = entry("a");
    const t = { a: "abcde" };
    expect(mergeExpansions([e], t, null, { measureWidth })).toBe(t);
    expect(mergeExpansions([e], t, {}, {})).toBe(t);
  });
});

describe("boxOf — honest box clamps inflated geometry", () => {
  const measureWidth = (text) => text.length * 10; // 10px/char

  const entry = ({ width, originalWidth, text = "abcdefgh" }) => ({
    id: "x",
    kind: "extracted",
    text,
    block: { id: "b", str: text, width, originalWidth, fontSize: 20 },
  });

  it("clamps an inflated box to the original string's measured footprint", () => {
    // originalWidth claims 732 but the real glyphs occupy 80 → 80×1.02
    expect(boxOf(entry({ width: 732, originalWidth: 732 }), measureWidth)).toBe(
      81.6,
    );
  });

  it("keeps the geometry box when it is smaller than measured", () => {
    // originalWidth 60 beats width 50; glyphs measure 80 (over both), so the
    // declared geometry stands — strict is safe
    expect(boxOf(entry({ width: 50, originalWidth: 60 }), measureWidth)).toBe(
      60,
    );
  });

  it("degrades to the raw box without a measurer or original text", () => {
    expect(boxOf(entry({ width: 100 }), undefined)).toBe(100);
    const noText = { id: "x", block: { id: "b", width: 100 } };
    expect(boxOf(noText, measureWidth)).toBe(100);
  });

  it("fitTranslations condenses against the CLAMPED box, not the inflated one", async () => {
    // box claims 732; real footprint 81.6. A 300px translation must be
    // flagged over-width and condensed, even though 300 < 732.
    const e = entry({ width: 732, originalWidth: 732 });
    vi.mocked(vi.fn());
    const condense = vi.fn(async () => ({
      ok: true,
      translations: { x: "corta" },
    }));
    const out = await fitTranslations(
      [e],
      { x: "a".repeat(30) },
      { measureWidth, condense },
    );
    expect(condense).toHaveBeenCalled();
    expect(out.x).toBe("corta");
  });

  it("mergeExpansions rejects a candidate past the clamped box", () => {
    const e = entry({ width: 732, originalWidth: 732 }); // true box 81.6
    const out = mergeExpansions(
      [e],
      { x: "abcdefgh" }, // 80px, fill 0.98 of true box
      { x: "a".repeat(30) }, // 300px — would pass a 732 box, must fail the clamp
      { measureWidth },
    );
    expect(out.x).toBe("abcdefgh");
  });
});
