import { describe, it, expect, beforeEach } from "vitest";
import { usePdfStore } from "./pdfStore.js";

const itemA = {
  id: "a1",
  str: "Hello world",
  x: 10,
  y: 20,
  width: 120,
  height: 14,
  fontSize: 12,
  fontFamily: "Arial",
  color: "#000000",
};
const itemB = {
  id: "b2",
  str: "Good morning",
  x: 10,
  y: 60,
  width: 120,
  height: 14,
  fontSize: 12,
  fontFamily: "Arial",
  color: "#000000",
};
const userBlock = {
  id: "new-1",
  str: "The cat sleeps",
  x: 50,
  y: 100,
  width: 120,
  height: 14,
  fontSize: 12,
  fontFamily: "Arial",
  color: "#000000",
};

beforeEach(() => {
  usePdfStore.getState().reset();
});

describe("setExtractedItems", () => {
  it("stores the current page's extracted items", () => {
    usePdfStore.getState().setExtractedItems(3, [itemA]);
    expect(usePdfStore.getState().extractedItems[3]).toEqual([itemA]);
  });
});

describe("applyPageTranslations", () => {
  it("applies extracted and user-added translations in ONE history entry", () => {
    const s = usePdfStore.getState();
    s.setExtractedItems(1, [itemA, itemB]);
    s.addTextBlock(1, userBlock); // history: 1
    const historyBefore = usePdfStore.getState().historyPast.length;

    usePdfStore.getState().applyPageTranslations(1, [
      { block: itemA, newStr: "Hola mundo", isExtracted: true },
      { block: userBlock, newStr: "El gato duerme", isExtracted: false },
    ]);

    const after = usePdfStore.getState();
    expect(after.historyPast.length).toBe(historyBefore + 1);

    const texts = after.editLayers[1].texts;
    const edited = texts.find((t) => t.id === "edited-a1");
    expect(edited.str).toBe("Hola mundo");
    expect(edited.isEdited).toBe(true);
    expect(edited.originalId).toBe("a1");
    expect(after.extractedEdits[1].a1).toBe("Hola mundo");
    expect(texts.find((t) => t.id === "new-1").str).toBe("El gato duerme");
  });

  it("one undo reverts the whole batch", () => {
    const s = usePdfStore.getState();
    s.setExtractedItems(1, [itemA]);
    s.addTextBlock(1, userBlock);

    s.applyPageTranslations(1, [
      { block: itemA, newStr: "Hola mundo", isExtracted: true },
      { block: userBlock, newStr: "El gato duerme", isExtracted: false },
    ]);

    usePdfStore.getState().undoEdit();

    const reverted = usePdfStore.getState();
    const texts = reverted.editLayers[1].texts;
    expect(texts.find((t) => t.id === "edited-a1")).toBeUndefined();
    expect(reverted.extractedEdits[1]).toBeUndefined();
    expect(texts.find((t) => t.id === "new-1").str).toBe("The cat sleeps");
  });

  it("re-running the batch updates the same edited blocks (no duplicates)", () => {
    const s = usePdfStore.getState();
    s.setExtractedItems(1, [itemA]);

    s.applyPageTranslations(1, [
      { block: itemA, newStr: "Hola mundo", isExtracted: true },
    ]);
    s.applyPageTranslations(1, [
      { block: itemA, newStr: "Hola, mundo entero", isExtracted: true },
    ]);

    const texts = usePdfStore.getState().editLayers[1].texts;
    const editedBlocks = texts.filter((t) => t.originalId === "a1");
    expect(editedBlocks).toHaveLength(1);
    expect(editedBlocks[0].str).toBe("Hola, mundo entero");
    expect(usePdfStore.getState().extractedEdits[1].a1).toBe(
      "Hola, mundo entero",
    );
  });

  it("clears selection and is a no-op for empty updates", () => {
    const s = usePdfStore.getState();
    s.setSelectedElement(userBlock, 1);
    const historyBefore = usePdfStore.getState().historyPast.length;

    s.applyPageTranslations(1, []);

    const after = usePdfStore.getState();
    expect(after.historyPast.length).toBe(historyBefore);
    expect(after.selectedElement).toBeNull();
  });
});

