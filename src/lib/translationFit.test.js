import { describe, it, expect, vi } from "vitest";
import {
  charBudget,
  backSolvedBudget,
  isLightColor,
  sanitizeColor,
  buildPageEntries,
  fitTranslations,
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
});
