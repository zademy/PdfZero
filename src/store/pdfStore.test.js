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