describe("OCR history", () => {
  beforeEach(() => {
    usePdfStore.getState().reset();
  });

  it("stores results newest-first and opens the newest in the modal", () => {
    const s = usePdfStore.getState();
    s.addOcrResult({ raw: "first run", engine: "e", page: 1 });
    s.addOcrResult({ raw: "second run", engine: "e", page: 2 });

    const { ocrHistory, ocrActive } = usePdfStore.getState();
    expect(ocrHistory.map((h) => h.raw)).toEqual(["second run", "first run"]);
    expect(ocrActive.raw).toBe("second run");
  });

  it("caps history at 3 by dropping the oldest", () => {
    const s = usePdfStore.getState();
    for (let i = 1; i <= 5; i++) {
      s.addOcrResult({ raw: `run ${i}`, engine: "e", page: i });
    }
    const { ocrHistory } = usePdfStore.getState();
    expect(ocrHistory.map((h) => h.raw)).toEqual(["run 5", "run 4", "run 3"]);
  });

  it("reopens any entry from history and closes with null", () => {
    const s = usePdfStore.getState();
    s.addOcrResult({ raw: "a", engine: "e", page: 1 });
    s.addOcrResult({ raw: "b", engine: "e", page: 1 });
    const oldest = usePdfStore.getState().ocrHistory[1];

    usePdfStore.getState().setOcrActive(oldest);
    expect(usePdfStore.getState().ocrActive.raw).toBe("a");

    usePdfStore.getState().setOcrActive(null);
    expect(usePdfStore.getState().ocrActive).toBeNull();
    // closing the modal keeps the history intact
    expect(usePdfStore.getState().ocrHistory).toHaveLength(2);
  });

  it("stamps each entry with a timestamp", () => {
    const s = usePdfStore.getState();
    const before = Date.now();
    s.addOcrResult({ raw: "x", engine: "e", page: 1 });
    const entry = usePdfStore.getState().ocrHistory[0];
    expect(entry.at).toBeGreaterThanOrEqual(before);
    expect(entry.at).toBeLessThanOrEqual(Date.now());
  });
});

describe("updateBlock — one action for the commit-then-update dance", () => {
  beforeEach(() => {
    usePdfStore.getState().reset();
  });

  it("patches a normal (user-added) block in place", () => {
    const s = usePdfStore.getState();
    s.addTextBlock(1, { ...userBlock, id: "plain-1" });
    usePdfStore
      .getState()
      .updateBlock(1, { ...userBlock, id: "plain-1" }, { fontSize: 20 });

    const layer = usePdfStore.getState().editLayers[1];
    expect(layer.texts.find((t) => t.id === "plain-1").fontSize).toBe(20);
  });

  it("commits an uncommitted extracted block and patches the edited copy", () => {
    const s = usePdfStore.getState();
    const extracted = {
      ...itemA,
      id: "ext-1",
      isExtracted: true,
      glyphs: [],
      kerning: [],
    };
    s.setSelectedElement(extracted, 1);

    usePdfStore.getState().updateBlock(1, extracted, { color: "#ff0000" });

    const after = usePdfStore.getState();
    const layer = after.editLayers[1];
    // committed copy exists with edited- id and carries the patch
    const edited = layer.texts.find((t) => t.id === "edited-ext-1");
    expect(edited).toBeDefined();
    expect(edited.color).toBe("#ff0000");
    // extractedEdits registry marks the original for whiteout
    expect(after.extractedEdits[1]["ext-1"]).toBe(itemA.str);
  });

  it("patches an already-edited extracted block in place", () => {
    const s = usePdfStore.getState();
    const extracted = {
      ...itemA,
      id: "ext-2",
      isExtracted: true,
      glyphs: [],
      kerning: [],
    };
    s.setSelectedElement(extracted, 1);
    usePdfStore.getState().updateBlock(1, extracted, { color: "#ff0000" });

    // second edit targets the committed copy directly
    const edited = usePdfStore
      .getState()
      .editLayers[1].texts.find((t) => t.id === "edited-ext-2");
    usePdfStore
      .getState()
      .updateBlock(1, { ...edited, isEdited: true }, { color: "#00ff00" });

    const finalBlock = usePdfStore
      .getState()
      .editLayers[1].texts.find((t) => t.id === "edited-ext-2");
    expect(finalBlock.color).toBe("#00ff00");
  });
});

describe("setFont — atomic two-field font change", () => {
  beforeEach(() => {
    usePdfStore.getState().reset();
  });

  it("writes fontName AND fontFamily together on a plain block", () => {
    const s = usePdfStore.getState();
    s.addTextBlock(1, { ...userBlock, id: "f-1" });
    usePdfStore.getState().setFont(1, { ...userBlock, id: "f-1" }, "NotoSerif");
    const b = usePdfStore
      .getState()
      .editLayers[1].texts.find((t) => t.id === "f-1");
    expect(b.fontName).toBe("NotoSerif");
    expect(b.fontFamily).toBe('"Noto Serif", Georgia, serif');
  });
});
